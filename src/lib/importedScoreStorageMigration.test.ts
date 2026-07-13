import { describe, expect, it, vi } from "vitest";
import type { LocalLibrarySong } from "../types/library";
import type { ImportedScoreStorageMigrationReport } from "./tauriApi";
import {
  collectImportedScoreStorageMigrationIds,
  migrateImportedScoreStorageBeforeListing,
} from "./importedScoreStorageMigration";

function song(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: id,
      isComposed: false,
      lastNoteTimeMs: 0,
      name: id,
      noteCount: 0,
      noteGroupCount: 0,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

function report(
  failed: ImportedScoreStorageMigrationReport["failed"] = [],
): ImportedScoreStorageMigrationReport {
  return {
    deduplicatedCount: 0,
    failed,
    migratedCount: 0,
    renamedCount: 0,
    unchangedCount: 0,
  };
}

describe("imported score storage migration", () => {
  it("collects unique normal persisted local song IDs", () => {
    expect(
      collectImportedScoreStorageMigrationIds(
        [song("local-1"), song("local-2"), song("local-1")],
        {},
      ),
    ).toEqual(["local-1", "local-2"]);
  });

  it("excludes IDs with unresolved migration fallback data", () => {
    expect(
      collectImportedScoreStorageMigrationIds(
        [song("local-1"), song("local-2")],
        { "local-1": {} as never },
      ),
    ).toEqual(["local-2"]);
  });

  it("rejects without consuming the missing-file list when migration fails", async () => {
    const listFiles = vi.fn();
    const onDetailedLog = vi.fn();

    await expect(
      migrateImportedScoreStorageBeforeListing({
        librarySongs: [song("local-1")],
        listFiles,
        migrateStorage: vi.fn().mockRejectedValue(new Error("scan failed")),
        onDetailedLog,
        unresolvedFallbackSongs: {},
      }),
    ).rejects.toThrow("scan failed");
    expect(listFiles).not.toHaveBeenCalled();
    expect(onDetailedLog).toHaveBeenCalledWith({
      details: { error: "Error: scan failed" },
      level: "warn",
      message: "Imported score storage migration failed",
      source: "imported-score-storage",
    });
  });

  it("protects per-song failures from missing-song cleanup", async () => {
    const result = await migrateImportedScoreStorageBeforeListing({
      librarySongs: [song("local-1")],
      listFiles: vi.fn().mockResolvedValue([]),
      migrateStorage: vi
        .fn()
        .mockResolvedValue(report([{ songId: "local-1", error: "conflict" }])),
      unresolvedFallbackSongs: {},
    });

    expect(result.fileMetadata).toEqual([]);
    expect(result.protectedSongIds).toEqual(["local-1"]);
    expect(result.report.failed).toEqual([
      { songId: "local-1", error: "conflict" },
    ]);
  });

  it("completes migration before listing files", async () => {
    const order: string[] = [];

    await migrateImportedScoreStorageBeforeListing({
      librarySongs: [song("local-1")],
      migrateStorage: vi.fn(async () => {
        order.push("migrate");
        return report();
      }),
      listFiles: vi.fn(async () => {
        order.push("list");
        return [];
      }),
      unresolvedFallbackSongs: {},
    });

    expect(order).toEqual(["migrate", "list"]);
  });

  it("writes one detailed completion entry with the complete report", async () => {
    const migrationReport = report([
      { songId: "local-1", error: "conflict details" },
    ]);
    migrationReport.migratedCount = 4;
    migrationReport.renamedCount = 2;
    migrationReport.deduplicatedCount = 1;
    migrationReport.unchangedCount = 1;
    const onDetailedLog = vi.fn();

    const result = await migrateImportedScoreStorageBeforeListing({
      librarySongs: [song("local-1")],
      listFiles: vi.fn().mockResolvedValue([]),
      migrateStorage: vi.fn().mockResolvedValue(migrationReport),
      onDetailedLog,
      unresolvedFallbackSongs: {},
    });

    expect(result.report).toBe(migrationReport);
    expect(onDetailedLog).toHaveBeenCalledTimes(1);
    expect(onDetailedLog).toHaveBeenCalledWith({
      details: migrationReport,
      level: "warn",
      message: "Imported score storage migration completed",
      source: "imported-score-storage",
    });
  });
});
