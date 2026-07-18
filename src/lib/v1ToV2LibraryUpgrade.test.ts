import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import type {
  BuiltInLibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { Song } from "../types/score";
import { createLocalSongMetadata } from "./libraryCollections";
import { convertV1SongToV2 } from "./v1ToV2Conversion";
import {
  createV2LocalLibraryCopy,
  getCreatedV2LibraryCopyState,
  getV2UpgradeDuplicateNotice,
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
  minimumSustainGapMs: 250,
  releaseLeadMs: 30,
  restGapThresholdMs: 1200,
  maxDurationMs: 1200,
  finalGroupDurationMs: 500,
};

describe("createV2LocalLibraryCopy", () => {
  it.each([
    ["null", async () => null],
    [
      "rejection",
      async () => {
        throw new Error("source load failed");
      },
    ],
  ])("keeps %s source-load failure handling", async (_, loadSourceSong) => {
    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [],
      loadSourceSong,
      saveImportedScoreSong: vi.fn(),
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result).toMatchObject({
      reason: "source-load",
      status: "failed",
    });
  });

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

    expect(duplicate).toEqual({
      existingLibrarySong: existingCopy,
      status: "duplicate",
    });
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

    expect(duplicate).toEqual({
      existingLibrarySong: existingCopy,
      status: "duplicate",
    });
    expect(duplicateSave).not.toHaveBeenCalled();
  });

  it("deduplicates identical V2 content even when the proposed and existing names differ", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(sourceSong, {
      ...conversionOptions,
      name: "Existing name",
    });
    const existingCopy = createLocalSong("existing-v2", existingSong);
    const createLibrarySong = vi.fn();
    const save = vi.fn();
    const seed = vi.fn();
    const loadExistingSong = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions: {
        ...conversionOptions,
        name: "A completely different proposed name",
      },
      createLibrarySong,
      getExistingLibrarySongs: () => [existingCopy],
      loadExistingSong,
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: seed,
      sourceSongId: "local-source",
    });

    expect(result).toEqual({
      existingLibrarySong: existingCopy,
      status: "duplicate",
    });
    expect(loadExistingSong).not.toHaveBeenCalled();
    expect(createLibrarySong).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(seed).not.toHaveBeenCalled();
  });

  it("does not deduplicate V2 scores with different playable durations", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    existingSong.songNotes = existingSong.songNotes.map((note, index) =>
      index === 0
        ? { ...note, duration: (note.duration ?? 0) + 1 }
        : note,
    );
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [
        createLocalSong("different-v2", existingSong),
      ],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledOnce();
  });

  it("allows Connected and Balanced when they generate different durations", async () => {
    const sourceSong = createV1Song();
    const connectedOptions = {
      ...conversionOptions,
      name: "Connected",
      minimumSustainGapMs: 150,
      releaseLeadMs: 15,
      restGapThresholdMs: 2000,
      maxDurationMs: 2000,
      finalGroupDurationMs: 800,
    };
    const connectedSong = convertV1SongToV2(
      sourceSong,
      connectedOptions,
    );
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("balanced-v2", song),
      getExistingLibrarySongs: () => [
        createLocalSong("connected-v2", connectedSong),
      ],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledOnce();
  });

  it("deduplicates different Custom settings that generate identical playable content", async () => {
    const sourceSong = createV1Song();
    const firstOptions = {
      ...conversionOptions,
      name: "Custom one",
      minimumSustainGapMs: 150,
      maxDurationMs: 2000,
      restGapThresholdMs: 1800,
    };
    const secondOptions = {
      ...firstOptions,
      name: "Custom two",
      minimumSustainGapMs: 200,
      maxDurationMs: 1900,
      restGapThresholdMs: 1700,
    };
    const firstSong = convertV1SongToV2(sourceSong, firstOptions);
    const existingCopy = createLocalSong("custom-one", firstSong);
    const save = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions: secondOptions,
      createLibrarySong: vi.fn(),
      getExistingLibrarySongs: () => [existingCopy],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result).toEqual({
      existingLibrarySong: existingCopy,
      status: "duplicate",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("allows a V2 score whose note content differs", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    existingSong.songNotes = existingSong.songNotes.map((note, index) =>
      index === 0 ? { ...note, key: "DifferentKey" } : note,
    );
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [
        createLocalSong("different-v2", existingSong),
      ],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledOnce();
  });

  it("never treats another known V1 score as a V2 duplicate candidate", async () => {
    const sourceSong = createV1Song();
    const v1Candidate = createLocalSong("other-v1", sourceSong);
    const loadExistingSong = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [v1Candidate],
      loadExistingSong,
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "source-v1",
    });

    expect(result.status).toBe("created");
    expect(loadExistingSong).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it("matches a loaded built-in V2 score by content", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(sourceSong, {
      ...conversionOptions,
      name: "Built-in existing",
    });
    const existingBuiltIn: BuiltInLibrarySong = {
      builtInFormatVersion: 2,
      id: "built-in-v2",
      importedAt: 0,
      isBuiltInLoaded: true,
      song: existingSong,
      source: "built-in",
    };
    const save = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [existingBuiltIn],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result).toEqual({
      existingLibrarySong: existingBuiltIn,
      status: "duplicate",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("loads a matching legacy local V2 candidate that has no content fingerprint", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(sourceSong, {
      ...conversionOptions,
      name: "Legacy existing",
    });
    const currentMetadata = createLocalSongMetadata(existingSong);
    const { contentFingerprint: _removed, ...legacyMetadata } =
      currentMetadata;
    const legacyCopy: LocalLibrarySong = {
      id: "legacy-v2",
      importedAt: 1,
      metadata: legacyMetadata,
      source: "local-import",
    };
    const loadExistingSong = vi.fn().mockResolvedValue(existingSong);
    const save = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [legacyCopy],
      loadExistingSong,
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(loadExistingSong).toHaveBeenCalledWith("legacy-v2");
    expect(result).toEqual({
      existingLibrarySong: legacyCopy,
      status: "duplicate",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("uses the legacy metadata prefilter before loading candidate files", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    const { contentFingerprint: _removed, ...legacyMetadata } =
      createLocalSongMetadata(existingSong);
    const mismatchedCopy: LocalLibrarySong = {
      id: "mismatched-v2",
      importedAt: 1,
      metadata: { ...legacyMetadata, bpm: legacyMetadata.bpm + 1 },
      source: "local-import",
    };
    const loadExistingSong = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [mismatchedCopy],
      loadExistingSong,
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: vi.fn().mockResolvedValue(undefined),
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(loadExistingSong).not.toHaveBeenCalled();
  });

  it("allows a loaded legacy V2 candidate with different full content", async () => {
    const sourceSong = createV1Song();
    const expectedSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    const { contentFingerprint: _removed, ...legacyMetadata } =
      createLocalSongMetadata(expectedSong);
    const legacyCopy: LocalLibrarySong = {
      id: "legacy-different-v2",
      importedAt: 1,
      metadata: legacyMetadata,
      source: "local-import",
    };
    const differentSong = {
      ...expectedSong,
      songNotes: expectedSong.songNotes.map((note, index) =>
        index === 0 ? { ...note, key: "DifferentKey" } : note,
      ),
    };
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [legacyCopy],
      loadExistingSong: vi.fn().mockResolvedValue(differentSong),
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledOnce();
  });

  it("ignores a failed legacy candidate load and continues creating", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    const { contentFingerprint: _removed, ...legacyMetadata } =
      createLocalSongMetadata(existingSong);
    const legacyCopy: LocalLibrarySong = {
      id: "unreadable-v2",
      importedAt: 1,
      metadata: legacyMetadata,
      source: "local-import",
    };
    const save = vi.fn().mockResolvedValue(undefined);

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      createLibrarySong: (song) => createLocalSong("new-v2", song),
      getExistingLibrarySongs: () => [legacyCopy],
      loadExistingSong: vi.fn().mockRejectedValue(new Error("gone")),
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(result.status).toBe("created");
    expect(save).toHaveBeenCalledOnce();
  });

  it("continues from an unreadable legacy candidate to a later exact match", async () => {
    const sourceSong = createV1Song();
    const existingSong = convertV1SongToV2(
      sourceSong,
      conversionOptions,
    );
    const { contentFingerprint: _removed, ...legacyMetadata } =
      createLocalSongMetadata(existingSong);
    const unreadable: LocalLibrarySong = {
      id: "unreadable-v2",
      importedAt: 1,
      metadata: legacyMetadata,
      source: "local-import",
    };
    const matching: LocalLibrarySong = {
      ...unreadable,
      id: "matching-v2",
    };
    const loadExistingSong = vi.fn(async (songId: string) => {
      if (songId === unreadable.id) {
        throw new Error("gone");
      }

      return existingSong;
    });
    const save = vi.fn();

    const result = await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [unreadable, matching],
      loadExistingSong,
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: save,
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(loadExistingSong).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      existingLibrarySong: matching,
      status: "duplicate",
    });
    expect(save).not.toHaveBeenCalled();
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

  it("does not mutate the loaded source song", async () => {
    const sourceSong = createV1Song();
    const snapshot = structuredClone(sourceSong);

    await createV2LocalLibraryCopy({
      conversionOptions,
      getExistingLibrarySongs: () => [],
      loadSourceSong: async () => sourceSong,
      saveImportedScoreSong: vi.fn().mockResolvedValue(undefined),
      seedImportedScoreSong: vi.fn(),
      sourceSongId: "local-source",
    });

    expect(sourceSong).toEqual(snapshot);
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

describe("getV2UpgradeDuplicateNotice", () => {
  const existing = createLocalSong(
    "existing",
    convertV1SongToV2(createV1Song(), {
      ...conversionOptions,
      name: "Existing V2",
    }),
  );

  it("identifies the existing matching song in Chinese and English", () => {
    expect(
      getV2UpgradeDuplicateNotice(
        existing,
        uiText["zh-CN"].logs.scoreUpgradeDuplicate,
      ),
    ).toBe("已存在内容相同的 V2 曲谱：《Existing V2》。");
    expect(
      getV2UpgradeDuplicateNotice(
        existing,
        uiText["en-US"].logs.scoreUpgradeDuplicate,
      ),
    ).toBe(
      "A V2 score with identical content already exists: “Existing V2”.",
    );
  });
});
