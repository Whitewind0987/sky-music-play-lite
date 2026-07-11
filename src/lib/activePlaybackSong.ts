import type { LibrarySong, LibrarySongId } from "../types/library";

export function resolveActivePlaybackSongIndex({
  librarySongs,
  songId,
}: {
  librarySongs: LibrarySong[];
  songId: LibrarySongId | null;
}): number | null {
  if (songId === null) {
    return null;
  }

  const songIndex = librarySongs.findIndex(
    (librarySong) => librarySong.id === songId,
  );

  return songIndex >= 0 ? songIndex : null;
}
