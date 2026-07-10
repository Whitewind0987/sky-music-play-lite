import type { Song } from "../types/score";

export async function prepareWarmPlaybackPlan<T>({
  prepareResolvedSong,
  resolveSongForWarmPreparation,
  songIndex,
}: {
  prepareResolvedSong: (resolvedSong: Song) => Promise<T>;
  resolveSongForWarmPreparation: (songIndex: number) => Promise<Song | null>;
  songIndex: number;
}): Promise<T | null> {
  const resolvedSong = await resolveSongForWarmPreparation(songIndex);

  if (resolvedSong === null) {
    return null;
  }

  return prepareResolvedSong(resolvedSong);
}
