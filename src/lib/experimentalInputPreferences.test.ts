import { describe, expect, it } from "vitest";
import {
  normalizeTargetWindowCompatibilityProfile,
  normalizeTargetWindowMessageMethod,
} from "./experimentalInputPreferences";

describe("normalizeTargetWindowMessageMethod", () => {
  it.each(["send-message", "post-message", "unknown", null])(
    "normalizes %s to post-message",
    (value) => {
      expect(normalizeTargetWindowMessageMethod(value)).toBe("post-message");
    },
  );
});

describe("normalizeTargetWindowCompatibilityProfile", () => {
  it.each([
    "standard",
    "legacy-vkscan-zero-lparam",
    "legacy-vkscan-scan-lparam",
    "unknown",
    null,
  ])("normalizes %s to the recommended profile", (value) => {
    expect(normalizeTargetWindowCompatibilityProfile(value)).toBe(
      "legacy-activate-scan-lparam",
    );
  });

  it("preserves grouped-legacy", () => {
    expect(normalizeTargetWindowCompatibilityProfile("grouped-legacy")).toBe(
      "grouped-legacy",
    );
  });

  it("preserves legacy-activate-scan-lparam", () => {
    expect(
      normalizeTargetWindowCompatibilityProfile(
        "legacy-activate-scan-lparam",
      ),
    ).toBe("legacy-activate-scan-lparam");
  });
});
