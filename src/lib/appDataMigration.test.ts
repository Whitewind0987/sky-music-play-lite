import { describe, expect, it, vi } from "vitest";
import type { PersistedAppData } from "../types/appData";
import { createLocalSongMetadata } from "./libraryCollections";
import { finalizeAppDataMigration } from "./appDataMigration";
import type { Song } from "../types/score";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
} from "../types/playbackOptions";
import { defaultKeyMapping } from "../types/keyMapping";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";

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

function createAppData(): PersistedAppData {
  const one = createSong("One");
  const two = createSong("Two");

  return {
    appDataVersion: 3,
    keyMapping: defaultKeyMapping,
    language: "zh-CN",
    library: {
      librarySongs: [
        {
          id: "local-1",
          importedAt: 1,
          metadata: createLocalSongMetadata(one),
          source: "local-import",
        },
        {
          id: "local-2",
          importedAt: 2,
          metadata: createLocalSongMetadata(two),
          source: "local-import",
        },
      ],
      likedSongs: [{ likedAt: 3, songId: "local-1" }],
      migrationFallbackSongs: { "local-1": one, "local-2": two },
      playlists: [
        {
          createdAt: 4,
          id: "playlist-1",
          name: "Playlist",
          songIds: ["local-1", "local-2"],
          updatedAt: 5,
        },
      ],
      selectedLibraryCategory: "playlists",
      selectedPlaylistId: "playlist-1",
      selectedSongIndex: 1,
    },
    playbackShortcuts: defaultPlaybackShortcuts,
    playbackSettings: {
      isShuffleEnabled: true,
      noteIntervalDelayMs: defaultNoteIntervalDelayMs,
      playbackMode: defaultPlaybackMode,
      playbackSpeed: defaultPlaybackSpeed,
    },
  };
}

describe("finalizeAppDataMigration", () => {
  it("persists v2 migration even when global reconciliation verifies nothing", async () => {
    const appData = createAppData();
    const saveAppData = vi.fn().mockResolvedValue(undefined);
    const result = await finalizeAppDataMigration({
      appData,
      reconcileReport: null,
      saveAppData,
      sourceVersion: 2,
    });

    expect(result.persisted).toBe(true);
    expect(result.appData.library.migrationFallbackSongs).toEqual(
      appData.library.migrationFallbackSongs,
    );
    expect(saveAppData).toHaveBeenCalledTimes(1);
  });

  it("removes only verified fallbacks and preserves all other app data", async () => {
    const appData = createAppData();
    const result = await finalizeAppDataMigration({
      appData,
      reconcileReport: {
        createdCount: 1,
        failed: [
          { error: "mismatch", songId: "local-2", songName: "Two" },
        ],
        renamedCount: 0,
        unchangedCount: 0,
        verifiedSongIds: ["local-1"],
      },
      saveAppData: vi.fn().mockResolvedValue(undefined),
      sourceVersion: 3,
    });

    expect(result.appData.library.migrationFallbackSongs).toEqual({
      "local-2": appData.library.migrationFallbackSongs?.["local-2"],
    });
    expect(result.appData.library.likedSongs).toEqual(
      appData.library.likedSongs,
    );
    expect(result.appData.library.playlists).toEqual(appData.library.playlists);
    expect(result.appData.library.selectedSongIndex).toBe(1);
    expect(result.appData.playbackSettings).toEqual(appData.playbackSettings);
  });

  it("keeps the complete original recovery state when v3 save fails", async () => {
    const appData = createAppData();
    const result = await finalizeAppDataMigration({
      appData,
      reconcileReport: {
        createdCount: 2,
        failed: [],
        renamedCount: 0,
        unchangedCount: 0,
        verifiedSongIds: ["local-1", "local-2"],
      },
      saveAppData: vi.fn().mockRejectedValue(new Error("disk full")),
      sourceVersion: 2,
    });

    expect(result.persisted).toBe(false);
    expect(result.persistenceError).toEqual(new Error("disk full"));
    expect(result.appData).toBe(appData);
    expect(result.appData.library.migrationFallbackSongs).toHaveProperty(
      "local-1",
    );
    expect(result.appData.library.migrationFallbackSongs).toHaveProperty(
      "local-2",
    );
  });
});
