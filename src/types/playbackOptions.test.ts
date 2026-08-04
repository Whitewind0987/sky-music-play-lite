import { describe, expect, it } from "vitest";
import {
  defaultPlaybackSpeed,
  normalizePlaybackSpeed,
  playbackSpeedLimits,
} from "./playbackOptions";

describe("playback speed", () => {
  it("uses 0.1 for step controls", () => {
    expect(playbackSpeedLimits.step).toBe(0.1);
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
