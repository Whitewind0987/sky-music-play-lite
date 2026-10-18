// SPDX-FileCopyrightText: 2026 Whitewind0987
// SPDX-License-Identifier: GPL-3.0-only

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
