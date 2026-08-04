import { describe, expect, it, vi } from "vitest";
import {
  applyPlaybackShortcutRecordingOutcome,
  arePlaybackShortcutCombinationsEqual,
  canActivatePendingPlaybackShortcutRecording,
  canCompletePlaybackShortcutRecording,
  clearPlaybackShortcutNotice,
  fallbackGlobalPlaybackShortcutToInApp,
  findDuplicatePlaybackShortcutAction,
  findMatchingInAppShortcutAction,
  formatPlaybackShortcut,
  getDesiredGlobalPlaybackShortcutActions,
  getGlobalPlaybackShortcutCallbackDecision,
  getPlaybackShortcutNotice,
  getPlaybackShortcutRecordingRequestDecision,
  getPlaybackShortcutRecordingSessionAction,
  getShortcutRecordingDecision,
  isModifierShortcutCode,
  isValidGlobalPlaybackShortcut,
  matchesPlaybackShortcutEvent,
  resolvePlaybackShortcutRecordingOutcome,
  shouldUnregisterGlobalPlaybackShortcut,
  shouldEndPlaybackShortcutRecording,
  toGlobalShortcutAccelerator,
  tryRegisterGlobalPlaybackShortcut,
} from "./playbackShortcuts";
import { uiText } from "../i18n/uiText";
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
    "MetaLeft",
    "MetaRight",
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
    ["Windows key alone", "MetaLeft", false],
    ["Win + K", "KeyK", false],
    ["Win + Ctrl + K", "KeyK", true],
    ["Win + Escape", "Escape", false],
  ])("ignores %s while continuing to record", (_, code, ctrlKey) => {
    expect(
      getShortcutRecordingDecision(
        {
          altKey: false,
          code,
          ctrlKey,
          metaKey: true,
          shiftKey: false,
        },
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

describe("shortcut recording outcomes", () => {
  it("completes successfully without changes for the current combination", () => {
    const shortcuts = { ...defaultPlaybackShortcuts };
    const outcome = resolvePlaybackShortcutRecordingOutcome(
      shortcuts,
      "pauseResume",
      {
        binding: binding("Space", { ctrl: true, scope: "global" }),
        type: "capture",
      },
    );

    expect(outcome).toEqual({ type: "unchanged" });
    expect(
      applyPlaybackShortcutRecordingOutcome(
        shortcuts,
        "pauseResume",
        outcome,
      ),
    ).toBe(shortcuts);
    expect(shouldEndPlaybackShortcutRecording(outcome)).toBe(true);
  });

  it("treats scope as irrelevant but requires every modifier to match", () => {
    const shortcuts: PlaybackShortcuts = {
      ...defaultPlaybackShortcuts,
      pauseResume: binding("KeyA", { ctrl: true, scope: "in-app" }),
    };

    expect(
      resolvePlaybackShortcutRecordingOutcome(shortcuts, "pauseResume", {
        binding: binding("KeyA", { ctrl: true, scope: "global" }),
        type: "capture",
      }),
    ).toEqual({ type: "unchanged" });
    expect(
      resolvePlaybackShortcutRecordingOutcome(shortcuts, "pauseResume", {
        binding: binding("KeyA", { ctrl: true, shift: true }),
        type: "capture",
      }).type,
    ).toBe("apply");
    expect(
      resolvePlaybackShortcutRecordingOutcome(shortcuts, "pauseResume", {
        binding: binding("KeyA", { alt: true }),
        type: "capture",
      }).type,
    ).toBe("apply");
  });

  it("rejects a duplicate without modifying either binding and ends recording", () => {
    const shortcuts = { ...defaultPlaybackShortcuts };
    const outcome = resolvePlaybackShortcutRecordingOutcome(
      shortcuts,
      "next",
      {
        binding: binding("Space", { ctrl: true, scope: "global" }),
        type: "capture",
      },
    );

    expect(outcome).toEqual({
      duplicateAction: "pauseResume",
      type: "duplicate",
    });
    expect(
      applyPlaybackShortcutRecordingOutcome(shortcuts, "next", outcome),
    ).toBe(shortcuts);
    expect(shouldEndPlaybackShortcutRecording(outcome)).toBe(true);
  });

  it("applies a valid new combination", () => {
    const shortcuts = { ...defaultPlaybackShortcuts };
    const outcome = resolvePlaybackShortcutRecordingOutcome(
      shortcuts,
      "next",
      {
        binding: binding("KeyN", { ctrl: true, scope: "global" }),
        type: "capture",
      },
    );

    expect(outcome).toEqual({
      binding: binding("KeyN", { ctrl: true, scope: "global" }),
      fellBackToInApp: false,
      type: "apply",
    });
    expect(
      applyPlaybackShortcutRecordingOutcome(shortcuts, "next", outcome).next,
    ).toEqual(binding("KeyN", { ctrl: true, scope: "global" }));
  });

  it("keeps unsafe global fallback behavior", () => {
    const outcome = resolvePlaybackShortcutRecordingOutcome(
      defaultPlaybackShortcuts,
      "next",
      {
        binding: binding("KeyN", { scope: "global" }),
        type: "capture",
      },
    );

    expect(outcome).toEqual({
      binding: binding("KeyN"),
      fellBackToInApp: true,
      type: "apply",
    });
  });

  it("keeps ignored events active and ends on bare Escape", () => {
    const ignoredModifier = resolvePlaybackShortcutRecordingOutcome(
      defaultPlaybackShortcuts,
      "next",
      getShortcutRecordingDecision(
        {
          altKey: false,
          code: "ControlLeft",
          ctrlKey: true,
          shiftKey: false,
        },
        "global",
      ),
    );
    const ignoredMeta = resolvePlaybackShortcutRecordingOutcome(
      defaultPlaybackShortcuts,
      "next",
      getShortcutRecordingDecision(
        {
          altKey: false,
          code: "KeyK",
          ctrlKey: false,
          metaKey: true,
          shiftKey: false,
        },
        "global",
      ),
    );
    const cancelled = resolvePlaybackShortcutRecordingOutcome(
      defaultPlaybackShortcuts,
      "next",
      getShortcutRecordingDecision(
        {
          altKey: false,
          code: "Escape",
          ctrlKey: false,
          shiftKey: false,
        },
        "global",
      ),
    );

    expect(shouldEndPlaybackShortcutRecording(ignoredModifier)).toBe(false);
    expect(shouldEndPlaybackShortcutRecording(ignoredMeta)).toBe(false);
    expect(cancelled).toEqual({ type: "cancel" });
    expect(shouldEndPlaybackShortcutRecording(cancelled)).toBe(true);
  });
});

describe("shortcut recording registration suspension", () => {
  it("keeps only the current valid global action as a recording sentinel", () => {
    expect(
      getDesiredGlobalPlaybackShortcutActions(
        defaultPlaybackShortcuts,
        "pauseResume",
        new Set(["pauseResume"]),
      ),
    ).toEqual(["pauseResume"]);
    expect(
      getDesiredGlobalPlaybackShortcutActions(
        {
          ...defaultPlaybackShortcuts,
          pauseResume: binding("KeyA"),
        },
        "pauseResume",
        new Set(["pauseResume"]),
      ),
    ).toEqual([]);
    expect(
      getDesiredGlobalPlaybackShortcutActions(
        defaultPlaybackShortcuts,
        "pauseResume",
        new Set(),
      ),
    ).toEqual([]);
  });

  it("restores the currently configured global actions after recording", () => {
    const shortcuts: PlaybackShortcuts = {
      ...defaultPlaybackShortcuts,
      next: binding("KeyN"),
    };

    expect(
      getDesiredGlobalPlaybackShortcutActions(shortcuts, null, new Set()),
    ).toEqual(["pauseResume", "stop"]);
  });

  it("keeps one active action when recording requests change", () => {
    expect(
      getPlaybackShortcutRecordingRequestDecision(null, "pauseResume"),
    ).toBe("start");
    expect(
      getPlaybackShortcutRecordingRequestDecision("pauseResume", "next"),
    ).toBe("replace-current");
    expect(
      getPlaybackShortcutRecordingRequestDecision("next", "next"),
    ).toBe("cancel-current");
  });

  it("represents pending and active ownership with one effective action", () => {
    expect(
      getPlaybackShortcutRecordingSessionAction(null, "pauseResume"),
    ).toBe("pauseResume");
    expect(
      getPlaybackShortcutRecordingSessionAction("next", null),
    ).toBe("next");
    expect(getPlaybackShortcutRecordingSessionAction(null, null)).toBeNull();
  });

  it("allows only the current pending request to activate", () => {
    expect(
      canActivatePendingPlaybackShortcutRecording(
        "pauseResume",
        4,
        "pauseResume",
        4,
      ),
    ).toBe(true);
    expect(
      canActivatePendingPlaybackShortcutRecording(
        null,
        5,
        "pauseResume",
        4,
      ),
    ).toBe(false);
    expect(
      canActivatePendingPlaybackShortcutRecording(
        "pauseResume",
        5,
        "pauseResume",
        4,
      ),
    ).toBe(false);
    expect(
      canActivatePendingPlaybackShortcutRecording("next", 5, "stop", 5),
    ).toBe(false);
  });

  it("allows only the matching live session to complete", () => {
    expect(
      canCompletePlaybackShortcutRecording(
        "pauseResume",
        7,
        "pauseResume",
        7,
      ),
    ).toBe(true);
    expect(
      canCompletePlaybackShortcutRecording("pauseResume", 8, "pauseResume", 7),
    ).toBe(false);
    expect(
      canCompletePlaybackShortcutRecording("next", 7, "pauseResume", 7),
    ).toBe(false);
    expect(
      canCompletePlaybackShortcutRecording(null, 7, "pauseResume", 7),
    ).toBe(false);
  });
});

describe("global shortcut recording sentinel callbacks", () => {
  it("completes unchanged only for the current action on Pressed", () => {
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "pauseResume",
        "Pressed",
        "pauseResume",
        null,
        "pauseResume",
      ),
    ).toBe("complete-unchanged");
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "pauseResume",
        "Released",
        "pauseResume",
        null,
        "pauseResume",
      ),
    ).toBe("suppress");
  });

  it("suppresses other actions during pending or active recording", () => {
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "next",
        "Pressed",
        null,
        "pauseResume",
        "pauseResume",
      ),
    ).toBe("suppress");
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "stop",
        "Pressed",
        "pauseResume",
        null,
        "pauseResume",
      ),
    ).toBe("suppress");
  });

  it("executes playback only for Pressed outside recording", () => {
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "next",
        "Pressed",
        null,
        null,
        null,
      ),
    ).toBe("execute-playback");
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "next",
        "Released",
        null,
        null,
        null,
      ),
    ).toBe("suppress");
  });

  it("suppresses a late callback until serialized restoration finishes", () => {
    expect(
      getGlobalPlaybackShortcutCallbackDecision(
        "pauseResume",
        "Pressed",
        null,
        null,
        "pauseResume",
      ),
    ).toBe("suppress");
  });

  it("lets the first DOM or global completion win without a timer", () => {
    const sessionRequestId = 11;
    const playback = vi.fn();
    const unchangedNotice = vi.fn();

    if (
      canCompletePlaybackShortcutRecording(
        "pauseResume",
        sessionRequestId,
        "pauseResume",
        sessionRequestId,
      )
    ) {
      unchangedNotice();
    }
    const lateGlobalDecision = getGlobalPlaybackShortcutCallbackDecision(
      "pauseResume",
      "Pressed",
      null,
      null,
      "pauseResume",
    );
    if (lateGlobalDecision === "execute-playback") playback();
    if (
      canCompletePlaybackShortcutRecording(
        null,
        sessionRequestId + 1,
        "pauseResume",
        sessionRequestId,
      )
    ) {
      unchangedNotice();
    }

    expect(lateGlobalDecision).toBe("suppress");
    expect(unchangedNotice).toHaveBeenCalledTimes(1);
    expect(playback).not.toHaveBeenCalled();
  });

  it("ignores a DOM twin after the global callback completes", () => {
    const sessionRequestId = 14;
    const unchangedNotice = vi.fn();

    if (
      canCompletePlaybackShortcutRecording(
        "stop",
        sessionRequestId,
        "stop",
        sessionRequestId,
      )
    ) {
      unchangedNotice();
    }
    if (
      canCompletePlaybackShortcutRecording(
        null,
        sessionRequestId + 1,
        "stop",
        sessionRequestId,
      )
    ) {
      unchangedNotice();
    }

    expect(unchangedNotice).toHaveBeenCalledTimes(1);
  });
});

