import { describe, expect, it, vi } from "vitest";
import { defaultKeyMapping } from "../types/keyMapping";
import type { LocalLibrarySong, MigrationFallbackSongs } from "../types/library";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
} from "../types/playbackOptions";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import type { Song } from "../types/score";
import { buildPersistedAppData } from "./appData";
import {
  migrateLegacyImportedScoreFallbacks,
  shouldRunTrustedStorageReconciliation,
} from "./importedScoreLegacyMigration";
import {
  decideImportedScoreStorageTrust,
  recoverAndCleanupImportedScoreLibrary,
} from "./importedScoreRecovery";
import { createLocalSongMetadata } from "./libraryCollections";
import type { ImportedScoreReconcileReport } from "./tauriApi";

const currentStoragePath = "D:\\App\\imported-scores";

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

function createLibrarySong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: createLocalSongMetadata(createSong(id)),
    source: "local-import",
  };
}

function createAppData({
  fallbackSongs = {},
  importedScoreStoragePath,
  librarySongs = [],
}: {
  fallbackSongs?: MigrationFallbackSongs;
  importedScoreStoragePath?: string;
  librarySongs?: LocalLibrarySong[];
} = {}) {
  return buildPersistedAppData({
    importedScoreStoragePath,
    isShuffleEnabled: false,
    keyMapping: defaultKeyMapping,
    language: "zh-CN",
    librarySongs,
    likedSongs: [],
    migrationFallbackSongs: fallbackSongs,
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackMode: defaultPlaybackMode,
    playbackShortcuts: defaultPlaybackShortcuts,
    playbackSpeed: defaultPlaybackSpeed,
    playlists: [],
    selectedLibraryCategory: "local-imports",
    selectedPlaylistId: null,
    selectedSongIndex: null,
  });
}

function report(
  verifiedSongIds: string[],
  failed: ImportedScoreReconcileReport["failed"] = [],
): ImportedScoreReconcileReport {
  return {
    createdCount: verifiedSongIds.length,
    failed,
    renamedCount: 0,
    unchangedCount: 0,
    verifiedSongIds,
  };
}

