import { describe, expect, it } from "vitest";
import type {
  BuiltInLibrarySong,
  LibrarySongListItem,
  LocalLibrarySong,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";
import {
  addSongToPlaylist,
  createLibrarySong,
  createLocalSongMetadata,
  enrichLocalSongFormatVersion,
  filterSongsByQuery,
  getLibrarySongFormatVersion,
  getLibrarySongRawDurationMs,
  getSongFingerprint,
  removeSongFromAllCollections,
  removeSongFromPlaylist,
  toggleLikedSong,
} from "./libraryCollections";

function createTestSong(name: string): Song {
  return {
    name,
    bpm: 120,
    bitsPerPage: 15,
    isComposed: true,
    pitchLevel: 0,
    songNotes: [
      { key: "Key0", time: 0 },
      { key: "Key1", time: 500 },
    ],
  };
}

function createTestPlaylist(songIds: string[] = []): UserPlaylist {
  return {
    createdAt: 1,
    id: "playlist-1",
    name: "Playlist",
    songIds,
    updatedAt: 1,
  };
}

describe("createLibrarySong", () => {
  it("creates a local-import library song with a stable importedAt", () => {
    const song = createTestSong("Song A");
    const librarySong = createLibrarySong(song, 12345);

    expect(librarySong.source).toBe("local-import");
    expect(librarySong.importedAt).toBe(12345);
    expect(librarySong.metadata).toEqual(createLocalSongMetadata(song));
    expect(librarySong.id).toContain("local-12345-");
  });
});

describe("createLocalSongMetadata", () => {
  it("calculates note counts, groups, last time, delays, and fingerprint", () => {
    const song = createTestSong("Metadata");
    song.songNotes.push({ key: "Key2", time: 500 });

    expect(createLocalSongMetadata(song)).toEqual({
      bitsPerPage: 15,
      bpm: 120,
      fingerprint: getSongFingerprint(song),
      formatVersion: 1,
      isComposed: true,
      lastNoteTimeMs: 500,
      name: "Metadata",
      noteCount: 3,
      noteGroupCount: 2,
      noteGroupDelaysMs: [0, 500],
      noteGroupMaxHoldMs: [0, 0],
      pitchLevel: 0,
    });
  });

  it("records version 1 for ordinary songs and version 2 explicitly", () => {
    expect(createLocalSongMetadata(createTestSong("V1")).formatVersion).toBe(1);
    expect(
      createLocalSongMetadata({
        ...createTestSong("V2"),
        formatVersion: 2,
      }).formatVersion,
    ).toBe(2);
  });
});

describe("getLibrarySongFormatVersion", () => {
  function createBuiltInSong(
    overrides: Partial<BuiltInLibrarySong> = {},
  ): BuiltInLibrarySong {
    return {
      id: "builtin:test:0",
      importedAt: 0,
      isBuiltInLoaded: false,
      song: createTestSong("Built in"),
      source: "built-in",
      ...overrides,
    };
  }

  it("uses local metadata versions", () => {
    const localV1 = createLibrarySong(createTestSong("Local V1"), 1);
    const localV2 = createLibrarySong(
      { ...createTestSong("Local V2"), formatVersion: 2 },
      2,
    );

    expect(getLibrarySongFormatVersion(localV1)).toBe(1);
    expect(getLibrarySongFormatVersion(localV2)).toBe(2);
  });

  it("uses the full loaded built-in song as authoritative", () => {
    expect(
      getLibrarySongFormatVersion(
        createBuiltInSong({
          builtInFormatVersion: 1,
          isBuiltInLoaded: true,
          song: { ...createTestSong("Loaded V2"), formatVersion: 2 },
        }),
      ),
    ).toBe(2);
    expect(
      getLibrarySongFormatVersion(
        createBuiltInSong({
          builtInFormatVersion: 2,
          isBuiltInLoaded: true,
          song: createTestSong("Loaded V1"),
        }),
      ),
    ).toBe(1);
  });

  it("uses the indexed version for unloaded built-ins", () => {
    expect(
      getLibrarySongFormatVersion(
        createBuiltInSong({ builtInFormatVersion: 2 }),
      ),
    ).toBe(2);
    expect(getLibrarySongFormatVersion(createBuiltInSong())).toBeUndefined();
  });

  it("does not turn an unknown local marker into version 2", () => {
    const localSong = createLibrarySong(createTestSong("Unknown"), 1);
    const unknownSong = {
      ...localSong,
      metadata: { ...localSong.metadata, formatVersion: 3 },
    } as unknown as LocalLibrarySong;

    expect(getLibrarySongFormatVersion(unknownSong)).toBeUndefined();
  });
});

describe("enrichLocalSongFormatVersion", () => {
  function createLegacyLocalSong(): LocalLibrarySong {
    const librarySong = createLibrarySong(createTestSong("Legacy"), 123);
    const { formatVersion: _formatVersion, ...metadata } = librarySong.metadata;

    return { ...librarySong, metadata };
  }

  it.each([
    ["V1", undefined, 1],
    ["V2", 2 as const, 2],
  ])("enriches old metadata after loading %s", (_label, version, expected) => {
    const librarySong = createLegacyLocalSong();
    const loadedSong: Song = {
      ...createTestSong("Legacy"),
      ...(version === undefined ? {} : { formatVersion: version }),
    };
    const originalSongs = [librarySong];
    const result = enrichLocalSongFormatVersion(
      originalSongs,
      librarySong.id,
      loadedSong,
    );

    expect(result).not.toBe(originalSongs);
    expect(result[0]?.metadata.formatVersion).toBe(expected);
    expect(result[0]?.id).toBe(librarySong.id);
    expect(result[0]?.importedAt).toBe(librarySong.importedAt);
  });

  it("returns the same state when the version is unchanged and is idempotent", () => {
    const librarySong = createLibrarySong(
      { ...createTestSong("V2"), formatVersion: 2 },
      123,
    );
    const loadedSong: Song = {
      ...createTestSong("V2"),
      formatVersion: 2,
    };
    const firstResult = enrichLocalSongFormatVersion(
      [librarySong],
      librarySong.id,
      loadedSong,
    );
    const secondResult = enrichLocalSongFormatVersion(
      firstResult,
      librarySong.id,
      loadedSong,
    );

    expect(firstResult[0]).toBe(librarySong);
    expect(secondResult).toBe(firstResult);
  });

  it("does not alter unrelated local songs or collection data", () => {
    const target = createLegacyLocalSong();
    const unrelated = createLibrarySong(createTestSong("Other"), 456);
    const likedSongs = [{ likedAt: 1, songId: target.id }];
    const playlists = [createTestPlaylist([target.id])];
    const result = enrichLocalSongFormatVersion(
      [target, unrelated],
      target.id,
      { ...createTestSong("Legacy"), formatVersion: 2 },
    );

    expect(result[1]).toBe(unrelated);
    expect(likedSongs).toEqual([{ likedAt: 1, songId: target.id }]);
    expect(playlists).toEqual([createTestPlaylist([target.id])]);
  });
});

describe("scores-v2 sustain metadata", () => {
  function createSustainSong(notes: Song["songNotes"]): Song {
    return {
      name: "Sustain Song",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: true,
      songNotes: notes,
    };
  }

  it("computes sustainTailMs from the longest tail past the last group", () => {
    const metadata = createLocalSongMetadata(
      createSustainSong([
        { time: 0, key: "Key0", duration: 5000 },
        { time: 1000, key: "Key1", duration: 500 },
      ]),
    );

    expect(metadata.sustainTailMs).toBe(4000);
    expect(metadata.lastNoteTimeMs).toBe(1000);
    expect(metadata.noteGroupMaxHoldMs).toEqual([5000, 500]);
  });

  it("counts tails from notes at the last group", () => {
    const metadata = createLocalSongMetadata(
      createSustainSong([
        { time: 0, key: "Key0" },
        { time: 1000, key: "Key1", duration: 200 },
      ]),
    );

    expect(metadata.sustainTailMs).toBe(200);
  });

  it("omits sustainTailMs for songs without durations", () => {
    const metadata = createLocalSongMetadata(
      createSustainSong([{ time: 0, key: "Key0" }]),
    );

    expect(metadata.sustainTailMs).toBeUndefined();
  });

  it("keeps v1 fingerprints unchanged and differentiates v2 durations", () => {
    const v1Song = createSustainSong([{ time: 0, key: "Key0" }]);
    const v1Fingerprint = getSongFingerprint(v1Song);
    const v2Fingerprint = getSongFingerprint(
      createSustainSong([{ time: 0, key: "Key0", duration: 800 }]),
    );

    expect(v2Fingerprint).not.toBe(v1Fingerprint);
    expect(getSongFingerprint(v1Song)).toBe(v1Fingerprint);
  });

  it("includes the sustain tail in raw duration for local imports", () => {
    const librarySong = createLibrarySong(
      createSustainSong([{ time: 1000, key: "Key0", duration: 2500 }]),
    );

    expect(getLibrarySongRawDurationMs(librarySong)).toBe(3500);
  });

  it("includes an early long note in raw duration", () => {
    const librarySong = createLibrarySong(
      createSustainSong([
        { time: 0, key: "Key0", duration: 5000 },
        { time: 1000, key: "Key1" },
      ]),
    );

    expect(getLibrarySongRawDurationMs(librarySong)).toBe(5000);
  });

  it("keeps loaded and indexed built-in v2 durations equal", () => {
    const song = createSustainSong([
      { time: 0, key: "Key0", duration: 5000 },
      { time: 1000, key: "Key1" },
    ]);

    expect(
      getLibrarySongRawDurationMs({
        builtInDurationMs: 5000,
        id: "builtin:test:0",
        importedAt: 0,
        isBuiltInLoaded: false,
        song,
        source: "built-in",
      }),
    ).toBe(5000);
    expect(
      getLibrarySongRawDurationMs({
        id: "builtin:test:0",
        importedAt: 0,
        isBuiltInLoaded: true,
        song,
        source: "built-in",
      }),
    ).toBe(5000);
  });
});

describe("getSongFingerprint", () => {
  it("normalizes song name trim and case", () => {
    const songA = createTestSong("  Test Song  ");
    const songB = createTestSong("test song");

    expect(getSongFingerprint(songA)).toBe(getSongFingerprint(songB));
  });

  it("changes when notes change", () => {
    const songA = createTestSong("Test Song");
    const songB: Song = {
      ...songA,
      songNotes: [{ key: "Key2", time: 0 }],
    };

    expect(getSongFingerprint(songA)).not.toBe(getSongFingerprint(songB));
  });
});

describe("filterSongsByQuery", () => {
  it("trims query and matches case-insensitively", () => {
    const skySong = createLibrarySong(createTestSong("Sky Song"), 1);
    const otherSong = createLibrarySong(createTestSong("Other"), 2);
    const items: LibrarySongListItem[] = [
      { isLiked: false, librarySong: skySong, songIndex: 0 },
      { isLiked: false, librarySong: otherSong, songIndex: 1 },
    ];

    expect(filterSongsByQuery(items, " sky ")).toEqual([items[0]]);
  });
});

describe("liked songs", () => {
  it("adds then removes the same song id", () => {
    const likedOnce = toggleLikedSong([], "song-1");
    expect(likedOnce).toHaveLength(1);

    const likedTwice = toggleLikedSong(likedOnce, "song-1");
    expect(likedTwice).toEqual([]);
  });
});

describe("playlists", () => {
  it("appends a song id", () => {
    const nextPlaylist = addSongToPlaylist(createTestPlaylist(), "song-1");

    expect(nextPlaylist.songIds).toEqual(["song-1"]);
  });

  it("does not duplicate an existing song id", () => {
    const nextPlaylist = addSongToPlaylist(
      createTestPlaylist(["song-1"]),
      "song-1",
    );

    expect(nextPlaylist.songIds).toEqual(["song-1"]);
  });

  it("removes one song id and preserves others", () => {
    const nextPlaylist = removeSongFromPlaylist(
      createTestPlaylist(["song-1", "song-2", "song-3"]),
      "song-2",
    );

    expect(nextPlaylist.songIds).toEqual(["song-1", "song-3"]);
  });

  it("removes a song from liked songs and all playlists", () => {
    const result = removeSongFromAllCollections({
      likedSongs: [
        { likedAt: 1, songId: "song-1" },
        { likedAt: 2, songId: "song-2" },
      ],
      playlists: [
        createTestPlaylist(["song-1", "song-2"]),
        { ...createTestPlaylist(["song-2", "song-3"]), id: "playlist-2" },
      ],
      songId: "song-2",
    });

    expect(result.likedSongs).toEqual([{ likedAt: 1, songId: "song-1" }]);
    expect(result.playlists.map((playlist) => playlist.songIds)).toEqual([
      ["song-1"],
      ["song-3"],
    ]);
  });
});
