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
  const song = songs.find(candidate => candidate.id === songId);
  if (!song || (song.libraryGroup ?? "imported") === group) return songs;
  if (group === "converted" && getLibrarySongFormatVersion(song) !== 2) return songs;
  return songs.map(candidate => candidate === song ? { ...candidate, libraryGroup: group } : candidate);
}
