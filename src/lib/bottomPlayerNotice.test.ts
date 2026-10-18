import { describe, expect, it } from "vitest";
import { getBottomPlayerNotice } from "./bottomPlayerNotice";

describe("bottom player exceptional notices", () => {
  it("leaves ordinary transport state to the primary button", () => {
    expect(getBottomPlayerNotice({
      isCurrentSongLoading: false,
      manualState: "idle",
    })).toBeNull();
  });

  it("prioritizes a score load over a previous non-error manual state", () => {
    expect(getBottomPlayerNotice({
      isCurrentSongLoading: true,
      manualState: "finished",
    })).toBe("loading");
  });

  it("keeps a manual error visible even during a score load", () => {
    expect(getBottomPlayerNotice({
      isCurrentSongLoading: true,
      manualState: "error",
    })).toBe("error");
  });

  it.each(["starting", "active", "tail", "finished", "error"] as const)(
    "preserves the explicit manual %s notice",
    (manualState) => {
      expect(getBottomPlayerNotice({
        isCurrentSongLoading: false,
        manualState,
      })).toBe(manualState);
    },
  );
});
