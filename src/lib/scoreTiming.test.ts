import { describe, expect, it } from "vitest";
import { calculateScoreTiming } from "./scoreTiming";

describe("calculateScoreTiming", () => {
  it("keeps an early 1000ms hold after negative interval compression", () => {
    const timing = calculateScoreTiming(
      [
        { time: 0, key: "Key0", duration: 1000 },
        { time: 500, key: "Key1" },
      ],
      { noteIntervalDelayMs: -200, playbackSpeed: 1 },
    );

    expect(timing.groups.map((group) => group.adjustedStartMs)).toEqual([0, 300]);
    expect(timing.totalMs).toBe(1000);
    expect(timing.finishMs).toBe(1000);
  });

  it("keeps an early hold spanning several compressed groups", () => {
    const timing = calculateScoreTiming(
      [
        { time: 0, key: "Key0", duration: 2000 },
        { time: 500, key: "Key1" },
        { time: 1000, key: "Key2" },
      ],
      { noteIntervalDelayMs: -300, playbackSpeed: 1 },
    );

    expect(timing.groups.map((group) => group.adjustedStartMs)).toEqual([0, 200, 400]);
    expect(timing.totalMs).toBe(2000);
    expect(timing.finishMs).toBe(2000);
  });

  it.each([
    [0.5, 2000],
    [1, 1000],
    [2, 500],
  ])("scales explicit holds at playback speed %s", (playbackSpeed, totalMs) => {
    const timing = calculateScoreTiming(
      [
        { time: 0, key: "Key0", duration: 1000 },
        { time: 500, key: "Key1" },
      ],
      { noteIntervalDelayMs: 200, playbackSpeed },
    );

    expect(timing.totalMs).toBe(totalMs);
  });

  it("keeps point-note total and finish semantics distinct", () => {
    const timing = calculateScoreTiming(
      [
        { time: 0, key: "Key0" },
        { time: 500, key: "Key1" },
      ],
      { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    );

    expect(timing.totalMs).toBe(500);
    expect(timing.finishMs).toBe(800);
  });
});
