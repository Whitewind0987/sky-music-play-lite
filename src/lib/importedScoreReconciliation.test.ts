import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LocalLibrarySong,
  MigrationFallbackSongs,
} from "../types/library";
import type { Song } from "../types/score";
import type { ImportedScoreReconcileReport } from "./tauriApi";
import { createLocalSongMetadata } from "./libraryCollections";
import {
  createImportedScoreReconcileEntries,
  reconcilePersistedImportedScores,
  reconcilePersistedImportedScoresWithProgress,
  resetImportedScoreReconciliationForTests,
  retainUnverifiedMigrationFallbackSongs,
  type ImportedScoreReconciliationText,
} from "./importedScoreReconciliation";

const text: ImportedScoreReconciliationText = {
  importedScoreReconcileCommandFailed: "command: {error}",
  importedScoreReconcileFailed: "{songName} {songId}: {error}",
  importedScoreReconcileFailedSummary: "{count} failures",
  importedScoreReconcileSucceeded: "created {createdCount}, renamed {renamedCount}",
};

function createSong(name: string): Song {
  return {
    bitsPerPage: 16,
    bpm: 120,
    isComposed: false,
    name,
    pitchLevel: 0,
    songNotes: [{ key: "1Key0", time: 0 }],
  };
}

function createLibrarySong(id: string, name: string): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: createLocalSongMetadata(createSong(name)),
    source: "local-import",
  };
}

function createReport(
  overrides: Partial<ImportedScoreReconcileReport> = {},
): ImportedScoreReconcileReport {
  return {
    createdCount: 0,
    failed: [],
    renamedCount: 0,
    unchangedCount: 0,
    verifiedSongIds: [],
    ...overrides,
  };
}

describe("imported score migration reconciliation", () => {
  beforeEach(() => {
    resetImportedScoreReconciliationForTests();
  });

  it("creates zero entries for a clean metadata-only v3 library", () => {
    expect(
      createImportedScoreReconcileEntries(
        [createLibrarySong("local-1", "One")],
        {},
      ),
    ).toEqual([]);
  });

  it("creates entries only for fallback songs that still have metadata", () => {
    const one = createSong("One");
    const orphan = createSong("Orphan");

    expect(
      createImportedScoreReconcileEntries(
        [createLibrarySong("local-1", "One")],
        { "local-1": one, "local-orphan": orphan },
      ),
    ).toEqual([{ song: one, songId: "local-1" }]);
  });

  it("removes only explicitly verified fallback IDs", () => {
    const fallbacks: MigrationFallbackSongs = {
      "local-1": createSong("One"),
      "local-2": createSong("Two"),
      "local-3": createSong("Three"),
    };

    expect(
      retainUnverifiedMigrationFallbackSongs(
        fallbacks,
        createReport({ verifiedSongIds: ["local-1", "local-3"] }),
      ),
    ).toEqual({ "local-2": fallbacks["local-2"] });
  });

  it("retains every fallback after a global command failure", () => {
    const fallbacks = { "local-1": createSong("One") };

    expect(retainUnverifiedMigrationFallbackSongs(fallbacks, null)).toEqual(
      fallbacks,
    );
  });

  it("does not invoke Rust for metadata-only v3 startup", async () => {
    const reconcileImportedScoreFiles = vi.fn();

    await reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [createLibrarySong("local-1", "One")],
      migrationFallbackSongs: {},
      reconcileImportedScoreFiles,
      text,
    });

    expect(reconcileImportedScoreFiles).not.toHaveBeenCalled();
  });

  it("logs per-song failures and only one summary notice", async () => {
    const appendLog = vi.fn();
    const showNotice = vi.fn();
    const song = createSong("One");

    await reconcilePersistedImportedScores({
      appendLog,
      librarySongs: [createLibrarySong("local-1", "One")],
      migrationFallbackSongs: { "local-1": song },
      reconcileImportedScoreFiles: vi.fn().mockResolvedValue(
        createReport({
          failed: [
            { error: "mismatch", songId: "local-1", songName: "One" },
          ],
        }),
      ),
      showNotice,
      text,
    });

    expect(appendLog).toHaveBeenCalledWith("One local-1: mismatch");
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith("1 failures");
  });

  it("reports a global command failure without verifying IDs", async () => {
    const appendLog = vi.fn();
    const song = createSong("One");
    const report = await reconcilePersistedImportedScores({
      appendLog,
      librarySongs: [createLibrarySong("local-1", "One")],
      migrationFallbackSongs: { "local-1": song },
      reconcileImportedScoreFiles: vi.fn().mockRejectedValue(new Error("IPC")),
      text,
    });

    expect(report).toBeNull();
    expect(appendLog).toHaveBeenCalledWith("command: Error: IPC");
  });

  it("deduplicates concurrent reconciliation for the same fallback set", async () => {
    const song = createSong("One");
    let resolveReport: (report: ImportedScoreReconcileReport) => void = () => {};
    const activeReport = new Promise<ImportedScoreReconcileReport>((resolve) => {
      resolveReport = resolve;
    });
    const reconcileImportedScoreFiles = vi.fn(() => activeReport);
    const options = {
      appendLog: vi.fn(),
      librarySongs: [createLibrarySong("local-1", "One")],
      migrationFallbackSongs: { "local-1": song },
      reconcileImportedScoreFiles,
      text,
    };

    const first = reconcilePersistedImportedScores(options);
    const second = reconcilePersistedImportedScores(options);

    resolveReport(createReport({ verifiedSongIds: ["local-1"] }));
    await Promise.all([first, second]);

    expect(reconcileImportedScoreFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps deletion blocked for the duration of reconciliation", async () => {
    const progressStates: boolean[] = [];
    const song = createSong("One");

    await reconcilePersistedImportedScoresWithProgress({
      appendLog: vi.fn(),
      librarySongs: [createLibrarySong("local-1", "One")],
      migrationFallbackSongs: { "local-1": song },
      reconcileImportedScoreFiles: vi.fn(async () => {
        expect(progressStates).toEqual([true]);
        return createReport({ verifiedSongIds: ["local-1"] });
      }),
      setInProgress: (inProgress) => progressStates.push(inProgress),
      text,
    });

    expect(progressStates).toEqual([true, false]);
  });
});
