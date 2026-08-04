import { describe, expect, it, vi } from "vitest";
import type { LocalLibrarySong } from "../types/library";
import {
  resolvePlaylistSongIndices,
  startPlaylistPlaybackQueue,
} from "./playlistPlayback";

function createSong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 0,
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

describe("playlist Play All", () => {
  it("resolves every valid playlist song in playlist order", () => {
    const songs = [createSong("a"), createSong("b"), createSong("c")];

    expect(resolvePlaylistSongIndices(["c", "missing", "a", "b"], songs)).toEqual([
      2,
      0,
      1,
    ]);
  });

  it("starts the first song and atomically replaces an existing queue", async () => {
    let queue = [9];
    const startFirstSong = vi.fn(async () => true);

    await expect(
      startPlaylistPlaybackQueue({
        replaceQueue: (songIndices) => {
          queue = [...songIndices];
        },
        songIndices: [2, 0, 1],
        startFirstSong,
      }),
    ).resolves.toBe(true);

    expect(startFirstSong).toHaveBeenCalledOnce();
    expect(startFirstSong).toHaveBeenCalledWith(2);
    expect(queue).toEqual([2, 0, 1]);
    expect(queue[0]).toBe(2);
  });

  it("supports a one-song playlist", async () => {
    let queue: number[] = [];

    await startPlaylistPlaybackQueue({
      replaceQueue: (songIndices) => {
        queue = songIndices;
      },
      songIndices: [1],
      startFirstSong: async () => true,
    });

    expect(queue).toEqual([1]);
  });

  it("does not replace any part of the queue when playback fails", async () => {
    const existingQueue = [7, 8];
    let queue = existingQueue;
    const replaceQueue = vi.fn((songIndices: number[]) => {
      queue = songIndices;
    });

    await expect(
      startPlaylistPlaybackQueue({
        replaceQueue,
        songIndices: [0, 1, 2],
        startFirstSong: async () => false,
      }),
    ).resolves.toBe(false);

    expect(replaceQueue).not.toHaveBeenCalled();
    expect(queue).toBe(existingQueue);
  });
});
