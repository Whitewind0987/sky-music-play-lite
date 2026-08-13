import { describe, expect, it } from "vitest";
import {
  defaultAccentColor,
  deriveAccentContrastColor,
  deriveAccentHoverColor,
  deriveAccentRgb,
  isValidAccentColor,
  normalizeAccentColor,
} from "./accentColor";

describe("accent color", () => {
  it("uses the existing blue as the default", () => {
    expect(defaultAccentColor).toBe("#2f80ed");
  });

  it("accepts a valid lowercase color", () => {
    expect(normalizeAccentColor("#ff00aa")).toBe("#ff00aa");
  });

  it("normalizes a valid uppercase color", () => {
    expect(normalizeAccentColor("#12ABEF")).toBe("#12abef");
  });

  it.each(["red", "#123", "#zzzzzz", "var(--whatever)"])(
    "rejects invalid color %s",
    (value) => {
      expect(normalizeAccentColor(value)).toBe(defaultAccentColor);
    },
  );

  it("uses the default for a missing value", () => {
    expect(normalizeAccentColor(undefined)).toBe(defaultAccentColor);
  });

  it.each([
    ["#8952EE", true],
    ["#8952ee", true],
    ["#8952E", false],
    ["8952EE", false],
    ["#8952EEEE", false],
    ["#ZZ52EE", false],
  ])("validates six-digit HEX color %s", (value, expected) => {
    expect(isValidAccentColor(value)).toBe(expected);
  });

  it("derives the CSS RGB channel list", () => {
    expect(deriveAccentRgb("#2f80ed")).toBe("47, 128, 237");
  });

  it("derives a deterministic darker hover color", () => {
    expect(deriveAccentHoverColor("#2f80ed")).toBe("#2971d1");
  });

  it("uses a light foreground for a dark accent", () => {
    expect(deriveAccentContrastColor("#29104a")).toBe("#ffffff");
  });

  it("uses a dark foreground for a very light accent", () => {
    expect(deriveAccentContrastColor("#fff4b8")).toBe("#111827");
  });
});
