import type { LibrarySong, LibrarySongId } from "../types/library";

export type RemovedLibrarySong = {
  songId: LibrarySongId;
  songIndex: number;
};

export function collectRemovedLibrarySongs(
  librarySongs: LibrarySong[],
  removedSongIds: Iterable<LibrarySongId>,
): RemovedLibrarySong[] {
  const removedSongIdSet = new Set(removedSongIds);

  return librarySongs.flatMap((librarySong, songIndex) =>
    removedSongIdSet.has(librarySong.id)
      ? [{ songId: librarySong.id, songIndex }]
      : [],
  );
}

export function synchronizeRemovedLibrarySongsWithPlayback(
  removedSongs: RemovedLibrarySong[],
  {
    removeSongFromPlaybackContext,
    removeSongIndices,
  }: {
    removeSongFromPlaybackContext: (songId: LibrarySongId) => void;
    removeSongIndices: (songIndices: number[]) => void;
  },
) {
  if (removedSongs.length === 0) {
    return;
  }

  removeSongIndices(removedSongs.map((removedSong) => removedSong.songIndex));
  removedSongs.forEach((removedSong) => {
    removeSongFromPlaybackContext(removedSong.songId);
  });
}