describe("explicit legacy imported score migration", () => {
  it("migrates fallback data before trust and establishes matching-path trust", async () => {
    const fullSong = createSong("One");
    const reconcile = vi.fn().mockResolvedValue(report(["local-1"]));
    const result = await migrateLegacyImportedScoreFallbacks({
      appData: createAppData({
        fallbackSongs: { "local-1": fullSong },
        librarySongs: [createLibrarySong("local-1")],
      }),
      currentStoragePath,
      reconcile,
    });

    expect(reconcile).toHaveBeenCalledOnce();
    expect(result.didRunLegacyFallbackMigration).toBe(true);
    expect(result.appData.library.migrationFallbackSongs).toBeUndefined();
    expect(result.appData.importedScoreStoragePath).toBe(currentStoragePath);
    expect(decideImportedScoreStorageTrust({
      currentStoragePath,
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    })).toEqual({ reason: "matching-path", trusted: true });
  });

  it("keeps failed fallback bodies intact and prevents a second reconciliation", async () => {
    const firstSong = createSong("One");
    const secondSong = createSong("Two");
    const reconcile = vi.fn().mockResolvedValue(report(
      ["local-1"],
      [{ error: "write failed", songId: "local-2", songName: "Two" }],
    ));
    const result = await migrateLegacyImportedScoreFallbacks({
      appData: createAppData({
        fallbackSongs: { "local-1": firstSong, "local-2": secondSong },
        librarySongs: [
          createLibrarySong("local-1"),
          createLibrarySong("local-2"),
        ],
      }),
      currentStoragePath,
      reconcile,
    });

    expect(result.appData.library.migrationFallbackSongs).toEqual({
      "local-2": secondSong,
    });
    expect(result.appData.library.migrationFallbackSongs?.["local-2"])
      .toStrictEqual(secondSong);
    expect(result.appData.importedScoreStoragePath).toBe(currentStoragePath);
    expect(shouldRunTrustedStorageReconciliation(
      result.didRunLegacyFallbackMigration,
    )).toBe(false);
    expect(reconcile).toHaveBeenCalledOnce();

    const trust = decideImportedScoreStorageTrust({
      currentStoragePath,
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    });
    const cleanup = await recoverAndCleanupImportedScoreLibrary({
      appData: result.appData,
      fileMetadata: [{
        fileName: "One__local-1.txt",
        id: "local-1",
        modifiedMs: 1,
        path: `${currentStoragePath}\\One__local-1.txt`,
        sizeBytes: 1,
      }],
      readSong: vi.fn(),
      trust,
    });

    expect(cleanup.removedSongIds).toEqual([]);
    expect(cleanup.appData.library.librarySongs.map(({ id }) => id)).toEqual([
      "local-1",
      "local-2",
    ]);
    expect(cleanup.appData.library.migrationFallbackSongs?.["local-2"])
      .toStrictEqual(secondSong);
  });

  it("leaves fallback data and storage path unchanged after command failure", async () => {
    const fullSong = createSong("One");
    const appData = createAppData({
      fallbackSongs: { "local-1": fullSong },
      librarySongs: [createLibrarySong("local-1")],
    });
    const result = await migrateLegacyImportedScoreFallbacks({
      appData,
      currentStoragePath,
      reconcile: vi.fn().mockResolvedValue(null),
    });

    expect(result).toEqual({
      appData,
      didRunLegacyFallbackMigration: false,
    });
    expect(decideImportedScoreStorageTrust({
      currentStoragePath,
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    })).toEqual({ reason: "unverified-legacy-path", trusted: false });
  });

  it("does not bypass path-mismatch protection", async () => {
    const reconcile = vi.fn();
    const result = await migrateLegacyImportedScoreFallbacks({
      appData: createAppData({
        importedScoreStoragePath: "C:\\OldInstall\\imported-scores",
        librarySongs: [createLibrarySong("local-1")],
      }),
      currentStoragePath: "D:\\NewInstall\\imported-scores",
      reconcile,
    });

    expect(reconcile).not.toHaveBeenCalled();
    expect(decideImportedScoreStorageTrust({
      currentStoragePath: "D:\\NewInstall\\imported-scores",
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    })).toEqual({ reason: "path-mismatch", trusted: false });
  });

  it("leaves an already migrated user on the normal trusted flow", async () => {
    const reconcile = vi.fn();
    const result = await migrateLegacyImportedScoreFallbacks({
      appData: createAppData({
        importedScoreStoragePath: currentStoragePath,
        librarySongs: [createLibrarySong("local-1")],
      }),
      currentStoragePath,
      reconcile,
    });

    expect(result.didRunLegacyFallbackMigration).toBe(false);
    expect(shouldRunTrustedStorageReconciliation(
      result.didRunLegacyFallbackMigration,
    )).toBe(true);
    expect(reconcile).not.toHaveBeenCalled();
    expect(decideImportedScoreStorageTrust({
      currentStoragePath,
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    })).toEqual({ reason: "matching-path", trusted: true });
  });

  it("does not create fallback state or reconcile for a fresh user", async () => {
    const reconcile = vi.fn();
    const appData = createAppData();
    const result = await migrateLegacyImportedScoreFallbacks({
      appData,
      currentStoragePath,
      reconcile,
    });

    expect(result).toEqual({
      appData,
      didRunLegacyFallbackMigration: false,
    });
    expect(result.appData.library.migrationFallbackSongs).toBeUndefined();
    expect(reconcile).not.toHaveBeenCalled();
    expect(decideImportedScoreStorageTrust({
      currentStoragePath,
      fileMetadata: [],
      librarySongs: result.appData.library.librarySongs,
      persistedStoragePath: result.appData.importedScoreStoragePath,
    })).toEqual({ reason: "empty-library", trusted: true });
  });
});
