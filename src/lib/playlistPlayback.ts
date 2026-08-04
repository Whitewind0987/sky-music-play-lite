import type { LibrarySong, LibrarySongId } from "../types/library";

export function resolvePlaylistSongIndices(
  songIds: LibrarySongId[],
  librarySongs: LibrarySong[],
) {
  const songIndexById = new Map(
    librarySongs.map((librarySong, songIndex) => [librarySong.id, songIndex]),
  );

  return songIds
    .map((songId) => songIndexById.get(songId))
    .filter((songIndex): songIndex is number => songIndex !== undefined);
}

export async function startPlaylistPlaybackQueue({
  replaceQueue,
  songIndices,
  startFirstSong,
}: {
  replaceQueue: (songIndices: number[]) => void;
  songIndices: number[];
  startFirstSong: (songIndex: number) => Promise<boolean>;
}) {
  const firstSongIndex = songIndices[0];

  if (firstSongIndex === undefined || !(await startFirstSong(firstSongIndex))) {
    return false;
  }

  replaceQueue(songIndices);
  return true;
}
