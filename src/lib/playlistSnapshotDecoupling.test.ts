import { describe, expect, it } from "vitest";
import type { LocalLibrarySong } from "../types/library";
import {
  addSongToPlaylist,
  createPlaylist,
  createPlaylistCopyOfLocalSong,
  isSongLiked,
  removeSongFromAllCollections,
  removeSongFromPlaylist,
} from "./libraryCollections";
import { getLibraryCategoryItems, isPlaylistCopySong } from "./libraryGroups";

function createLocalSong(id: string, name = id): LocalLibrarySong {
  return {
    id,
    importedAt: 0,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: id,
      isComposed: false,
      lastNoteTimeMs: 0,
      name,
      noteCount: 4,
      noteGroupCount: 2,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

describe("playlist copy decoupling", () => {
  it("copy gets an independent id", () => {
    const source = createLocalSong("local-source");
    const copy = createPlaylistCopyOfLocalSong(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.source).toBe("local-import");
    expect(copy.libraryGroup).toBe("playlist-copy");
    expect(copy.metadata.name).toBe(source.metadata.name);
  });

  it("deleting the original keeps the playlist copy", () => {
    const source = createLocalSong("local-source", "Star");
    const copy = createPlaylistCopyOfLocalSong(source);
    const playlist = addSongToPlaylist(createPlaylist("MyList"), copy.id);

    const afterDelete = removeSongFromAllCollections({
      likedSongs: [{ likedAt: 1, songId: source.id }],
      playlists: [playlist],
      songId: source.id,
    });

    expect(afterDelete.playlists[0].songIds).toEqual([copy.id]);
    expect(isSongLiked(afterDelete.likedSongs, copy.id)).toBe(false);
  });

  it("two playlists hold independent copies", () => {
    const source = createLocalSong("local-source");
    const copyA = createPlaylistCopyOfLocalSong(source);
    const copyB = createPlaylistCopyOfLocalSong(source);

    expect(copyA.id).not.toBe(copyB.id);

    const playlistA = addSongToPlaylist(createPlaylist("A"), copyA.id);
    const playlistB = addSongToPlaylist(createPlaylist("B"), copyB.id);

    const afterRemoveFromA = removeSongFromPlaylist(playlistA, copyA.id);

    expect(afterRemoveFromA.songIds).toEqual([]);
    expect(playlistB.songIds).toEqual([copyB.id]);
  });

  it("playlist copies stay out of browsable library categories", () => {
    const normalSong = createLocalSong("local-normal", "Normal");
    const copy = createPlaylistCopyOfLocalSong(normalSong);
    const items = [normalSong, copy].map((librarySong) => ({
      isLiked: false,
      librarySong,
      songIndex: 0,
    }));

    const localImportItems = getLibraryCategoryItems(
      items,
      "local-imports",
      null,
    );

    expect(localImportItems.map((item) => item.librarySong.id)).toEqual([
      normalSong.id,
    ]);
    expect(isPlaylistCopySong(copy)).toBe(true);
    expect(isPlaylistCopySong(normalSong)).toBe(false);
  });
});