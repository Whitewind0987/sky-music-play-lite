import {
  register,
  unregister,
  type ShortcutEvent,
} from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  canActivatePendingPlaybackShortcutRecording,
  canCompletePlaybackShortcutRecording,
  clearPlaybackShortcutNotice,
  fallbackGlobalPlaybackShortcutToInApp,
  findMatchingInAppShortcutAction,
  formatPlaybackShortcut,
  getDesiredGlobalPlaybackShortcutActions,
  getGlobalPlaybackShortcutCallbackDecision,
  getPlaybackShortcutRecordingRequestDecision,
  getPlaybackShortcutRecordingSessionAction,
  isUnsafeGlobalPlaybackShortcut,
  normalizeGlobalPlaybackShortcutScope,
  shouldUnregisterGlobalPlaybackShortcut,
  tryRegisterGlobalPlaybackShortcut,
} from "../lib/playbackShortcuts";
import {
  defaultPlaybackShortcuts,
  playbackShortcutActions,
  type PlaybackShortcutAction,
  type PlaybackShortcutBinding,
  type PlaybackShortcutNotices,
  type PlaybackShortcutScope,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";

type PlaybackHotkeyControls = Record<PlaybackShortcutAction, () => void>;
type RegisteredPlaybackShortcut = {
  accelerator: string;
  binding: PlaybackShortcutBinding;
};
type PlaybackShortcutRecordingSentinel = {
  action: PlaybackShortcutAction;
  completionPhase: "awaiting-pressed" | "awaiting-released" | "recording";
  requestId: number;
};
type UsePlaybackShortcutsOptions = {
  appendLog: (entry: string) => void;
  showNotice: (message: string) => void;
  text: UiText;
};

class PlaybackShortcutSuspensionError extends Error {
  constructor(readonly action: PlaybackShortcutAction) {
    super(`Failed to suspend ${action}`);
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

function normalizePlaybackShortcuts(bindings: PlaybackShortcuts) {
  return playbackShortcutActions.reduce<PlaybackShortcuts>(
    (normalized, action) => ({
      ...normalized,
      [action]: normalizeGlobalPlaybackShortcutScope(bindings[action]),
    }),
    { ...defaultPlaybackShortcuts },
  );
}

export function usePlaybackShortcuts({
  appendLog,
  showNotice,
  text,
}: UsePlaybackShortcutsOptions) {
  const controlsRef = useRef<PlaybackHotkeyControls>({
    next: () => {},
    pauseResume: () => {},
    stop: () => {},
  });
  const operationRef = useRef<Promise<void>>(Promise.resolve());
  const registeredRef = useRef(
    new Map<PlaybackShortcutAction, RegisteredPlaybackShortcut>(),
  );
  const latestBindingsRef = useRef<PlaybackShortcuts>(
    defaultPlaybackShortcuts,
  );
  const recordingActionRef = useRef<PlaybackShortcutAction | null>(null);
  const pendingRecordingActionRef =
    useRef<PlaybackShortcutAction | null>(null);
  const recordingRequestIdRef = useRef(0);
  const recordingSentinelRef =
    useRef<PlaybackShortcutRecordingSentinel | null>(null);
  const completeShortcutRecordingAsUnchangedRef = useRef<
    (
      action: PlaybackShortcutAction,
      requestId: number,
      source: "dom" | "global",
    ) => boolean
  >(() => false);
  const appendLogRef = useRef(appendLog);
  const showNoticeRef = useRef(showNotice);
  const [recordingAction, setRecordingAction] =
    useState<PlaybackShortcutAction | null>(null);
  const [pendingRecordingAction, setPendingRecordingAction] =
    useState<PlaybackShortcutAction | null>(null);
  const [shortcutNotice, setShortcutNotice] =
    useState<PlaybackShortcutNotices>({});
  const [playbackShortcuts, setPlaybackShortcutsState] =
    useState<PlaybackShortcuts>(defaultPlaybackShortcuts);

  latestBindingsRef.current = playbackShortcuts;

  useEffect(() => {
    appendLogRef.current = appendLog;
    showNoticeRef.current = showNotice;
  }, [appendLog, showNotice]);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const next = operationRef.current.catch(() => undefined).then(operation);
    operationRef.current = next;
    return next;
  }, []);

  const commitPlaybackShortcuts = useCallback((bindings: PlaybackShortcuts) => {
    latestBindingsRef.current = bindings;
    setPlaybackShortcutsState(bindings);
  }, []);

  const setPlaybackHotkeyControls = useCallback(
    (controls: PlaybackHotkeyControls) => {
      controlsRef.current = controls;
    },
    [],
  );
  const clearShortcutNotice = useCallback(
    (action?: PlaybackShortcutAction) =>
      setShortcutNotice((current) =>
        action === undefined
          ? {}
          : clearPlaybackShortcutNotice(current, action),
      ),
    [],
  );
  const setPlaybackShortcuts = useCallback(
    (bindings: PlaybackShortcuts) =>
      commitPlaybackShortcuts(normalizePlaybackShortcuts(bindings)),
    [commitPlaybackShortcuts],
  );
  const setPlaybackShortcutCode = useCallback(
    (action: PlaybackShortcutAction, code: string) => {
      commitPlaybackShortcuts({
        ...latestBindingsRef.current,
        [action]: { ...latestBindingsRef.current[action], code },
      });
    },
    [commitPlaybackShortcuts],
  );
  const setPlaybackShortcutScope = useCallback(
    (action: PlaybackShortcutAction, scope: PlaybackShortcutScope) => {
      commitPlaybackShortcuts({
        ...latestBindingsRef.current,
        [action]: { ...latestBindingsRef.current[action], scope },
      });
    },
    [commitPlaybackShortcuts],
  );
  const resetPlaybackShortcuts = useCallback(
    () => commitPlaybackShortcuts(defaultPlaybackShortcuts),
    [commitPlaybackShortcuts],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        recordingActionRef.current !== null ||
        pendingRecordingActionRef.current !== null
      ) {
        return;
      }
      const action = findMatchingInAppShortcutAction(
        latestBindingsRef.current,
        event,
        isEditableTarget(event.target),
      );
      if (action) {
        event.preventDefault();
        controlsRef.current[action]();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const failGlobalBinding = useCallback(
    (
      action: PlaybackShortcutAction,
      binding: PlaybackShortcutBinding,
      message: string,
    ) => {
      if (latestBindingsRef.current[action].scope !== "global") return;
      setShortcutNotice((current) => ({ ...current, [action]: message }));
      commitPlaybackShortcuts({
        ...latestBindingsRef.current,
        [action]: fallbackGlobalPlaybackShortcutToInApp(
          latestBindingsRef.current[action],
        ),
      });
      showNoticeRef.current(message);
      appendLogRef.current(
        formatText(text.logs.globalHotkeyRegisterFailed, {
          shortcut: formatPlaybackShortcut(binding),
        }),
      );
    },
    [commitPlaybackShortcuts, text.logs.globalHotkeyRegisterFailed],
  );

  const synchronizeGlobalShortcuts = useCallback(
    async (recordingSessionAction: PlaybackShortcutAction | null) => {
      const isRecording = recordingSessionAction !== null;
      const desiredActions = new Set(
        getDesiredGlobalPlaybackShortcutActions(
          latestBindingsRef.current,
          recordingSessionAction,
          new Set(registeredRef.current.keys()),
        ),
      );

      for (const action of playbackShortcutActions) {
        const binding = latestBindingsRef.current[action];
        const registered = registeredRef.current.get(action);
        if (
          registered &&
          (!desiredActions.has(action) ||
            shouldUnregisterGlobalPlaybackShortcut(
              binding,
              registered.accelerator,
            ))
        ) {
          try {
            await unregister(registered.accelerator);
            registeredRef.current.delete(action);
          } catch {
            if (isRecording) {
              throw new PlaybackShortcutSuspensionError(action);
            }

            const message = text.settings.keyboardShortcutGlobalFailed;
            setShortcutNotice((current) => ({ ...current, [action]: message }));
            commitPlaybackShortcuts({
              ...latestBindingsRef.current,
              [action]: registered.binding,
            });
            showNoticeRef.current(message);
            appendLogRef.current(
              formatText(text.logs.globalHotkeyRegisterFailed, {
                shortcut: formatPlaybackShortcut(registered.binding),
              }),
            );
            continue;
          }
        }

        if (
          !desiredActions.has(action) ||
          registeredRef.current.has(action)
        ) {
          continue;
        }
        if (isRecording) continue;

        const currentBinding = latestBindingsRef.current[action];
        if (isUnsafeGlobalPlaybackShortcut(currentBinding)) {
          failGlobalBinding(
            action,
            currentBinding,
            text.settings.keyboardShortcutUnsafeGlobal,
          );
          continue;
        }

        const registeredAccelerator =
          await tryRegisterGlobalPlaybackShortcut(
            currentBinding,
            (accelerator) =>
              register(accelerator, (event: ShortcutEvent) => {
                const callbackDecision =
                  getGlobalPlaybackShortcutCallbackDecision(
                    action,
                    event.state,
                    recordingActionRef.current,
                    pendingRecordingActionRef.current,
                    recordingSentinelRef.current?.action ?? null,
                  );
                if (callbackDecision === "execute-playback") {
                  controlsRef.current[action]();
                } else if (callbackDecision === "complete-unchanged") {
                  completeShortcutRecordingAsUnchangedRef.current(
                    action,
                    recordingSentinelRef.current?.requestId ?? -1,
                    "global",
                  );
                } else if (
                  recordingActionRef.current === null &&
                  pendingRecordingActionRef.current === null &&
                  recordingSentinelRef.current?.action === action
                ) {
                  if (
                    recordingSentinelRef.current.completionPhase ===
                      "awaiting-pressed" &&
                    event.state === "Pressed"
                  ) {
                    recordingSentinelRef.current.completionPhase =
                      "awaiting-released";
                  } else if (
                    recordingSentinelRef.current.completionPhase ===
                      "awaiting-released" &&
                    event.state === "Released"
                  ) {
                    recordingSentinelRef.current = null;
                  }
                }
              }),
          );
        if (registeredAccelerator) {
          registeredRef.current.set(action, {
            accelerator: registeredAccelerator,
            binding: currentBinding,
          });
          setShortcutNotice((current) => {
            const { [action]: _notice, ...rest } = current;
            return rest;
          });
        } else {
          failGlobalBinding(
            action,
            currentBinding,
            text.settings.keyboardShortcutGlobalFailed,
          );
        }
      }
    },
    [
      commitPlaybackShortcuts,
      failGlobalBinding,
      text.logs.globalHotkeyRegisterFailed,
      text.settings.keyboardShortcutGlobalFailed,
      text.settings.keyboardShortcutUnsafeGlobal,
    ],
  );

  useEffect(() => {
    void enqueue(() =>
      synchronizeGlobalShortcuts(
        getPlaybackShortcutRecordingSessionAction(
          recordingActionRef.current,
          pendingRecordingActionRef.current,
        ),
      ),
    );
  }, [
    enqueue,
    playbackShortcuts,
    synchronizeGlobalShortcuts,
  ]);

  const endShortcutRecording = useCallback(() => {
    const hadSession =
      getPlaybackShortcutRecordingSessionAction(
        recordingActionRef.current,
        pendingRecordingActionRef.current,
      ) !== null;
    const requestId = recordingRequestIdRef.current;
    recordingRequestIdRef.current += 1;
    recordingActionRef.current = null;
    pendingRecordingActionRef.current = null;
    setRecordingAction(null);
    setPendingRecordingAction(null);

    return hadSession
      ? enqueue(async () => {
          await synchronizeGlobalShortcuts(null);
          if (
            recordingSentinelRef.current?.requestId === requestId &&
            recordingSentinelRef.current.completionPhase === "recording"
          ) {
            recordingSentinelRef.current = null;
          }
        })
      : Promise.resolve();
  }, [enqueue, synchronizeGlobalShortcuts]);

  const completeShortcutRecordingAsUnchanged = useCallback(
    (
      action: PlaybackShortcutAction,
      requestId = recordingRequestIdRef.current,
      source: "dom" | "global" = "dom",
    ) => {
      const sessionAction = getPlaybackShortcutRecordingSessionAction(
        recordingActionRef.current,
        pendingRecordingActionRef.current,
      );
      if (
        !canCompletePlaybackShortcutRecording(
          sessionAction,
          recordingRequestIdRef.current,
          action,
          requestId,
        )
      ) {
        return false;
      }

      if (recordingSentinelRef.current?.requestId === requestId) {
        recordingSentinelRef.current.completionPhase =
          source === "global"
            ? "awaiting-released"
            : registeredRef.current.has(action)
              ? "awaiting-pressed"
              : "recording";
      }

      recordingRequestIdRef.current += 1;
      recordingActionRef.current = null;
      pendingRecordingActionRef.current = null;
      setRecordingAction(null);
      setPendingRecordingAction(null);
      setShortcutNotice((current) => ({
        ...current,
        [action]: text.settings.keyboardShortcutUnchanged,
      }));
      void enqueue(async () => {
        await synchronizeGlobalShortcuts(null);
        if (
          recordingSentinelRef.current?.requestId === requestId &&
          recordingSentinelRef.current.completionPhase === "recording"
        ) {
          recordingSentinelRef.current = null;
        }
      });
      return true;
    },
    [
      enqueue,
      synchronizeGlobalShortcuts,
      text.settings.keyboardShortcutUnchanged,
    ],
  );

  completeShortcutRecordingAsUnchangedRef.current =
    completeShortcutRecordingAsUnchanged;

  const beginShortcutRecording = useCallback(
    async (action: PlaybackShortcutAction) => {
      clearShortcutNotice(action);
      const previousAction = getPlaybackShortcutRecordingSessionAction(
        recordingActionRef.current,
        pendingRecordingActionRef.current,
      );
      const requestDecision = getPlaybackShortcutRecordingRequestDecision(
        previousAction,
        action,
      );
      if (requestDecision !== "start") {
        await endShortcutRecording();
        if (requestDecision === "cancel-current") {
          return false;
        }
      }

      const requestId = recordingRequestIdRef.current + 1;
      recordingRequestIdRef.current = requestId;
      recordingSentinelRef.current = {
        action,
        completionPhase: "recording",
        requestId,
      };
      pendingRecordingActionRef.current = action;
      setPendingRecordingAction(action);

      let suspended = false;
      await enqueue(async () => {
        try {
          await synchronizeGlobalShortcuts(action);
          suspended = true;
        } catch (error) {
          if (
            canActivatePendingPlaybackShortcutRecording(
              pendingRecordingActionRef.current,
              recordingRequestIdRef.current,
              action,
              requestId,
            )
          ) {
            const failedAction =
              error instanceof PlaybackShortcutSuspensionError
                ? error.action
                : action;
            const message = text.settings.keyboardShortcutRecordingFailed;
            setShortcutNotice((current) => ({
              ...current,
              [failedAction]: message,
            }));
            showNoticeRef.current(message);
            appendLogRef.current(text.logs.shortcutRecordingSuspendFailed);
          }
          await synchronizeGlobalShortcuts(null);
          if (recordingSentinelRef.current?.requestId === requestId) {
            recordingSentinelRef.current = null;
          }
        }
      });

      if (
        !canActivatePendingPlaybackShortcutRecording(
          pendingRecordingActionRef.current,
          recordingRequestIdRef.current,
          action,
          requestId,
        )
      ) {
        return false;
      }

      pendingRecordingActionRef.current = null;
      setPendingRecordingAction(null);
      if (!suspended) {
        return false;
      }

      recordingActionRef.current = action;
      setRecordingAction(action);
      return true;
    },
    [
      endShortcutRecording,
      enqueue,
      clearShortcutNotice,
      synchronizeGlobalShortcuts,
      text.logs.shortcutRecordingSuspendFailed,
      text.settings.keyboardShortcutRecordingFailed,
    ],
  );

  useEffect(
    () => () => {
      recordingRequestIdRef.current += 1;
      recordingActionRef.current = null;
      pendingRecordingActionRef.current = null;
      recordingSentinelRef.current = null;
      void enqueue(async () => {
        for (const registered of registeredRef.current.values()) {
          await unregister(registered.accelerator).catch(() => {});
        }
        registeredRef.current.clear();
      });
    },
    [enqueue],
  );

  return {
    beginShortcutRecording,
    clearShortcutNotice,
    completeShortcutRecordingAsUnchanged,
    endShortcutRecording,
    pendingRecordingAction,
    playbackShortcuts,
    recordingAction,
    resetPlaybackShortcuts,
    setPlaybackHotkeyControls,
    setPlaybackShortcutCode,
    setPlaybackShortcutScope,
    setPlaybackShortcuts,
    shortcutNotice,
  };
}
