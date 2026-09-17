export type ManualStepHoldScheduler = {
  clearInterval: (timerId: number) => void;
  clearTimeout: (timerId: number) => void;
  setInterval: (callback: () => void, delayMs: number) => number;
  setTimeout: (callback: () => void, delayMs: number) => number;
};

type ManualStepHoldGestureOptions = {
  holdDelayMs: number;
  onHeldChange: (held: boolean) => void;
  onStep: () => void;
  repeatIntervalMs: number;
  scheduler: ManualStepHoldScheduler;
};

export function createManualStepHoldGesture({
  holdDelayMs,
  onHeldChange,
  onStep,
  repeatIntervalMs,
  scheduler,
}: ManualStepHoldGestureOptions) {
  let holdTimerId: number | null = null;
  let pointerId: number | null = null;
  let repeatTimerId: number | null = null;
  let suppressClick = false;

  function clearTimers() {
    if (holdTimerId !== null) {
      scheduler.clearTimeout(holdTimerId);
      holdTimerId = null;
    }
    if (repeatTimerId !== null) {
      scheduler.clearInterval(repeatTimerId);
      repeatTimerId = null;
    }
  }

  function finishPress({ preserveClickSuppression }: {
    preserveClickSuppression: boolean;
  }) {
    clearTimers();
    pointerId = null;
    onHeldChange(false);
    if (!preserveClickSuppression) suppressClick = false;
  }

  return {
    begin(nextPointerId: number) {
      if (pointerId !== null) return false;

      pointerId = nextPointerId;
      suppressClick = true;
      onHeldChange(true);
      onStep();
      holdTimerId = scheduler.setTimeout(() => {
        holdTimerId = null;
        repeatTimerId = scheduler.setInterval(onStep, repeatIntervalMs);
      }, holdDelayMs);
      return true;
    },

    cancel(nextPointerId: number) {
      if (pointerId !== nextPointerId) return false;
      finishPress({ preserveClickSuppression: false });
      return true;
    },

    consumeClick(isPointerClick: boolean) {
      if (!isPointerClick) {
        onStep();
        return true;
      }
      if (suppressClick) {
        suppressClick = false;
        return false;
      }
      onStep();
      return true;
    },

    dispose() {
      finishPress({ preserveClickSuppression: false });
    },

    end(nextPointerId: number) {
      if (pointerId !== nextPointerId) return false;
      finishPress({ preserveClickSuppression: true });
      return true;
    },

    invalidate() {
      if (pointerId === null) return;
      finishPress({ preserveClickSuppression: true });
    },

    losePointerCapture() {
      if (pointerId === null) return;
      finishPress({ preserveClickSuppression: true });
    },

    terminateAtScoreBoundary() {
      if (pointerId === null) return;
      finishPress({ preserveClickSuppression: true });
    },
  };
}
