import { describe, expect, it, vi } from "vitest";
import {
  arePlaybackShortcutCombinationsEqual,
  fallbackGlobalPlaybackShortcutToInApp,
  findDuplicatePlaybackShortcutAction,
  findMatchingInAppShortcutAction,
  formatPlaybackShortcut,
  getShortcutRecordingDecision,
  isModifierShortcutCode,
  isValidGlobalPlaybackShortcut,
  matchesPlaybackShortcutEvent,
  shouldUnregisterGlobalPlaybackShortcut,
  toGlobalShortcutAccelerator,
  tryRegisterGlobalPlaybackShortcut,
} from "./playbackShortcuts";
import {
  defaultPlaybackShortcuts,
  type PlaybackShortcutBinding,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";

const binding = (
  code: string,
  options: Partial<PlaybackShortcutBinding> = {},
): PlaybackShortcutBinding => ({
  alt: false,
  code,
  ctrl: false,
  shift: false,
  scope: "in-app",
  ...options,
});

describe("playback shortcut defaults", () => {
  it("uses the exact global Ctrl combinations and F9", () => {
    expect(defaultPlaybackShortcuts).toEqual({
      pauseResume: binding("Space", { ctrl: true, scope: "global" }),
      next: binding("ArrowRight", { ctrl: true, scope: "global" }),
      stop: binding("F9", { scope: "global" }),
    });
  });
});

describe("shortcut recording", () => {
  it.each([
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
  ])("ignores modifier-only primary code %s", (code) => {
    expect(isModifierShortcutCode(code)).toBe(true);
    expect(
      getShortcutRecordingDecision(
        { altKey: false, code, ctrlKey: true, shiftKey: false },
        "global",
      ),
    ).toEqual({ type: "ignore" });
  });

  it.each([
    ["Ctrl + Space", "Space", true, false, false],
    ["Ctrl + ArrowRight", "ArrowRight", true, false, false],
    ["Ctrl + Shift + A", "KeyA", true, false, true],
    ["F9", "F9", false, false, false],
  ])("captures %s", (_, code, ctrlKey, altKey, shiftKey) => {
    expect(
      getShortcutRecordingDecision(
        { altKey, code, ctrlKey, shiftKey },
        "global",
      ),
    ).toEqual({
      binding: binding(code, { alt: altKey, ctrl: ctrlKey, shift: shiftKey, scope: "global" }),
      type: "capture",
    });
  });

  it("cancels only bare Escape", () => {
    expect(
      getShortcutRecordingDecision(
        { altKey: false, code: "Escape", ctrlKey: false, shiftKey: false },
        "global",
      ),
    ).toEqual({ type: "cancel" });
    expect(
      getShortcutRecordingDecision(
        { altKey: false, code: "Escape", ctrlKey: true, shiftKey: false },
        "global",
      ).type,
    ).toBe("capture");
  });
});

describe("shortcut formatting", () => {
  it.each([
    [binding("Space", { ctrl: true }), "Ctrl + Space"],
    [binding("ArrowRight", { ctrl: true }), "Ctrl + →"],
    [binding("KeyA", { ctrl: true, shift: true }), "Ctrl + Shift + A"],
    [binding("F9"), "F9"],
    [binding("Digit1", { alt: true, ctrl: true, shift: true }), "Ctrl + Alt + Shift + 1"],
  ])("formats modifiers in canonical order", (value, expected) => {
    expect(formatPlaybackShortcut(value)).toBe(expected);
  });
});

describe("shortcut equality and duplicates", () => {
  it("compares the complete combination but ignores scope", () => {
    expect(
      arePlaybackShortcutCombinationsEqual(
        binding("ArrowRight", { ctrl: true, scope: "global" }),
        binding("ArrowRight", { ctrl: true, scope: "in-app" }),
      ),
    ).toBe(true);
    expect(
      arePlaybackShortcutCombinationsEqual(
        binding("ArrowRight", { ctrl: true }),
        binding("ArrowRight", { alt: true }),
      ),
    ).toBe(false);
    expect(
      arePlaybackShortcutCombinationsEqual(
        binding("ArrowRight", { ctrl: true }),
        binding("ArrowRight", { ctrl: true, shift: true }),
      ),
    ).toBe(false);
  });

  it("detects the same combination on another action", () => {
    const shortcuts: PlaybackShortcuts = {
      ...defaultPlaybackShortcuts,
      stop: binding("ArrowRight", { ctrl: true }),
    };
    expect(
      findDuplicatePlaybackShortcutAction(shortcuts, "next", shortcuts.next),
    ).toBe("stop");
  });
});

describe("in-app shortcut matching", () => {
  const event = (
    code: string,
    options: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
  ) => ({ altKey: false, code, ctrlKey: false, shiftKey: false, ...options });

  it("requires an exact modifier match", () => {
    const ctrlRight = binding("ArrowRight", { ctrl: true });
    expect(matchesPlaybackShortcutEvent(ctrlRight, event("ArrowRight", { ctrlKey: true }))).toBe(true);
    expect(matchesPlaybackShortcutEvent(ctrlRight, event("ArrowRight"))).toBe(false);
    expect(matchesPlaybackShortcutEvent(ctrlRight, event("ArrowRight", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesPlaybackShortcutEvent(binding("Space", { ctrl: true }), event("Space", { ctrlKey: true }))).toBe(true);
    expect(matchesPlaybackShortcutEvent(binding("Space", { ctrl: true }), event("Space"))).toBe(false);
    expect(matchesPlaybackShortcutEvent(binding("Space"), event("Space"))).toBe(true);
  });

  it("ignores editable targets and unrelated combinations", () => {
    const shortcuts: PlaybackShortcuts = {
      ...defaultPlaybackShortcuts,
      next: binding("ArrowRight", { ctrl: true }),
    };
    expect(findMatchingInAppShortcutAction(shortcuts, event("ArrowRight", { ctrlKey: true }), true)).toBeUndefined();
    expect(findMatchingInAppShortcutAction(shortcuts, event("ArrowLeft", { ctrlKey: true }), false)).toBeUndefined();
    expect(findMatchingInAppShortcutAction(shortcuts, event("ArrowRight", { ctrlKey: true }), false)).toBe("next");
  });
});

describe("global shortcut validation and accelerators", () => {
  it.each(Array.from({ length: 24 }, (_, index) => `F${index + 1}`))(
    "allows bare %s globally",
    (code) => expect(isValidGlobalPlaybackShortcut(binding(code))).toBe(true),
  );

  it.each([
    binding("Space", { ctrl: true }),
    binding("ArrowRight", { ctrl: true }),
    binding("KeyA", { ctrl: true, shift: true }),
    binding("Digit1", { alt: true }),
    binding("ArrowLeft", { shift: true }),
  ])("allows modified ordinary keys globally", (value) => {
    expect(isValidGlobalPlaybackShortcut(value)).toBe(true);
  });

  it.each([
    binding("ArrowRight"),
    binding("Space"),
    binding("KeyA"),
    binding("Digit1"),
    binding("Escape"),
    binding("ControlLeft", { ctrl: true }),
  ])("rejects invalid bare or modifier-only bindings", (value) => {
    expect(isValidGlobalPlaybackShortcut(value)).toBe(false);
    expect(toGlobalShortcutAccelerator(value)).toBeNull();
  });

  it.each([
    [binding("Space", { ctrl: true }), "CommandOrControl+Space"],
    [binding("ArrowRight", { ctrl: true }), "CommandOrControl+ArrowRight"],
    [binding("KeyA", { ctrl: true, shift: true }), "CommandOrControl+Shift+KeyA"],
    [binding("F9"), "F9"],
  ])("uses the installed Tauri plugin syntax", (value, expected) => {
    expect(toGlobalShortcutAccelerator(value)).toBe(expected);
  });

  it("unregisters when the key, modifiers, or scope changes", () => {
    expect(shouldUnregisterGlobalPlaybackShortcut(binding("F10", { scope: "global" }), "F9")).toBe(true);
    expect(shouldUnregisterGlobalPlaybackShortcut(binding("ArrowRight", { alt: true, scope: "global" }), "CommandOrControl+ArrowRight")).toBe(true);
    expect(shouldUnregisterGlobalPlaybackShortcut(binding("F9"), "F9")).toBe(true);
    expect(shouldUnregisterGlobalPlaybackShortcut(binding("F9", { scope: "global" }), "F9")).toBe(false);
  });

  it("attempts the canonical accelerator and reports registration failure", async () => {
    const register = vi.fn(async () => {
      throw new Error("occupied");
    });
    const value = binding("Space", { ctrl: true, scope: "global" });

    await expect(tryRegisterGlobalPlaybackShortcut(value, register)).resolves.toBeNull();
    expect(register).toHaveBeenCalledWith("CommandOrControl+Space");
    expect(fallbackGlobalPlaybackShortcutToInApp(value)).toEqual(
      binding("Space", { ctrl: true, scope: "in-app" }),
    );
  });
});
