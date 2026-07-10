import { describe, expect, it } from "vitest";
import type { LibrarySongListItem, UserPlaylist } from "../types/library";
import type { Song } from "../types/score";
import {
  addSongToPlaylist,
  createLibrarySong,
  createLocalSongMetadata,
  filterSongsByQuery,
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
      isComposed: true,
      lastNoteTimeMs: 500,
      name: "Metadata",
      noteCount: 3,
      noteGroupCount: 2,
      noteGroupDelaysMs: [0, 500],
      pitchLevel: 0,
    });
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
