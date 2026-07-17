export type ScoreUpgradePlaybackStartResult = "blocked" | "started";

export function runScoreUpgradePlaybackStartGuard({
  getIsScoreUpgradeInProgress,
  onBlocked,
  onStart,
}: {
  getIsScoreUpgradeInProgress: () => boolean;
  onBlocked: () => void;
  onStart: () => void;
}): ScoreUpgradePlaybackStartResult {
  if (getIsScoreUpgradeInProgress()) {
    onBlocked();
    return "blocked";
  }

  onStart();
  return "started";
}