describe("shortcut notices", () => {
  it("provides the exact localized unchanged messages", () => {
    expect(uiText["zh-CN"].settings.keyboardShortcutUnchanged).toBe(
      "该快捷键与当前设置相同，未做更改。",
    );
    expect(uiText["en-US"].settings.keyboardShortcutUnchanged).toBe(
      "This shortcut matches the current setting. No changes were made.",
    );
  });

  it("keeps an unchanged notice on only the completed action", () => {
    const unchanged = uiText["en-US"].settings.keyboardShortcutUnchanged;
    const notices = { pauseResume: unchanged };

    expect(getPlaybackShortcutNotice("pauseResume", {}, notices)).toBe(
      unchanged,
    );
    expect(getPlaybackShortcutNotice("next", {}, notices)).toBeUndefined();
  });
  it("prefers the complete local message over a controller message", () => {
    expect(
      getPlaybackShortcutNotice(
        "next",
        { next: "That shortcut is already used." },
        { next: "Global registration failed." },
      ),
    ).toBe("That shortcut is already used.");
  });

  it("uses the complete controller message and returns no value without one", () => {
    expect(
      getPlaybackShortcutNotice(
        "pauseResume",
        {},
        { pauseResume: "Global registration failed." },
      ),
    ).toBe("Global registration failed.");
    expect(getPlaybackShortcutNotice("stop", {}, {})).toBeUndefined();
  });

  it("keeps notices action-specific", () => {
    const notices = {
      next: "Duplicate shortcut.",
      stop: "Registration failed.",
    };

    expect(getPlaybackShortcutNotice("next", notices, {})).toBe(
      "Duplicate shortcut.",
    );
    expect(getPlaybackShortcutNotice("stop", notices, {})).toBe(
      "Registration failed.",
    );
  });

  it("clears only the completed action and preserves other notices", () => {
    const notices = {
      next: "Duplicate shortcut.",
      stop: "Registration failed.",
    };

    expect(clearPlaybackShortcutNotice(notices, "next")).toEqual({
      stop: "Registration failed.",
    });
    expect(notices).toEqual({
      next: "Duplicate shortcut.",
      stop: "Registration failed.",
    });
  });

  it("does not erase a duplicate merely because recording ends", () => {
    const localNotices = { next: "Duplicate shortcut." };

    expect(getPlaybackShortcutNotice("next", localNotices, {})).toBe(
      "Duplicate shortcut.",
    );
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

  it("rejects Meta-modified events without triggering an action", () => {
    const shortcuts: PlaybackShortcuts = {
      ...defaultPlaybackShortcuts,
      next: binding("KeyK"),
      pauseResume: binding("Space", { ctrl: true }),
    };

    expect(matchesPlaybackShortcutEvent(shortcuts.next, event("KeyK"))).toBe(true);
    expect(
      matchesPlaybackShortcutEvent(
        shortcuts.next,
        event("KeyK", { metaKey: true }),
      ),
    ).toBe(false);
    expect(
      matchesPlaybackShortcutEvent(
        shortcuts.pauseResume,
        event("Space", { ctrlKey: true }),
      ),
    ).toBe(true);
    expect(
      matchesPlaybackShortcutEvent(
        shortcuts.pauseResume,
        event("Space", { ctrlKey: true, metaKey: true }),
      ),
    ).toBe(false);
    expect(
      findMatchingInAppShortcutAction(
        shortcuts,
        event("KeyK", { metaKey: true }),
        false,
      ),
    ).toBeUndefined();
    expect(
      findMatchingInAppShortcutAction(
        shortcuts,
        event("Space", { ctrlKey: true, metaKey: true }),
        false,
      ),
    ).toBeUndefined();
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
    binding("MetaLeft"),
    binding("MetaRight"),
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
