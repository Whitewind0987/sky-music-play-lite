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

    await expect(
      migrateImportedScoreStorageBeforeListing({
        librarySongs: [song("local-1")],
        listFiles,
        migrateStorage: vi.fn().mockRejectedValue(new Error("scan failed")),
        unresolvedFallbackSongs: {},
      }),
    ).rejects.toThrow("scan failed");
    expect(listFiles).not.toHaveBeenCalled();
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

    expect(result.fileMetadata.map((file) => file.id)).toEqual(["local-1"]);
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
});
