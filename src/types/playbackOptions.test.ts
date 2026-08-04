import { describe, expect, it } from "vitest";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackSpeed,
  normalizeNoteIntervalDelay,
  normalizePlaybackSpeed,
  noteIntervalDelayLimits,
  playbackSpeedLimits,
} from "./playbackOptions";

describe("playback speed", () => {
  it("uses 0.1 for step controls", () => {
    expect(playbackSpeedLimits.buttonStep).toBe(0.1);
    expect(playbackSpeedLimits.inputStep).toBe(0.01);
  });

  it.each([0.25, 0.4, 0.85, 1.1, 1.17, 2.95])(
    "preserves valid custom speed %s",
    (value) => {
      expect(normalizePlaybackSpeed(value)).toBe(value);
    },
  );

  it("clamps values to the supported range", () => {
    expect(normalizePlaybackSpeed(0.1)).toBe(0.25);
    expect(normalizePlaybackSpeed(4)).toBe(3);
  });

  it("uses the fallback for non-finite values", () => {
    expect(normalizePlaybackSpeed(Number.NaN)).toBe(defaultPlaybackSpeed);
    expect(normalizePlaybackSpeed(Number.POSITIVE_INFINITY, 1.17)).toBe(1.17);
  });
});

describe("note interval delay", () => {
  it("separates the 10 ms button step from the 1 ms input step", () => {
    expect(noteIntervalDelayLimits.buttonStep).toBe(10);
    expect(noteIntervalDelayLimits.inputStep).toBe(1);
  });

  it.each([-199, -137, -1, 1, 7, 63, 123, 499])(
    "preserves custom whole-millisecond value %s",
    (value) => expect(normalizeNoteIntervalDelay(value)).toBe(value),
  );

  it.each([
    [7.4, 7],
    [7.6, 8],
    [-300, -200],
    [800, 500],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeNoteIntervalDelay(value)).toBe(expected);
  });

  it("uses the fallback for non-finite values", () => {
    expect(normalizeNoteIntervalDelay(Number.NaN)).toBe(
      defaultNoteIntervalDelayMs,
    );
    expect(normalizeNoteIntervalDelay(Number.POSITIVE_INFINITY, -137)).toBe(
      -137,
    );
  });
});
