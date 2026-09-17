import {
  playbackShortcutActions,
  type PlaybackShortcutAction,
  type PlaybackShortcutBinding,
  type PlaybackShortcutNotices,
  type PlaybackShortcuts,
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

export type PlaybackShortcutRecordingOutcome =
  | { type: "cancel" }
  | { duplicateAction: PlaybackShortcutAction; type: "duplicate" }
  | { type: "ignore" }
  | {
      binding: PlaybackShortcutBinding;
      fellBackToInApp: boolean;
      type: "apply";
    }
  | { type: "unchanged" };

export type PlaybackShortcutRecordingRequestDecision =
  | "cancel-current"
  | "replace-current"
  | "start";

export type GlobalPlaybackShortcutCallbackDecision =
  | "begin-manual-hold"
  | "complete-unchanged"
  | "end-manual-hold"
  | "execute-playback"
  | "suppress";

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

export function resolvePlaybackShortcutRecordingOutcome(
  shortcuts: PlaybackShortcuts,
  currentAction: PlaybackShortcutAction,
  decision: ShortcutRecordingDecision,
): PlaybackShortcutRecordingOutcome {
  if (decision.type !== "capture") {
    return decision;
  }

  const nextBinding = normalizeGlobalPlaybackShortcutScope(decision.binding);
  if (
    arePlaybackShortcutCombinationsEqual(
      shortcuts[currentAction],
      nextBinding,
    )
  ) {
    return { type: "unchanged" };
  }

  const duplicateAction = findDuplicatePlaybackShortcutAction(
    shortcuts,
    currentAction,
    nextBinding,
  );
  if (duplicateAction !== undefined) {
    return { duplicateAction, type: "duplicate" };
  }

  return {
    binding: nextBinding,
    fellBackToInApp:
      decision.binding.scope === "global" && nextBinding.scope === "in-app",
    type: "apply",
  };
}

export function applyPlaybackShortcutRecordingOutcome(
  shortcuts: PlaybackShortcuts,
  currentAction: PlaybackShortcutAction,
  outcome: PlaybackShortcutRecordingOutcome,
) {
  return outcome.type === "apply"
    ? { ...shortcuts, [currentAction]: outcome.binding }
    : shortcuts;
}

export function shouldEndPlaybackShortcutRecording(
  outcome: PlaybackShortcutRecordingOutcome,
) {
  return outcome.type !== "ignore";
}

export function getPlaybackShortcutRecordingRequestDecision(
  currentAction: PlaybackShortcutAction | null,
  requestedAction: PlaybackShortcutAction,
): PlaybackShortcutRecordingRequestDecision {
  if (currentAction === requestedAction) return "cancel-current";
  return currentAction === null ? "start" : "replace-current";
}

export function getPlaybackShortcutRecordingSessionAction(
  activeAction: PlaybackShortcutAction | null,
  pendingAction: PlaybackShortcutAction | null,
) {
  return activeAction ?? pendingAction;
}

export function canActivatePendingPlaybackShortcutRecording(
  pendingAction: PlaybackShortcutAction | null,
  pendingRequestId: number,
  completedAction: PlaybackShortcutAction,
  completedRequestId: number,
) {
  return (
    pendingAction === completedAction && pendingRequestId === completedRequestId
  );
}

export function canCompletePlaybackShortcutRecording(
  sessionAction: PlaybackShortcutAction | null,
  currentRequestId: number,
  completedAction: PlaybackShortcutAction,
  completedRequestId: number,
) {
  return (
    sessionAction === completedAction &&
    currentRequestId === completedRequestId
  );
}

export function getGlobalPlaybackShortcutCallbackDecision(
  callbackAction: PlaybackShortcutAction,
  eventState: "Pressed" | "Released",
  recordingAction: PlaybackShortcutAction | null,
  pendingRecordingAction: PlaybackShortcutAction | null,
  restoringRecordingAction: PlaybackShortcutAction | null,
): GlobalPlaybackShortcutCallbackDecision {
  const sessionAction = getPlaybackShortcutRecordingSessionAction(
    recordingAction,
    pendingRecordingAction,
  );
  if (sessionAction === null) {
    if (restoringRecordingAction !== null) return "suppress";
    if (callbackAction === "manualStep") {
      return eventState === "Pressed"
        ? "begin-manual-hold"
        : "end-manual-hold";
    }
    return eventState === "Pressed" ? "execute-playback" : "suppress";
  }
  if (eventState !== "Pressed") return "suppress";
  return sessionAction === callbackAction
    ? "complete-unchanged"
    : "suppress";
}

export function getPlaybackShortcutNotice(
  action: PlaybackShortcutAction,
  localNotices: PlaybackShortcutNotices,
  controllerNotices: PlaybackShortcutNotices,
) {
  return localNotices[action] ?? controllerNotices[action];
}

export function clearPlaybackShortcutNotice(
  notices: PlaybackShortcutNotices,
  action: PlaybackShortcutAction,
): PlaybackShortcutNotices {
  const { [action]: _notice, ...remainingNotices } = notices;
  return remainingNotices;
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
  left: PlaybackShortcutBinding | null,
  right: PlaybackShortcutBinding | null,
) {
  if (left === null || right === null) return false;

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
    (action) => {
      const binding = shortcuts[action];
      return (
        action !== currentAction &&
        binding !== null &&
        arePlaybackShortcutCombinationsEqual(binding, candidate)
      );
    },
  );
}

export function getInAppManualShortcutEventDecision({
  activeCode,
  code,
  eventType,
  isManualBindingMatch,
  repeat,
}: {
  activeCode: string | null;
  code: string;
  eventType: "keydown" | "keyup";
  isManualBindingMatch: boolean;
  repeat: boolean;
}): "begin" | "end" | "ignore" | "suppress" {
  if (eventType === "keyup") {
    return activeCode === code ? "end" : "ignore";
  }
  if (!isManualBindingMatch) return "ignore";
  return repeat || activeCode !== null ? "suppress" : "begin";
}

export function matchesPlaybackShortcutEvent(
  binding: PlaybackShortcutBinding | null,
  event: ShortcutKeyboardState,
) {
  return (
    binding !== null &&
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

  return playbackShortcutActions.find((action) => {
    const binding = shortcuts[action];
    return (
      binding !== null &&
      binding.scope === "in-app" &&
      matchesPlaybackShortcutEvent(binding, event)
    );
  });
}

export function getDesiredGlobalPlaybackShortcutActions(
  shortcuts: PlaybackShortcuts,
  recordingAction: PlaybackShortcutAction | null,
  registeredActions: ReadonlySet<PlaybackShortcutAction>,
) {
  if (recordingAction !== null) {
    const binding = shortcuts[recordingAction];
    return binding !== null &&
      binding.scope === "global" &&
      isValidGlobalPlaybackShortcut(binding) &&
      registeredActions.has(recordingAction)
      ? [recordingAction]
      : [];
  }
  return playbackShortcutActions.filter((action) => {
    const binding = shortcuts[action];
    return binding !== null && binding.scope === "global";
  });
}

export function getPlaybackShortcutRecordingScope(
  shortcuts: PlaybackShortcuts,
  action: PlaybackShortcutAction,
) {
  return shortcuts[action]?.scope ?? "global";
}

export function clearManualPlaybackShortcut(
  shortcuts: PlaybackShortcuts,
): PlaybackShortcuts {
  return shortcuts.manualStep === null
    ? shortcuts
    : { ...shortcuts, manualStep: null };
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
  binding: PlaybackShortcutBinding | null,
  registeredAccelerator: string,
) {
  return (
    binding === null ||
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
