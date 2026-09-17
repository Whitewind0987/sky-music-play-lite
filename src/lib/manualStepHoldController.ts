import type { ManualPlaybackStepResponse } from "./tauriApi";

export type ManualStepHoldSource =
  | `pointer:${number}`
  | "shortcut:global"
  | "shortcut:in-app";

export type ManualStepHoldScheduler = {
  clearTimeout: (timerId: number) => void;
  setTimeout: (callback: () => void, delayMs: number) => number;
};

type ManualStepHoldControllerOptions = {
  getPlaybackSpeed: () => number;
  onStep: () => Promise<ManualPlaybackStepResponse | null>;
  scheduler: ManualStepHoldScheduler;
};

export function getManualStepHoldDelayMs(
  response: ManualPlaybackStepResponse,
  playbackSpeed: number,
): number | null {
  if (
    response.state !== "active" ||
    !response.hasNextGroup ||
    response.nextSourceTimeMs === null ||
    !Number.isFinite(response.sourceTimeMs) ||
    !Number.isFinite(response.nextSourceTimeMs) ||
    !Number.isFinite(playbackSpeed) ||
    playbackSpeed <= 0
  ) {
    return null;
  }

  const sourceGapMs = response.nextSourceTimeMs - response.sourceTimeMs;
  const delayMs = sourceGapMs / playbackSpeed;
  return sourceGapMs > 0 && Number.isFinite(delayMs) && delayMs >= 0
    ? delayMs
    : null;
}

export function createManualStepHoldController({
  getPlaybackSpeed,
  onStep,
  scheduler,
}: ManualStepHoldControllerOptions) {
  let generation = 0;
  let owner: ManualStepHoldSource | null = null;
  let timerId: number | null = null;

  function clearTimer() {
    if (timerId === null) return;
    scheduler.clearTimeout(timerId);
    timerId = null;
  }

  function cancelCurrentHold() {
    generation += 1;
    clearTimer();
    owner = null;
  }

  async function stepAndSchedule(token: number) {
    let response: ManualPlaybackStepResponse | null;
    try {
      response = await onStep();
    } catch {
      response = null;
    }

    if (token !== generation || owner === null) return;
    if (response === null) {
      cancelCurrentHold();
      return;
    }

    const delayMs = getManualStepHoldDelayMs(response, getPlaybackSpeed());
    if (delayMs === null) {
      cancelCurrentHold();
      return;
    }

    timerId = scheduler.setTimeout(() => {
      if (token !== generation || owner === null) return;
      timerId = null;
      void stepAndSchedule(token);
    }, delayMs);
  }

  return {
    begin(source: ManualStepHoldSource) {
      if (owner !== null) return false;
      owner = source;
      const token = generation + 1;
      generation = token;
      void stepAndSchedule(token);
      return true;
    },

    cancel() {
      cancelCurrentHold();
    },

    end(source: ManualStepHoldSource) {
      if (owner !== source) return false;
      cancelCurrentHold();
      return true;
    },

    getOwner() {
      return owner;
    },
  };
}
