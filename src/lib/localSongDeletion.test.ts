import { describe, expect, it } from "vitest";
import type { LibrarySong, LibrarySongId } from "../types/library";
import { createLocalSongMetadata } from "./libraryCollections";
import { deleteLocalSongWithScoreFile } from "./localSongDeletion";
import { ImportedScoreSongLoader } from "./importedScoreSongLoader";
import type { Song } from "../types/score";

function createCompleteSong(): Song {
  return {
    name: "Local Song",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [{ time: 0, key: "1Key0" }],
  };
}

function createLocalSong(id: LibrarySongId = "local-1"): LibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: createLocalSongMetadata(createCompleteSong()),
    source: "local-import",
  };
}

function createBuiltInSong(): LibrarySong {
  return {
    id: "builtin-1",
    importedAt: 0,
    isBuiltInLoaded: false,
    song: {
      name: "Built In",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: false,
      songNotes: [],
    },
    source: "built-in",
  };
}

describe("deleteLocalSongWithScoreFile", () => {
  it("returns false without touching storage when the target is missing", async () => {
    let deleteCallCount = 0;
    let cleanupCallCount = 0;

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async () => {
        deleteCallCount += 1;
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: () => {
        cleanupCallCount += 1;
      },
      songIndex: 0,
    });

    expect(didDelete).toBe(false);
    expect(deleteCallCount).toBe(0);
    expect(cleanupCallCount).toBe(0);
  });

  it("returns false without touching storage when the target is not local", async () => {
    let deleteCallCount = 0;

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async () => {
        deleteCallCount += 1;
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createBuiltInSong()],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: () => {},
      songIndex: 0,
    });

    expect(didDelete).toBe(false);
    expect(deleteCallCount).toBe(0);
  });

  it("does not remove the song when filesystem deletion fails", async () => {
    const logs: string[] = [];
    const notices: string[] = [];
    let cleanupCallCount = 0;
    let playbackCleanupCallCount = 0;

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: (entry) => logs.push(entry),
      deleteScoreFile: async () => {
        throw new Error("permission denied");
      },
      formatDeleteFailure: (songName, error) =>
        `${songName}: ${error instanceof Error ? error.message : String(error)}`,
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onDeleted: () => {
        playbackCleanupCallCount += 1;
      },
      onSuccessfulDelete: () => {
        cleanupCallCount += 1;
      },
      showNotice: (message) => notices.push(message),
      songIndex: 0,
    });

    expect(didDelete).toBe(false);
    expect(cleanupCallCount).toBe(0);
    expect(playbackCleanupCallCount).toBe(0);
    expect(logs).toEqual(["Local Song: permission denied"]);
    expect(notices).toEqual(["Local Song: permission denied"]);
  });

  it("does not invalidate cache when filesystem deletion fails", async () => {
    const invalidatedSongIds: LibrarySongId[] = [];

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async (songId) => {
        throw new Error(`delete failed ${songId}`);
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: () => {
        invalidatedSongIds.push("local-1");
      },
      songIndex: 0,
    });

    expect(didDelete).toBe(false);
    expect(invalidatedSongIds).toEqual([]);
  });

  it("treats a missing score file as a successful deletion", async () => {
    const order: string[] = [];

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async () => {
        order.push("delete-score-file");
        return false;
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => order.push("stop-playback"),
      onDeleted: () => order.push("playback-cleanup"),
      onSuccessfulDelete: () => order.push("library-cleanup"),
      songIndex: 0,
      stopPlaybackBeforeDelete: true,
    });

    expect(didDelete).toBe(true);
    expect(order).toEqual([
      "delete-score-file",
      "stop-playback",
      "playback-cleanup",
      "library-cleanup",
    ]);
  });

  it("allows cache invalidation when a missing score file still counts as deleted", async () => {
    const invalidatedSongIds: LibrarySongId[] = [];

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async (songId) => {
        invalidatedSongIds.push(songId);
        return false;
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: () => {},
      songIndex: 0,
    });

    expect(didDelete).toBe(true);
    expect(invalidatedSongIds).toEqual(["local-1"]);
  });

  it("runs playback and library cleanup exactly once after successful deletion", async () => {
    let queueCleanupCount = 0;
    let playbackOrderCleanupCount = 0;
    let libraryCleanupCount = 0;
    const invalidatedSongIds: LibrarySongId[] = [];

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async (songId) => {
        invalidatedSongIds.push(songId);
        return true;
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onDeleted: (deletedSongIndex, deletedSongId) => {
        expect(deletedSongIndex).toBe(0);
        expect(deletedSongId).toBe("local-1");
        queueCleanupCount += 1;
        playbackOrderCleanupCount += 1;
      },
      onSuccessfulDelete: () => {
        libraryCleanupCount += 1;
      },
      songIndex: 0,
    });

    expect(didDelete).toBe(true);
    expect(queueCleanupCount).toBe(1);
    expect(playbackOrderCleanupCount).toBe(1);
    expect(libraryCleanupCount).toBe(1);
    expect(invalidatedSongIds).toEqual(["local-1"]);
  });

  it("removes fallback and cache only after successful deletion", async () => {
    const loader = new ImportedScoreSongLoader();
    const fallbacks: Record<string, Song> = {
      "local-1": createCompleteSong(),
    };
    loader.seed("local-1", createCompleteSong());

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async (songId) => {
        loader.invalidate(songId);
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: (song) => {
        delete fallbacks[song.id];
      },
      songIndex: 0,
    });

    expect(didDelete).toBe(true);
    expect(loader.getCachedSong("local-1")).toBeNull();
    expect(fallbacks).toEqual({});
  });

  it("preserves fallback and cache after filesystem deletion failure", async () => {
    const loader = new ImportedScoreSongLoader();
    const cachedSong = createCompleteSong();
    const fallbacks: Record<string, Song> = { "local-1": cachedSong };
    loader.seed("local-1", cachedSong);

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async () => {
        throw new Error("permission denied");
      },
      formatDeleteFailure: () => "failed",
      librarySongs: [createLocalSong()],
      onBeforeLibraryMutation: () => {},
      onSuccessfulDelete: (song) => {
        loader.invalidate(song.id);
        delete fallbacks[song.id];
      },
      songIndex: 0,
    });

    expect(didDelete).toBe(false);
    expect(loader.getCachedSong("local-1")).toBe(cachedSong);
    expect(fallbacks).toEqual({ "local-1": cachedSong });
  });
});
