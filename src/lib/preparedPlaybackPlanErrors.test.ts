import { describe, expect, it } from "vitest";
import { isPreparedPlaybackPlanUnavailableError } from "./preparedPlaybackPlanErrors";

describe("isPreparedPlaybackPlanUnavailableError", () => {
  it("recognizes only the recoverable prepared-plan eviction error", () => {
    expect(
      isPreparedPlaybackPlanUnavailableError(
        "Prepared background playback plan is no longer available. id: 7",
      ),
    ).toBe(true);
    expect(isPreparedPlaybackPlanUnavailableError("Selected target window is no longer available.")).toBe(false);
  });
});
