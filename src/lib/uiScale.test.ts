import { describe, expect, it } from "vitest";
import {
  defaultUiScale,
  getEffectiveUiScale,
  isUiScale,
  normalizeUiScale,
} from "./uiScale";

describe("ui scale", () => {
  it("defaults to 110%", () => {
    expect(defaultUiScale).toBe(1.1);
  });

  it("accepts the three presets", () => {
    expect(isUiScale(1)).toBe(true);
    expect(isUiScale(1.1)).toBe(true);
    expect(isUiScale(1.2)).toBe(true);
    expect(normalizeUiScale(1.2)).toBe(1.2);
  });

  it("falls back to the default for invalid values", () => {
    expect(normalizeUiScale(undefined)).toBe(defaultUiScale);
    expect(normalizeUiScale(null)).toBe(defaultUiScale);
    expect(normalizeUiScale("1.2")).toBe(defaultUiScale);
    expect(normalizeUiScale(1.15)).toBe(defaultUiScale);
    expect(normalizeUiScale(2)).toBe(defaultUiScale);
    expect(normalizeUiScale(Number.NaN)).toBe(defaultUiScale);
  });

  it("keeps the preferred scale when the window is large enough", () => {
    expect(getEffectiveUiScale(1.2, 1100, 725)).toBe(1.2);
  });

  it("limits the scale so the layout never drops below 480x320", () => {
    expect(getEffectiveUiScale(1.2, 480, 320)).toBe(1);
    expect(getEffectiveUiScale(1.1, 528, 400)).toBeCloseTo(1.1);
    expect(getEffectiveUiScale(1.2, 540, 600)).toBeCloseTo(540 / 480);
  });

  it("never scales below 100%", () => {
    expect(getEffectiveUiScale(1, 300, 200)).toBe(1);
    expect(getEffectiveUiScale(1.2, 300, 200)).toBe(1);
  });

  it("ignores unusable window sizes", () => {
    expect(getEffectiveUiScale(1.1, 0, 0)).toBe(1.1);
    expect(getEffectiveUiScale(1.1, Number.NaN, 720)).toBe(1.1);
  });
});
