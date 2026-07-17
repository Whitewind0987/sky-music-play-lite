export type SynchronousBooleanRef = {
  current: boolean;
};

export function getIsScoreUpgradeInProgress(
  inProgressRef: SynchronousBooleanRef,
) {
  return inProgressRef.current;
}

export async function runWithScoreUpgradeInProgress<T>(
  inProgressRef: SynchronousBooleanRef,
  operation: () => Promise<T>,
) {
  inProgressRef.current = true;

  try {
    return await operation();
  } finally {
    inProgressRef.current = false;
  }
}
