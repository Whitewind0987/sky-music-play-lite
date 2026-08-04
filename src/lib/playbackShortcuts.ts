import type {
  PlaybackShortcutAction,
  PlaybackShortcutBinding,
  PlaybackShortcuts,
} from "../types/playbackShortcuts";

type ShortcutKeyboardState = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
};

export type ShortcutRecordingDecision =
  | { type: "cancel" }
  | { type: "ignore" }
  | { binding: PlaybackShortcutBinding; type: "capture" };

const modifierCodes = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

export function isModifierShortcutCode(code: string) {
  return modifierCodes.has(code);
}

export function getShortcutRecordingDecision(
  event: ShortcutKeyboardState,
  scope: PlaybackShortcutBinding["scope"],
): ShortcutRecordingDecision {
  if (event.metaKey) {
    return { type: "ignore" };
  }

  if (isModifierShortcutCode(event.code)) {
    return { type: "ignore" };
  }

  if (
    event.code === "Escape" &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return { type: "cancel" };
  }

  return {
    binding: {
      alt: event.altKey,
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      scope,
    },
    type: "capture",
  };
}

export function formatShortcutCode(code: string) {
  if (code === "") return "";
  if (code === "Space") return "Space";
  if (code === "ArrowRight") return "\u2192";
  if (code === "ArrowLeft") return "\u2190";
  if (code === "ArrowUp") return "\u2191";
  if (code === "ArrowDown") return "\u2193";
  if (code === "Escape") return "Esc";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

export function formatPlaybackShortcut(binding: PlaybackShortcutBinding) {
  return [
    binding.ctrl ? "Ctrl" : null,
    binding.alt ? "Alt" : null,
    binding.shift ? "Shift" : null,
    formatShortcutCode(binding.code),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" + ");
}

export function arePlaybackShortcutCombinationsEqual(
  left: PlaybackShortcutBinding,
  right: PlaybackShortcutBinding,
) {
  return (
    left.code === right.code &&
    left.ctrl === right.ctrl &&
    left.alt === right.alt &&
    left.shift === right.shift
  );
}

export function findDuplicatePlaybackShortcutAction(
  shortcuts: PlaybackShortcuts,
  currentAction: PlaybackShortcutAction,
  candidate: PlaybackShortcutBinding,
) {
  return (Object.keys(shortcuts) as PlaybackShortcutAction[]).find(
    (action) =>
      action !== currentAction &&
      arePlaybackShortcutCombinationsEqual(shortcuts[action], candidate),
  );
}

export function matchesPlaybackShortcutEvent(
  binding: PlaybackShortcutBinding,
  event: ShortcutKeyboardState,
) {
  return (
    !event.metaKey &&
    !isModifierShortcutCode(binding.code) &&
    binding.code === event.code &&
    binding.ctrl === event.ctrlKey &&
    binding.alt === event.altKey &&
    binding.shift === event.shiftKey
  );
}

export function fallbackGlobalPlaybackShortcutToInApp(
  binding: PlaybackShortcutBinding,
): PlaybackShortcutBinding {
  return { ...binding, scope: "in-app" };
}

export function findMatchingInAppShortcutAction(
  shortcuts: PlaybackShortcuts,
  event: ShortcutKeyboardState,
  isEditableTarget: boolean,
) {
  if (isEditableTarget) return undefined;

  return (Object.keys(shortcuts) as PlaybackShortcutAction[]).find(
    (action) =>
      shortcuts[action].scope === "in-app" &&
      matchesPlaybackShortcutEvent(shortcuts[action], event),
  );
}

export function isValidGlobalPlaybackShortcut(
  binding: PlaybackShortcutBinding,
) {
  if (binding.code.trim() === "" || isModifierShortcutCode(binding.code)) {
    return false;
  }

  return (
    binding.ctrl ||
    binding.alt ||
    binding.shift ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(binding.code)
  );
}

export function isUnsafeGlobalPlaybackShortcut(
  binding: PlaybackShortcutBinding,
) {
  return !isValidGlobalPlaybackShortcut(binding);
}

export function toGlobalShortcutAccelerator(
  binding: PlaybackShortcutBinding,
) {
  if (!isValidGlobalPlaybackShortcut(binding)) return null;

  return [
    binding.ctrl ? "CommandOrControl" : null,
    binding.alt ? "Alt" : null,
    binding.shift ? "Shift" : null,
    binding.code,
  ]
    .filter((part): part is string => Boolean(part))
    .join("+");
}

export function normalizeGlobalPlaybackShortcutScope(
  binding: PlaybackShortcutBinding,
): PlaybackShortcutBinding {
  return binding.scope === "global" && isUnsafeGlobalPlaybackShortcut(binding)
    ? { ...binding, scope: "in-app" }
    : binding;
}

export function shouldUnregisterGlobalPlaybackShortcut(
  binding: PlaybackShortcutBinding,
  registeredAccelerator: string,
) {
  return (
    binding.scope !== "global" ||
    toGlobalShortcutAccelerator(binding) !== registeredAccelerator
  );
}

export async function tryRegisterGlobalPlaybackShortcut(
  binding: PlaybackShortcutBinding,
  registerShortcut: (accelerator: string) => Promise<void>,
) {
  const accelerator = toGlobalShortcutAccelerator(binding);
  if (accelerator === null) return null;

  try {
    await registerShortcut(accelerator);
    return accelerator;
  } catch {
    return null;
  }
}
