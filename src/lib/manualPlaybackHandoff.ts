export function createManualPlaybackHandoffBarrier() {
  let handoffPending = false;
  let stepQueue: Promise<void> = Promise.resolve();

  return {
    enqueueStep(task: () => Promise<void>): Promise<boolean> {
      if (handoffPending) return Promise.resolve(false);

      const queuedTask = stepQueue.then(task);
      stepQueue = queuedTask.catch(() => {});
      return queuedTask.then(() => true);
    },

    async beginHandoff<T>(readFinalValue: () => T): Promise<T | null> {
      if (handoffPending) return null;

      handoffPending = true;
      const pendingSteps = stepQueue;
      await pendingSteps;
      return readFinalValue();
    },

    finishHandoff() {
      stepQueue = Promise.resolve();
      handoffPending = false;
    },

    reset() {
      stepQueue = Promise.resolve();
      handoffPending = false;
    },

    isHandoffPending() {
      return handoffPending;
    },
  };
}
