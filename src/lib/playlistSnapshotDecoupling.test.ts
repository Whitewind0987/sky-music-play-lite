import { describe, expect, it } from "vitest";
import type { LocalLibrarySong } from "../types/library";
import {
  addSongToPlaylist,
  createPlaylist,
  createPlaylistCopyOfLocalSong,
  getSourceSongId,
  isSongLiked,
  removeSongFromAllCollections,
  removeSongFromPlaylist,
} from "./libraryCollections";
import {
  getLibraryCategoryItems,
  getLocalLibraryMoveTarget,
  isPlaylistCopySong,
  moveLocalLibrarySong,
} from "./libraryGroups";

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

describe("副本身份识别（重复加入检测）", () => {
  it("副本记住自己源自哪首原曲", () => {
    const source = createLocalSong("local-source");
    const copy = createPlaylistCopyOfLocalSong(source);

    expect(copy.sourceSongId).toBe(source.id);
    expect(getSourceSongId(copy)).toBe(source.id);
  });

  it("普通曲谱的原曲身份就是自身", () => {
    const normal = createLocalSong("local-normal");

    expect(getSourceSongId(normal)).toBe(normal.id);
  });

  it("同一原曲的两个副本拥有相同的原曲身份（可识别为重复）", () => {
    const source = createLocalSong("local-source");
    const copyA = createPlaylistCopyOfLocalSong(source);
    const copyB = createPlaylistCopyOfLocalSong(source);

    expect(getSourceSongId(copyA)).toBe(getSourceSongId(copyB));
    expect(copyA.id).not.toBe(copyB.id);
  });
});

describe("私有副本的分类移动规则", () => {
  it("私有副本不允许改分类（否则会脱离副本清理机制）", () => {
    const source = createLocalSong("local-source");
    const copy = createPlaylistCopyOfLocalSong(source);

    expect(getLocalLibraryMoveTarget(copy)).toBeNull();
  });

  it("私有副本无法被 moveLocalLibrarySong 移动", () => {
    const source = createLocalSong("local-source");
    const copy = createPlaylistCopyOfLocalSong(source);
    const songs = [source, copy];

    const next = moveLocalLibrarySong(songs, copy.id, "converted");

    expect(next[1].libraryGroup).toBe("playlist-copy");
  });

  it("V2 普通曲谱仍可移至已转换", () => {
    const v2Song: LocalLibrarySong = {
      ...createLocalSong("local-v2"),
      metadata: {
        ...createLocalSong("local-v2").metadata,
        formatVersion: 2,
      },
    };

    expect(getLocalLibraryMoveTarget(v2Song)).toBe("converted");
  });
});