import { describe, expect, it } from "vitest";
import {
  isUnsafeGlobalPlaybackShortcut,
  normalizeGlobalPlaybackShortcutScope,
  shouldUnregisterGlobalPlaybackShortcut,
  toGlobalShortcutAccelerators,
} from "./playbackShortcuts";

describe("global playback shortcut safety", () => {
  it.each(["ArrowRight", "Space", "KeyA", "Digit1", "Escape"])(
    "does not allow %s globally",
    (code) => {
      expect(isUnsafeGlobalPlaybackShortcut(code)).toBe(true);
      expect(toGlobalShortcutAccelerators(code)).toEqual([]);
    },
  );

  it("keeps unsafe keys available in app scope", () => {
    expect(
      normalizeGlobalPlaybackShortcutScope({ code: "ArrowRight", scope: "in-app" }),
    ).toEqual({ code: "ArrowRight", scope: "in-app" });
  });

  it("changes only the scope of unsafe global bindings", () => {
    expect(
      normalizeGlobalPlaybackShortcutScope({ code: "Space", scope: "global" }),
    ).toEqual({ code: "Space", scope: "in-app" });
  });

  it.each(Array.from({ length: 24 }, (_, index) => `F${index + 1}`))(
    "allows %s globally",
    (code) => {
      expect(isUnsafeGlobalPlaybackShortcut(code)).toBe(false);
      expect(toGlobalShortcutAccelerators(code)).toEqual([code]);
    },
  );

  it("keeps the default F9 Stop binding valid", () => {
    expect(
      normalizeGlobalPlaybackShortcutScope({ code: "F9", scope: "global" }),
    ).toEqual({ code: "F9", scope: "global" });
  });

  it("unregisters obsolete accelerators when a binding changes", () => {
    expect(
      shouldUnregisterGlobalPlaybackShortcut(
        { code: "F10", scope: "global" },
        "F9",
      ),
    ).toBe(true);
    expect(
      shouldUnregisterGlobalPlaybackShortcut(
        { code: "F9", scope: "in-app" },
        "F9",
      ),
    ).toBe(true);
    expect(
      shouldUnregisterGlobalPlaybackShortcut(
        { code: "F9", scope: "global" },
        "F9",
      ),
    ).toBe(false);
  });
});
