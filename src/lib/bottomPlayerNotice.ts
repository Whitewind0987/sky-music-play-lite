import type { ManualPlaybackUiState } from "./manualPlaybackState";

export type BottomPlayerNotice = "loading" | Exclude<ManualPlaybackUiState, "idle">;

// A presentation priority; this does not change either playback state machine.
export function getBottomPlayerNotice({
  isCurrentSongLoading,
  manualState,
}: {
  isCurrentSongLoading: boolean;
  manualState: ManualPlaybackUiState;
}): BottomPlayerNotice | null {
  if (manualState === "error") return "error";
  if (isCurrentSongLoading) return "loading";
  return manualState === "idle" ? null : manualState;
}
