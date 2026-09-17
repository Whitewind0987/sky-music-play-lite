import { describe, expect, it } from "vitest";
import {
  createManualStepHoldController,
  getManualStepHoldDelayMs,
  type ManualStepHoldScheduler,
  type ManualStepHoldSource,
} from "./manualStepHoldController";
import type { ManualPlaybackStepResponse } from "./tauriApi";

function response(
  sourceTimeMs: number,
  nextSourceTimeMs: number | null,
): ManualPlaybackStepResponse {
  return {
    didAdvance: true,
    groupCount: 3,
    groupIndex: sourceTimeMs === 0 ? 0 : sourceTimeMs === 500 ? 1 : 2,
    hasNextGroup: nextSourceTimeMs !== null,
    nextSourceTimeMs,
    sessionId: 7,
    sourceTimeMs,
    state: nextSourceTimeMs === null ? "tail" : "active",
    totalMs: 1_500,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createScheduler() {
  let nextId = 1;
  let lastCallback: (() => void) | null = null;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const delays: number[] = [];
  const scheduler: ManualStepHoldScheduler = {
    clearTimeout: (id) => {
      timers.delete(id);
    },
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { callback, delayMs });
      delays.push(delayMs);
      lastCallback = callback;
      return id;
    },
  };
  return {
    delays,
    fireNext() {
      const entry = timers.entries().next().value as
        | [number, { callback: () => void; delayMs: number }]
        | undefined;
      if (!entry) return false;
      timers.delete(entry[0]);
      entry[1].callback();
      return true;
    },
    fireLastEvenIfCleared() {
      lastCallback?.();
    },
    getTimerCount: () => timers.size,
    scheduler,
  };
}

describe("Manual Step hold timing", () => {
  it.each([
    [1, 500, 1_000],
    [2, 250, 500],
    [0.5, 1_000, 2_000],
  ])("scales variable source gaps at %sx", (speed, first, second) => {
    expect(getManualStepHoldDelayMs(response(0, 500), speed)).toBe(first);
    expect(getManualStepHoldDelayMs(response(500, 1_500), speed)).toBe(second);
  });

  it("rejects terminal, non-increasing, and invalid timing without a fallback", () => {
    expect(getManualStepHoldDelayMs(response(1_500, null), 1)).toBeNull();
    expect(getManualStepHoldDelayMs(response(500, 500), 1)).toBeNull();
    expect(getManualStepHoldDelayMs(response(0, 500), 0)).toBeNull();
    expect(getManualStepHoldDelayMs(response(0, Number.NaN), 1)).toBeNull();
  });

  it("waits for an asynchronous Step before arming one timeout", async () => {
    const clock = createScheduler();
    const firstStep = deferred<ManualPlaybackStepResponse | null>();
    let stepCount = 0;
    const controller = createManualStepHoldController({
      getPlaybackSpeed: () => 2,
      onStep: () => {
        stepCount += 1;
        return firstStep.promise;
      },
      scheduler: clock.scheduler,
    });

    expect(controller.begin("shortcut:global")).toBe(true);
    expect(stepCount).toBe(1);
    expect(clock.getTimerCount()).toBe(0);
    firstStep.resolve(response(500, 1_000));
    await firstStep.promise;
    await Promise.resolve();
    expect(clock.delays).toEqual([250]);
    expect(clock.getTimerCount()).toBe(1);
  });

  it("release cancels continuation and a fresh press steps immediately", async () => {
    const clock = createScheduler();
    let stepCount = 0;
    const controller = createManualStepHoldController({
      getPlaybackSpeed: () => 1,
      onStep: async () => {
        stepCount += 1;
        return response(0, 500);
      },
      scheduler: clock.scheduler,
    });

    controller.begin("pointer:1");
    await Promise.resolve();
    expect(clock.getTimerCount()).toBe(1);
    expect(controller.end("pointer:1")).toBe(true);
    expect(clock.getTimerCount()).toBe(0);
    expect(clock.fireNext()).toBe(false);

    controller.begin("pointer:2");
    await Promise.resolve();
    expect(stepCount).toBe(2);
  });

  it("rapid independent presses are not throttled by score timing", async () => {
    const clock = createScheduler();
    let stepCount = 0;
    const controller = createManualStepHoldController({
      getPlaybackSpeed: () => 1,
      onStep: async () => {
        stepCount += 1;
        return response(0, 1_000);
      },
      scheduler: clock.scheduler,
    });

    for (let pointerId = 1; pointerId <= 3; pointerId += 1) {
      const source: ManualStepHoldSource = `pointer:${pointerId}`;
      controller.begin(source);
      controller.end(source);
    }
    await Promise.resolve();

    expect(stepCount).toBe(3);
    expect(clock.getTimerCount()).toBe(0);
  });

  it("stops at the final group and after lifecycle cancellation", async () => {
    const clock = createScheduler();
    let stepCount = 0;
    let nextResponse = response(1_500, null);
    const controller = createManualStepHoldController({
      getPlaybackSpeed: () => 1,
      onStep: async () => {
        stepCount += 1;
        return nextResponse;
      },
      scheduler: clock.scheduler,
    });

    controller.begin("pointer:1");
    await Promise.resolve();
    expect(controller.getOwner()).toBeNull();
    expect(clock.getTimerCount()).toBe(0);

    nextResponse = response(0, 500);
    controller.begin("pointer:2");
    await Promise.resolve();
    expect(clock.getTimerCount()).toBe(1);
    controller.cancel();
    expect(clock.fireNext()).toBe(false);
    clock.fireLastEvenIfCleared();
    await Promise.resolve();
    expect(stepCount).toBe(2);
  });

  it("enforces one hold owner and ignores another source's release", async () => {
    const clock = createScheduler();
    let stepCount = 0;
    const controller = createManualStepHoldController({
      getPlaybackSpeed: () => 1,
      onStep: async () => {
        stepCount += 1;
        return response(0, 500);
      },
      scheduler: clock.scheduler,
    });

    expect(controller.begin("pointer:1")).toBe(true);
    expect(controller.begin("pointer:1")).toBe(false);
    expect(controller.begin("shortcut:global")).toBe(false);
    expect(controller.end("shortcut:global")).toBe(false);
    expect(controller.getOwner()).toBe("pointer:1");
    expect(controller.end("pointer:1")).toBe(true);
    expect(controller.begin("shortcut:global")).toBe(true);
    await Promise.resolve();
    expect(stepCount).toBe(2);
  });
});
