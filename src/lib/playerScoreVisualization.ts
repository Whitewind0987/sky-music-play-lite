import type { SkyKeyName } from "../types/keyMapping";
import type { PlaybackState } from "../types/playback";
import type { ScoreVisualGroup } from "../types/scoreVisualization";
import {
  findCurrentScoreVisualGroupIndex,
  getActiveScoreVisualKeys,
  getScoreVisualPageIndexForGroup,
} from "./scoreVisualization";

export type PlayerScoreVisualizationFrame = {
  activeKeys: readonly SkyKeyName[];
  focusGroupIndex: number;
  pageIndex: number;
  markCurrentGroup: boolean;
};

const emptyPlayerScoreVisualizationFrame: PlayerScoreVisualizationFrame = {
  activeKeys: [],
  focusGroupIndex: -1,
  pageIndex: 0,
  markCurrentGroup: false,
};

export function derivePlayerScoreVisualizationFrame(
  groups: readonly ScoreVisualGroup[],
  playbackState: PlaybackState,
  currentMs: number,
): PlayerScoreVisualizationFrame {
  if (
    groups.length === 0 ||
    !Number.isFinite(currentMs) ||
    (playbackState !== "playing" &&
      playbackState !== "paused" &&
      playbackState !== "finished")
  ) {
    return emptyPlayerScoreVisualizationFrame;
  }

  const focusGroupIndex = findCurrentScoreVisualGroupIndex(groups, currentMs);
  const pageIndex = getScoreVisualPageIndexForGroup(
    focusGroupIndex,
    groups.length,
  );

  if (focusGroupIndex < 0 || pageIndex < 0) {
    return emptyPlayerScoreVisualizationFrame;
  }

  return {
    activeKeys:
      playbackState === "finished"
        ? []
        : getActiveScoreVisualKeys(groups, currentMs),
    focusGroupIndex,
    pageIndex,
    markCurrentGroup: true,
  };
}
