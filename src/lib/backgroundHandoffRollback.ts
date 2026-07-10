import type { LibrarySong, LibrarySongId } from "../types/library";

export function resolveLibrarySongIndexById(
  librarySongs: LibrarySong[],
  songId: LibrarySongId | null,
): number | null {
  if (songId === null) {
    return null;
  }

  const songIndex = librarySongs.findIndex(
    (librarySong) => librarySong.id === songId,
  );

  return songIndex >= 0 ? songIndex : null;
}

export function resolveBackgroundHandoffRollbackSongIndex({
  activeHandoffToken,
  handoffToken,
  librarySongs,
  rollbackPlaybackSongId,
}: {
  activeHandoffToken: number;
  handoffToken: number;
  librarySongs: LibrarySong[];
  rollbackPlaybackSongId: LibrarySongId | null;
}): number | null | undefined {
  if (activeHandoffToken !== handoffToken) {
    return undefined;
  }

  return resolveLibrarySongIndexById(librarySongs, rollbackPlaybackSongId);
}
