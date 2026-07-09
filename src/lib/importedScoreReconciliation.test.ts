import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibrarySong } from "../types/library";
import type { Song } from "../types/score";
import {
  createImportedScoreReconcileEntries,
  reconcilePersistedImportedScores,
  resetImportedScoreReconciliationForTests,
  type ImportedScoreReconciliationText,
} from "./importedScoreReconciliation";
import type { ImportedScoreReconcileReport } from "./tauriApi";

const reconciliationText: ImportedScoreReconciliationText = {
  importedScoreReconcileCommandFailed: "command failed: {error}",
  importedScoreReconcileFailed:
    "failed {songName} ({songId}): {error}",
  importedScoreReconcileFailedSummary: "{count} failures",
  importedScoreReconcileSucceeded:
    "created {createdCount}, renamed {renamedCount}",
};

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    name: "Test Song",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [
      { time: 0, key: "1Key0" },
      { time: 500, key: "1Key1" },
    ],
    ...overrides,
  };
}

function createLibrarySong(overrides: Partial<LibrarySong> = {}): LibrarySong {
  return {
    id: "local-test-1",
    importedAt: 1,
    song: createSong(),
    source: "local-import",
    ...overrides,
  };
}

function createReconcileReport(
  overrides: Partial<ImportedScoreReconcileReport> = {},
): ImportedScoreReconcileReport {
  return {
    createdCount: 0,
    failed: [],
    renamedCount: 0,
    unchangedCount: 0,
    ...overrides,
  };
}

describe("createImportedScoreReconcileEntries", () => {
  it("sends only persisted local imports to startup reconciliation", () => {
    const localSong = createLibrarySong({
      id: "local-keep",
      song: createSong({ name: "Local" }),
    });
    const builtInSong = createLibrarySong({
      id: "builtin-skip",
      song: createSong({ name: "Built In" }),
      source: "built-in",
    });

    expect(createImportedScoreReconcileEntries([builtInSong, localSong])).toEqual([
      {
        song: localSong.song,
        songId: "local-keep",
      },
    ]);
  });

  it("passes internal ids and complete normalized song objects unchanged", () => {
    const normalizedSong = createSong({
      bitsPerPage: 15,
      bpm: 90,
      isComposed: true,
      name: "Normalized",
      pitchLevel: 1,
      songNotes: [
        { time: 0, key: "1Key0" },
        { time: 250, key: "1Key1" },
      ],
    });
    const localSong = createLibrarySong({
      id: "local-normalized",
      song: normalizedSong,
    });
    const [entry] = createImportedScoreReconcileEntries([localSong]);

    expect(entry).toEqual({
      song: normalizedSong,
      songId: "local-normalized",
    });
    expect(entry?.song).toBe(normalizedSong);
  });
});

describe("reconcilePersistedImportedScores", () => {
  beforeEach(() => {
    resetImportedScoreReconciliationForTests();
  });

  it("invokes startup reconciliation only once for the same loaded AppData", async () => {
    const localSong = createLibrarySong();
    const reconcileImportedScoreFiles = vi
      .fn()
      .mockResolvedValue(createReconcileReport());

    await reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [localSong],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });
    await reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [localSong],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });

    expect(reconcileImportedScoreFiles).toHaveBeenCalledTimes(1);
  });

  it("does not start a duplicate run while the same startup data is active", async () => {
    const localSong = createLibrarySong();
    let resolveReport: (report: ImportedScoreReconcileReport) => void = () => {};
    const activeReport = new Promise<ImportedScoreReconcileReport>((resolve) => {
      resolveReport = resolve;
    });
    const reconcileImportedScoreFiles = vi.fn(() => activeReport);

    const firstRun = reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [localSong],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });
    const duplicateRun = reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [localSong],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });

    resolveReport(createReconcileReport());

    await Promise.all([firstRun, duplicateRun]);

    expect(reconcileImportedScoreFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps library state, likes, playlists, selection, and playback settings unchanged on failures", async () => {
    const persistedState = {
      librarySongs: [
        createLibrarySong({
          id: "local-failing",
          song: createSong({ name: "Failing" }),
        }),
      ],
      likedSongs: [{ likedAt: 10, songId: "local-failing" }],
      playbackSettings: {
        isShuffleEnabled: true,
        noteIntervalDelayMs: 25,
        playbackMode: "repeat-all",
        playbackSpeed: 1.25,
      },
      playlists: [
        {
          createdAt: 1,
          id: "playlist-1",
          name: "Playlist",
          songIds: ["local-failing"],
          updatedAt: 2,
        },
      ],
      selectedSongIndex: 0,
    };
    const beforeReconciliation = JSON.stringify(persistedState);
    const reconcileImportedScoreFiles = vi.fn().mockResolvedValue(
      createReconcileReport({
        failed: [
          {
            error: "corrupt file",
            songId: "local-failing",
            songName: "Failing",
          },
        ],
      }),
    );

    await reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: persistedState.librarySongs,
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });

    expect(JSON.stringify(persistedState)).toBe(beforeReconciliation);
  });

  it("shows one notice for multiple per-song failures", async () => {
    const appendLog = vi.fn();
    const showNotice = vi.fn();
    const reconcileImportedScoreFiles = vi.fn().mockResolvedValue(
      createReconcileReport({
        failed: [
          {
            error: "invalid JSON",
            songId: "local-one",
            songName: "One",
          },
          {
            error: "permission denied",
            songId: "local-two",
            songName: "Two",
          },
        ],
      }),
    );

    await reconcilePersistedImportedScores({
      appendLog,
      librarySongs: [
        createLibrarySong({ id: "local-one", song: createSong({ name: "One" }) }),
        createLibrarySong({ id: "local-two", song: createSong({ name: "Two" }) }),
      ],
      reconcileImportedScoreFiles,
      showNotice,
      text: reconciliationText,
    });

    expect(appendLog).toHaveBeenCalledTimes(2);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith("2 failures");
  });

  it("logs a summary when files are created or renamed", async () => {
    const appendLog = vi.fn();
    const reconcileImportedScoreFiles = vi.fn().mockResolvedValue(
      createReconcileReport({
        createdCount: 1,
        renamedCount: 2,
      }),
    );

    await reconcilePersistedImportedScores({
      appendLog,
      librarySongs: [createLibrarySong()],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });

    expect(appendLog).toHaveBeenCalledWith("created 1, renamed 2");
  });

  it("does not invoke Rust reconciliation when there are no local imports", async () => {
    const reconcileImportedScoreFiles = vi.fn();

    await reconcilePersistedImportedScores({
      appendLog: vi.fn(),
      librarySongs: [
        createLibrarySong({
          id: "builtin-only",
          source: "built-in",
        }),
      ],
      reconcileImportedScoreFiles,
      text: reconciliationText,
    });

    expect(reconcileImportedScoreFiles).not.toHaveBeenCalled();
  });
});
