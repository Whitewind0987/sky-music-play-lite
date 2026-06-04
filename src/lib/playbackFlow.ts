import type { PlaybackMode } from "../types/playbackOptions";

export type PlaybackFinishDecision =
  | { type: "repeat-current" }
  | { nextSongIndex: number; type: "play-next" }
  | { type: "finish" };

export function getRandomNextSongIndex(
  currentIndex: number,
  songCount: number,
) {
  if (songCount <= 1) {
    return currentIndex;
  }

  let nextIndex = currentIndex;

  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * songCount);
  }

  return nextIndex;
}

export function decidePlaybackFinish({
  allowLibraryFallback = true,
  currentSongIndex,
  isShuffleEnabled,
  playbackMode,
  queuedSongIndex = null,
  songCount,
}: {
  allowLibraryFallback?: boolean;
  currentSongIndex: number;
  isShuffleEnabled: boolean;
  playbackMode: PlaybackMode;
  queuedSongIndex?: number | null;
  songCount: number;
}): PlaybackFinishDecision {
  if (playbackMode === "repeat-one") {
    return { type: "repeat-current" };
  }

  if (queuedSongIndex !== null) {
    return { nextSongIndex: queuedSongIndex, type: "play-next" };
  }

  if (playbackMode !== "repeat-all" || !allowLibraryFallback) {
    return { type: "finish" };
  }

  if (songCount <= 0) {
    return { nextSongIndex: currentSongIndex, type: "play-next" };
  }

  if (isShuffleEnabled && songCount > 1) {
    return {
      nextSongIndex: getRandomNextSongIndex(currentSongIndex, songCount),
      type: "play-next",
    };
  }

  return {
    nextSongIndex: (currentSongIndex + 1) % songCount,
    type: "play-next",
  };
}
