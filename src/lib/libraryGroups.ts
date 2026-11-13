// SPDX-FileCopyrightText: 2026 Whitewind0987
// SPDX-License-Identifier: GPL-3.0-only

import type { LibraryCategoryId } from "../components/AppShell";
import type { LibrarySong, LibrarySongId, LibrarySongListItem, LocalLibraryGroup, LocalLibrarySong, UserPlaylist } from "../types/library";
import { getLibrarySongFormatVersion } from "./libraryCollections";

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
  return items.filter(item => getLibrarySongCategory(item.librarySong) === category);
}

export function getLocalLibraryMoveTarget(song: LibrarySong): LocalLibraryGroup | null {
  if (song.source !== "local-import") return null;
  if (song.libraryGroup === "converted") return "imported";
  return getLibrarySongFormatVersion(song) === 2 ? "converted" : null;
}

// A virtual move changes only the record's group. IDs, metadata, storage paths,
// and the underlying array order (used by playback indices) stay intact.
export function moveLocalLibrarySong(
  songs: LocalLibrarySong[], songId: LibrarySongId, group: LocalLibraryGroup,
) {
  return moveLocalLibrarySongs(songs, [songId], group).songs;
}

export function moveLocalLibrarySongs(
  songs: LocalLibrarySong[], songIds: readonly LibrarySongId[], group: LocalLibraryGroup,
) {
  const selected = new Set(songIds);
  const moved = new Set<LibrarySongId>();
  const nextSongs = songs.map(song => {
    if (!selected.has(song.id) || getLocalLibraryMoveTarget(song) !== group) return song;
    moved.add(song.id);
    return { ...song, libraryGroup: group };
  });

  return {
    songs: moved.size === 0 ? songs : nextSongs,
    movedSongIds: [...selected].filter(id => moved.has(id)),
  };
}
