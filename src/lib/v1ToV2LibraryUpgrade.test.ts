import { describe, expect, it, vi } from "vitest";
import type {
  BuiltInLibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { Song } from "../types/score";
import { createLocalSongMetadata } from "./libraryCollections";
import {
  createV2LocalLibraryCopy,
  getCreatedV2LibraryCopyState,
} from "./v1ToV2LibraryUpgrade";

function createV1Song(name = "Source"): Song {
  return {
    formatVersion: 1,
    name,
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [
      { time: 0, key: "1Key0" },
      { time: 500, key: "1Key1" },
    ],
  };
}

function createLocalSong(id: string, song: Song): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: createLocalSongMetadata(song),
    source: "local-import",
  };
}

function createBuiltInSong(song: Song): BuiltInLibrarySong {
  return {
    builtInFormatVersion: 1,
    id: "builtin-source",
    importedAt: 0,
    song: { ...song, songNotes: [] },
    source: "built-in",
  };
}

const conversionOptions = {
  name: "Source (V2 Long Note)",
  overlapMs: 40,
  restGapThresholdMs: 2000,
  maxDurationMs: 2000,
  finalGroupDurationMs: 500,
};

describe("createV2LocalLibraryCopy", () => {
  it.each([
    ["built-in", createBuiltInSong(createV1Song())],
    ["local", createLocalSong("local-source", createV1Song())],
  ])("loads and creates a separate copy from a %s V1 score", async (_, source) => {
    const sourceSong = createV1Song();
    const librarySongs = [source];
    const order: string[] = [];
    const save = vi.fn(async (songId: string, song: Song) => {
      order.push(`save:${songId}:${song.formatVersion}`);
    });
    const seed = vi.fn((songId: string) => order.push(`seed:${songId}`));

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => librarySongs,
      loadSourceSong: vi.fn().mockResolvedValue(sourceSong),
      saveImportedScoreSong: save,
      seedImportedScoreSong: seed,
      sourceSongId: source.id,
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledWith(
      "local-copy",
      expect.objectContaining({ formatVersion: 2 }),
    );
    expect(save).not.toHaveBeenCalledWith(
      source.id,
      expect.anything(),
    );
    expect(order).toEqual(["save:local-copy:2", "seed:local-copy"]);
    expect(librarySongs).toEqual([source]);
  });

  it("does not expose a library record when storage fails", async () => {
    const seed = vi.fn();
    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [],
      loadSourceSong: async () => createV1Song(),
      saveImportedScoreSong: async () => {
        throw new Error("disk full");
      },
      seedImportedScoreSong: seed,
      sourceSongId: "local-source",
    });

    expect(result).toMatchObject({ reason: "storage", status: "failed" });
    expect(seed).not.toHaveBeenCalled();
  });

  it("does not resolve or seed the new record before storage finishes", async () => {
    let finishSave: () => void = () => {};
    let hasResolved = false;
    const seed = vi.fn();
    const upgrade = createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => [],
      loadSourceSong: async () => createV1Song(),
      saveImportedScoreSong: () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
      seedImportedScoreSong: seed,
      sourceSongId: "local-source",
    }).then((result) => {
      hasResolved = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(hasResolved).toBe(false);
    expect(seed).not.toHaveBeenCalled();

    finishSave();
    await expect(upgrade).resolves.toMatchObject({ status: "created" });
    expect(seed).toHaveBeenCalledWith(
      "local-copy",
      expect.objectContaining({ formatVersion: 2 }),
    );
  });

  it("does not write or create another record for a duplicate conversion", async () => {
    const sourceSong = createV1Song();
    const firstSave = vi.fn().mockResolvedValue(undefined);
    const first = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => [],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: firstSave,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(first.status).toBe("created");
    const existingCopy =
      first.status === "created" ? first.librarySong : null;
    const duplicateSave = vi.fn();
    const duplicate = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () =>
        existingCopy === null ? [] : [existingCopy],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: duplicateSave,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(duplicate).toEqual({ status: "duplicate" });
    expect(duplicateSave).not.toHaveBeenCalled();
  });

  it("deduplicates conversions whose long-rest groups omit duration", async () => {
    const sourceSong = createV1Song();
    sourceSong.songNotes = [
      { time: 0, key: "1Key0" },
      { time: 4000, key: "1Key1" },
    ];
    const first = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => [],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: vi.fn().mockResolvedValue(undefined),
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });
    const existingCopy =
      first.status === "created" ? first.librarySong : null;
    const duplicateSave = vi.fn();

    const duplicate = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () =>
        existingCopy === null ? [] : [existingCopy],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: duplicateSave,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(duplicate).toEqual({ status: "duplicate" });
    expect(duplicateSave).not.toHaveBeenCalled();
  });

  it("never treats the original V1 record as the generated V2 duplicate", async () => {
    const sourceSong = createV1Song("Source (V2 Long Note)");
    sourceSong.songNotes = [
      { time: 0, key: "1Key0", duration: 540 },
      { time: 500, key: "1Key1", duration: 500 },
    ];
    const source = createLocalSong("local-source", sourceSong);
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => [source],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: source.id,
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps source identity, likes, and playlists untouched", async () => {
    const sourceSong = createV1Song();
    const source = createLocalSong("local-source", sourceSong);
    const likedSongs = [{ likedAt: 1, songId: source.id }];
    const playlists = [{
      createdAt: 1,
      id: "playlist-1",
      name: "Favorites",
      songIds: [source.id],
      updatedAt: 1,
    }];
    const snapshot = structuredClone({ likedSongs, playlists, source });

    await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("local-copy", song),
      getExistingLibrarySongs: () => [source],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: async () => undefined,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: source.id,
    });

    expect({ likedSongs, playlists, source }).toEqual(snapshot);
  });

  it("selects and locates the appended local copy without replacing the source", () => {
    const source = createLocalSong("local-source", createV1Song());
    const copy = createLocalSong(
      "local-copy",
      createV1Song("Source (V2 Long Note)"),
    );

    expect(getCreatedV2LibraryCopyState([source], copy)).toEqual({
      localLibrarySongs: [source, copy],
      locateSongId: "local-copy",
      searchQuery: "",
      selectedCategory: "local-imports",
      selectedSongId: "local-copy",
    });
  });

  it("rechecks the mutation guard after loading and before writing", async () => {
    let isBlocked = false;
    const save = vi.fn();
    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [],
      isMutationBlocked: () => isBlocked,
      loadSourceSong: async () => {
        isBlocked = true;
        return createV1Song();
      },
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result).toEqual({ reason: "blocked", status: "failed" });
    expect(save).not.toHaveBeenCalled();
  });
});
