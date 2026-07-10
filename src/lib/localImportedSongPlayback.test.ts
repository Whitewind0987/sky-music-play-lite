import { describe, expect, it, vi } from "vitest";
import type { LibrarySong } from "../types/library";
import type { Song } from "../types/score";
import { loadLocalImportedSongForPlayback } from "./localImportedSongPlayback";

function createSong(name: string): Song {
  return {
    name,
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [{ time: 0, key: "1Key0" }],
  };
}

function createLibrarySong(song: Song = createSong("Local")): LibrarySong {
  return {
    id: "local-1",
    importedAt: 1,
    song,
    source: "local-import",
  };
}

describe("loadLocalImportedSongForPlayback", () => {
  it("returns a loaded local song when it is still in the library", async () => {
    const loadedSong = createSong("Loaded From File");

    await expect(
      loadLocalImportedSongForPlayback({
        appendLog: vi.fn(),
        formatLoadFailure: () => "failed",
        isSongStillInLibrary: () => true,
        librarySong: createLibrarySong(),
        loadSongById: async () => loadedSong,
        shouldLogFailure: true,
      }),
    ).resolves.toBe(loadedSong);
  });

  it("logs and shows one notice when an actual playback load fails", async () => {
    const appendLog = vi.fn();
    const showNotice = vi.fn();

    const result = await loadLocalImportedSongForPlayback({
      appendLog,
      formatLoadFailure: (songName, songId, error) =>
        `${songName} (${songId}): ${String(error)}`,
      isSongStillInLibrary: () => true,
      librarySong: createLibrarySong(createSong("Broken")),
      loadSongById: async () => {
        throw new Error("missing file");
      },
      shouldLogFailure: true,
      showNotice,
    });

    expect(result).toBeNull();
    expect(appendLog).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(appendLog).toHaveBeenCalledWith(
      "Broken (local-1): Error: missing file",
    );
  });

  it("keeps selection-only preload failures silent", async () => {
    const appendLog = vi.fn();
    const showNotice = vi.fn();

    const result = await loadLocalImportedSongForPlayback({
      appendLog,
      formatLoadFailure: () => "failed",
      isSongStillInLibrary: () => true,
      librarySong: createLibrarySong(),
      loadSongById: async () => {
        throw new Error("missing file");
      },
      shouldLogFailure: false,
      showNotice,
    });

    expect(result).toBeNull();
    expect(appendLog).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });

  it("does not return a song that was removed while loading", async () => {
    const onStaleLoad = vi.fn();

    const result = await loadLocalImportedSongForPlayback({
      appendLog: vi.fn(),
      formatLoadFailure: () => "failed",
      isSongStillInLibrary: () => false,
      librarySong: createLibrarySong(),
      loadSongById: async () => createSong("Stale"),
      onStaleLoad,
      shouldLogFailure: true,
    });

    expect(result).toBeNull();
    expect(onStaleLoad).toHaveBeenCalledWith("local-1");
  });
});
