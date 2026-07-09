import { describe, expect, it } from "vitest";
import type { LibrarySong, LibrarySongId } from "../types/library";
import { deleteLocalSongWithScoreFile } from "./localSongDeletion";

function createLocalSong(id: LibrarySongId = "local-1"): LibrarySong {
  return {
    id,
    importedAt: 1,
    song: {
      name: "Local Song",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: false,
      songNotes: [{ time: 0, key: "1Key0" }],
    },
    source: "local-import",
  };
}

function createBuiltInSong(): LibrarySong {
  return {
    ...createLocalSong("builtin-1"),
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

  it("runs playback and library cleanup exactly once after successful deletion", async () => {
    let queueCleanupCount = 0;
    let playbackOrderCleanupCount = 0;
    let libraryCleanupCount = 0;

    const didDelete = await deleteLocalSongWithScoreFile({
      appendLog: () => {},
      deleteScoreFile: async () => true,
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
  });
});
