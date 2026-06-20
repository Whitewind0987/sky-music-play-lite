import { describe, expect, it } from "vitest";
import { shouldSkipTargetWindowEnumerationBeforePlayback } from "./usePlaybackCoordinator";

describe("shouldSkipTargetWindowEnumerationBeforePlayback", () => {
  it("skips full window enumeration for ordinary target-window song switches", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: "1234",
      }),
    ).toBe(true);
  });

  it("still requires the existing missing-target handling when no target is selected", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: null,
      }),
    ).toBe(false);
  });

  it("does not enumerate windows for non-target playback modes", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "preview",
        selectedWindowHwnd: null,
      }),
    ).toBe(true);
  });
});
