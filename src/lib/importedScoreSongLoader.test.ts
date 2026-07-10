import { describe, expect, it, vi } from "vitest";
import type { Song } from "../types/score";
import { ImportedScoreSongLoader } from "./importedScoreSongLoader";

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

describe("ImportedScoreSongLoader", () => {
  it("loads an uncached song through the underlying loader once", async () => {
    const loader = new ImportedScoreSongLoader();
    const song = createSong("Loaded");
    const loadSong = vi.fn().mockResolvedValue(song);

    await expect(loader.load("local-1", loadSong)).resolves.toBe(song);

    expect(loadSong).toHaveBeenCalledTimes(1);
    expect(loadSong).toHaveBeenCalledWith("local-1");
  });

  it("caches successful loads and returns the same song without another call", async () => {
    const loader = new ImportedScoreSongLoader();
    const song = createSong("Cached");
    const loadSong = vi.fn().mockResolvedValue(song);

    const first = await loader.load("local-1", loadSong);
    const second = await loader.load("local-1", loadSong);

    expect(first).toBe(song);
    expect(second).toBe(song);
    expect(loadSong).toHaveBeenCalledTimes(1);
  });

  it("shares one underlying promise for concurrent loads of one id", async () => {
    const loader = new ImportedScoreSongLoader();
    const song = createSong("Concurrent");
    let resolveLoad: (song: Song) => void = () => {};
    const activeLoad = new Promise<Song>((resolve) => {
      resolveLoad = resolve;
    });
    const loadSong = vi.fn(() => activeLoad);

    const first = loader.load("local-1", loadSong);
    const second = loader.load("local-1", loadSong);

    resolveLoad(song);

    await expect(Promise.all([first, second])).resolves.toEqual([song, song]);
    expect(loadSong).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed loads and retries later", async () => {
    const loader = new ImportedScoreSongLoader();
    const song = createSong("Retry");
    const loadSong = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(song);

    await expect(loader.load("local-1", loadSong)).rejects.toThrow("missing");
    await expect(loader.load("local-1", loadSong)).resolves.toBe(song);

    expect(loadSong).toHaveBeenCalledTimes(2);
  });

  it("returns a seeded song without reading from storage", async () => {
    const loader = new ImportedScoreSongLoader();
    const song = createSong("Seeded");
    const loadSong = vi.fn();

    loader.seed("local-1", song);

    await expect(loader.load("local-1", loadSong)).resolves.toBe(song);
    expect(loadSong).not.toHaveBeenCalled();
  });

  it("invalidates only one cached song", async () => {
    const loader = new ImportedScoreSongLoader();
    const firstSong = createSong("First");
    const secondSong = createSong("Second");
    const reloadedFirstSong = createSong("First Reloaded");
    const loadSong = vi.fn(async (songId: string) =>
      songId === "local-1" ? reloadedFirstSong : secondSong,
    );

    loader.seed("local-1", firstSong);
    loader.seed("local-2", secondSong);
    loader.invalidate("local-1");

    await expect(loader.load("local-1", loadSong)).resolves.toBe(
      reloadedFirstSong,
    );
    await expect(loader.load("local-2", loadSong)).resolves.toBe(secondSong);
    expect(loadSong).toHaveBeenCalledTimes(1);
    expect(loadSong).toHaveBeenCalledWith("local-1");
  });

  it("clears all cached songs", async () => {
    const loader = new ImportedScoreSongLoader();
    const firstReload = createSong("First Reload");
    const secondReload = createSong("Second Reload");
    const loadSong = vi.fn(async (songId: string) =>
      songId === "local-1" ? firstReload : secondReload,
    );

    loader.seed("local-1", createSong("First"));
    loader.seed("local-2", createSong("Second"));
    loader.clear();

    await expect(loader.load("local-1", loadSong)).resolves.toBe(firstReload);
    await expect(loader.load("local-2", loadSong)).resolves.toBe(secondReload);
    expect(loadSong).toHaveBeenCalledTimes(2);
  });

  it("does not let an invalidated active load repopulate the cache", async () => {
    const loader = new ImportedScoreSongLoader();
    const staleSong = createSong("Stale");
    const freshSong = createSong("Fresh");
    let resolveLoad: (song: Song) => void = () => {};
    const activeLoad = new Promise<Song>((resolve) => {
      resolveLoad = resolve;
    });
    const loadSong = vi.fn().mockReturnValueOnce(activeLoad).mockResolvedValueOnce(freshSong);

    const staleResult = loader.load("local-1", loadSong);

    loader.invalidate("local-1");
    resolveLoad(staleSong);

    await expect(staleResult).resolves.toBeNull();
    await expect(loader.load("local-1", loadSong)).resolves.toBe(freshSong);
    expect(loader.getCachedSong("local-1")).toBe(freshSong);
  });

  it("does not let a clear during active loads repopulate the cache", async () => {
    const loader = new ImportedScoreSongLoader();
    const staleSong = createSong("Stale");
    const freshSong = createSong("Fresh");
    let resolveLoad: (song: Song) => void = () => {};
    const activeLoad = new Promise<Song>((resolve) => {
      resolveLoad = resolve;
    });
    const loadSong = vi.fn().mockReturnValueOnce(activeLoad).mockResolvedValueOnce(freshSong);

    const staleResult = loader.load("local-1", loadSong);

    loader.clear();
    resolveLoad(staleSong);

    await expect(staleResult).resolves.toBeNull();
    await expect(loader.load("local-1", loadSong)).resolves.toBe(freshSong);
    expect(loader.getCachedSong("local-1")).toBe(freshSong);
  });
});
