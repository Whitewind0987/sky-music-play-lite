import { describe, expect, it } from "vitest";
import {
  createManualStepHoldGesture,
  type ManualStepHoldScheduler,
} from "./manualStepHoldGesture";

function createScheduler() {
  let nextId = 1;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  const scheduler: ManualStepHoldScheduler = {
    clearInterval: (id) => intervals.delete(id),
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (callback) => {
      const id = nextId++;
      intervals.set(id, callback);
      return id;
    },
    setTimeout: (callback) => {
      const id = nextId++;
      timeouts.set(id, callback);
      return id;
    },
  };

  return {
    fireIntervals() {
      for (const callback of [...intervals.values()]) callback();
    },
    fireTimeouts() {
      const callbacks = [...timeouts.values()];
      timeouts.clear();
      for (const callback of callbacks) callback();
    },
    scheduler,
  };
}

function setup() {
  const clock = createScheduler();
  let held = false;
  let steps = 0;
  const gesture = createManualStepHoldGesture({
    holdDelayMs: 350,
    onHeldChange: (nextHeld) => {
      held = nextHeld;
    },
    onStep: () => {
      steps += 1;
    },
    repeatIntervalMs: 120,
    scheduler: clock.scheduler,
  });
  return { clock, gesture, getHeld: () => held, getSteps: () => steps };
}

describe("Manual Step pointer hold gesture", () => {
  it("steps immediately and suppresses the trailing click after a short press", () => {
    const { clock, gesture, getSteps } = setup();

    expect(gesture.begin(1)).toBe(true);
    expect(getSteps()).toBe(1);
    expect(gesture.end(1)).toBe(true);
    clock.fireTimeouts();
    clock.fireIntervals();
    expect(gesture.consumeClick(true)).toBe(false);
    expect(getSteps()).toBe(1);
  });

  it("repeats after the threshold and stops on release", () => {
    const { clock, gesture, getSteps } = setup();

    gesture.begin(1);
    clock.fireTimeouts();
    clock.fireIntervals();
    expect(getSteps()).toBe(2);
    gesture.end(1);
    clock.fireIntervals();
    expect(getSteps()).toBe(2);
  });

  it("cannot cross a terminal score boundary during the same physical hold", () => {
    const { clock, gesture, getHeld, getSteps } = setup();

    gesture.begin(1);
    clock.fireTimeouts();
    clock.fireIntervals();
    gesture.terminateAtScoreBoundary();
    expect(getHeld()).toBe(false);

    clock.fireIntervals();
    expect(getSteps()).toBe(2);
    expect(gesture.end(1)).toBe(false);
    expect(gesture.consumeClick(true)).toBe(false);
    expect(getSteps()).toBe(2);
  });

  it("survives transient ownership unavailability until Manual becomes active", () => {
    const { clock, gesture, getHeld, getSteps } = setup();

    gesture.begin(1);
    expect(getHeld()).toBe(true);
    clock.fireTimeouts();
    clock.fireIntervals();
    expect(getSteps()).toBe(2);
  });

  it("keeps keyboard activation as one Step", () => {
    const { gesture, getSteps } = setup();

    expect(gesture.consumeClick(false)).toBe(true);
    expect(getSteps()).toBe(1);
  });
});
