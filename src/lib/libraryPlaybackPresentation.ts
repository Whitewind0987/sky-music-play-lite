import type { LibrarySongId } from "../types/library";
import type { PlaybackState } from "../types/playback";
import type { ManualPlaybackUiState } from "./manualPlaybackState";

export type LibraryPlaybackIndicator =
  | "playing"
  | "paused"
  | "manual"
  | "releasing";

// Presentation only: selection never determines whether a row is playing.
export function getLibraryPlaybackIndicator({
  songId,
  playbackSongId,
  playbackState,
  manualState,
}: {
  songId: LibrarySongId;
  playbackSongId: LibrarySongId | null;
  playbackState: PlaybackState;
  manualState: ManualPlaybackUiState;
}): LibraryPlaybackIndicator | null {
  if (songId !== playbackSongId) return null;

  if (manualState === "active") return "manual";
  if (manualState === "tail") return "releasing";
  if (manualState !== "idle") return null;

  return playbackState === "playing" || playbackState === "paused"
    ? playbackState
    : null;
}
