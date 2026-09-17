export type ManualPlaybackHandoffOperation = Readonly<{
  pendingSteps: Promise<void>;
  token: number;
}>;

export function isManualPlaybackHandoffOwnershipCurrent({
  currentRequestToken,
  currentSessionId,
  expectedRequestToken,
  expectedSessionId,
}: {
  currentRequestToken: number;
  currentSessionId: number | null;
  expectedRequestToken: number;
  expectedSessionId: number;
}) {
  return (
    currentSessionId === expectedSessionId &&
    currentRequestToken === expectedRequestToken
  );
}

export function createManualPlaybackHandoffBarrier() {
  let activeHandoffToken: number | null = null;
  let generation = 0;
  let stepQueue: Promise<void> = Promise.resolve();

  return {
    enqueueStep(task: () => Promise<void>): Promise<boolean> {
      if (activeHandoffToken !== null) return Promise.resolve(false);

      const queuedTask = stepQueue.then(task);
      stepQueue = queuedTask.catch(() => {});
      return queuedTask.then(() => true);
    },

    beginHandoff(): ManualPlaybackHandoffOperation | null {
      if (activeHandoffToken !== null) return null;

      const token = generation + 1;
      generation = token;
      activeHandoffToken = token;
      return { pendingSteps: stepQueue, token };
    },

    finishHandoff(token: number) {
      if (activeHandoffToken !== token) return false;

      stepQueue = Promise.resolve();
      activeHandoffToken = null;
      return true;
    },

    invalidate() {
      generation += 1;
      stepQueue = Promise.resolve();
      activeHandoffToken = null;
    },

    isHandoffPending() {
      return activeHandoffToken !== null;
    },

    isCurrent(token: number) {
      return activeHandoffToken === token;
    },

    async waitForPendingSteps(operation: ManualPlaybackHandoffOperation) {
      await operation.pendingSteps;
      return activeHandoffToken === operation.token;
    },
  };
}
