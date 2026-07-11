import { resolveActivePlaybackSongIndex } from "./activePlaybackSong";
import type { LibrarySong, LibrarySongId } from "../types/library";

export function resolveManualNextCurrentSongIndex({
  activeSongId,
  librarySongs,
  playbackSongIndex,
  selectedSongIndex,
}: {
  activeSongId: LibrarySongId | null;
  librarySongs: LibrarySong[];
  playbackSongIndex: number | null;
  selectedSongIndex: number | null;
}): number | null {
  if (activeSongId !== null) {
    return resolveActivePlaybackSongIndex({
      librarySongs,
      songId: activeSongId,
    });
  }

  const fallbackSongIndex = playbackSongIndex ?? selectedSongIndex;

  return fallbackSongIndex !== null && librarySongs[fallbackSongIndex]
    ? fallbackSongIndex
    : null;
}
