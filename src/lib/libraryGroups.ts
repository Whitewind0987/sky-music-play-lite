// SPDX-FileCopyrightText: 2026 Whitewind0987
// SPDX-License-Identifier: GPL-3.0-only

import type { LibraryCategoryId } from "../components/AppShell";
import type { LibrarySong, LibrarySongId, LibrarySongListItem, LocalLibraryGroup, LocalLibrarySong, UserPlaylist } from "../types/library";
import { getLibrarySongFormatVersion } from "./libraryCollections";

export function isPlaylistCopySong(song: LibrarySong) {
  return song.source === "local-import" && song.libraryGroup === "playlist-copy";
}

export function getLibrarySongCategory(song: LibrarySong) {
  if (song.source === "built-in") return "built-in";
  return song.libraryGroup === "converted" ? "converted" : "local-imports";
}

export function getLibraryCategoryItems(
  items: LibrarySongListItem[], category: LibraryCategoryId, playlist: UserPlaylist | null = null,
) {
  if (category === "liked") return items.filter(item => item.isLiked);
  if (category === "playlists") {
    const byId = new Map(items.map(item => [item.librarySong.id, item]));
    return (playlist?.songIds ?? []).flatMap(id => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }
  // Playlist copies are private to their playlist; never list them as
  // browsable library entries so the original delete can't cascade into them.
  return items.filter(
    item =>
      !isPlaylistCopySong(item.librarySong) &&
      getLibrarySongCategory(item.librarySong) === category,
  );
}

export function getLocalLibraryMoveTarget(song: LibrarySong): LocalLibraryGroup | null {
  if (song.source !== "local-import") return null;
  // 歌单私有副本归所属歌单管理，生命周期与普通本地曲谱不同：
  // 允许改分类会让它脱离「私有副本」身份，之后既不会被列表展示，
  // 也不会被副本清理逻辑识别，从而变成无人管理的孤儿文件。
  if (song.libraryGroup === "playlist-copy") return null;
  if (song.libraryGroup === "converted") return "imported";
  return getLibrarySongFormatVersion(song) === 2 ? "converted" : null;
}

// A virtual move changes only the record's group. IDs, metadata, storage paths,
// and the underlying array order (used by playback indices) stay intact.
export function moveLocalLibrarySong(
  songs: LocalLibrarySong[], songId: LibrarySongId, group: LocalLibraryGroup,
) {
  const song = songs.find(candidate => candidate.id === songId);
  if (!song || (song.libraryGroup ?? "imported") === group) return songs;
  // 私有副本不允许改分类，否则它会脱离副本清理机制。
  if (song.libraryGroup === "playlist-copy") return songs;
  if (group === "converted" && getLibrarySongFormatVersion(song) !== 2) return songs;
  return songs.map(candidate => candidate === song ? { ...candidate, libraryGroup: group } : candidate);
}
