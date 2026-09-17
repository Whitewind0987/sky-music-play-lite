import { describe, expect, it } from "vitest";
import { createManualStepPointerGesture } from "./manualStepPointerGesture";

function setup() {
  const begins: number[] = [];
  const ends: number[] = [];
  let held = false;
  let keyboardSteps = 0;
  const gesture = createManualStepPointerGesture({
    onBegin: (pointerId) => begins.push(pointerId),
    onEnd: (pointerId) => ends.push(pointerId),
    onHeldChange: (nextHeld) => {
      held = nextHeld;
    },
    onKeyboardStep: () => {
      keyboardSteps += 1;
    },
  });
  return {
    begins,
    ends,
    gesture,
    getHeld: () => held,
    getKeyboardSteps: () => keyboardSteps,
  };
}

describe("Manual Step pointer gesture", () => {
  it("maps each rapid physical press to one begin and suppresses trailing clicks", () => {
    const { begins, ends, gesture } = setup();

    for (let pointerId = 1; pointerId <= 3; pointerId += 1) {
      expect(gesture.begin(pointerId)).toBe(true);
      expect(gesture.end(pointerId)).toBe(true);
      expect(gesture.consumeClick(true)).toBe(false);
    }

    expect(begins).toEqual([1, 2, 3]);
    expect(ends).toEqual([1, 2, 3]);
  });

  it("preserves click suppression when terminal state ends a held pointer", () => {
    const { begins, ends, gesture, getHeld } = setup();

    gesture.begin(7);
    expect(getHeld()).toBe(true);
    expect(gesture.terminate()).toBe(true);
    expect(getHeld()).toBe(false);
    expect(gesture.consumeClick(true)).toBe(false);
    expect(begins).toEqual([7]);
    expect(ends).toEqual([7]);
  });

  it("keeps keyboard-generated click as exactly one Step", () => {
    const { gesture, getKeyboardSteps } = setup();

    expect(gesture.consumeClick(false)).toBe(true);
    expect(getKeyboardSteps()).toBe(1);
  });

  it("ignores duplicate begin and a different pointer's release", () => {
    const { begins, ends, gesture } = setup();

    expect(gesture.begin(1)).toBe(true);
    expect(gesture.begin(1)).toBe(false);
    expect(gesture.begin(2)).toBe(false);
    expect(gesture.end(2)).toBe(false);
    expect(gesture.end(1)).toBe(true);
    expect(begins).toEqual([1]);
    expect(ends).toEqual([1]);
  });
});
