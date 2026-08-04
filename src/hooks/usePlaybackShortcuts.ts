import {
  register,
  unregister,
  type ShortcutEvent,
} from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  fallbackGlobalPlaybackShortcutToInApp,
  findMatchingInAppShortcutAction,
  formatPlaybackShortcut,
  getDesiredGlobalPlaybackShortcutActions,
  getPlaybackShortcutRecordingRequestDecision,
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
  const recordingRequestIdRef = useRef(0);
  const recordingPendingRef = useRef(false);
  const appendLogRef = useRef(appendLog);
  const showNoticeRef = useRef(showNotice);
  const [recordingAction, setRecordingAction] =
    useState<PlaybackShortcutAction | null>(null);
  const [isRecordingPending, setIsRecordingPending] = useState(false);
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
  const clearShortcutNotice = useCallback(() => setShortcutNotice({}), []);
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
        recordingPendingRef.current
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
    async (isRecording: boolean) => {
      const desiredActions = new Set(
        getDesiredGlobalPlaybackShortcutActions(
          latestBindingsRef.current,
          isRecording,
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
                if (
                  event.state === "Pressed" &&
                  recordingActionRef.current === null &&
                  !recordingPendingRef.current
                ) {
                  controlsRef.current[action]();
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
        recordingActionRef.current !== null || recordingPendingRef.current,
      ),
    );
  }, [
    enqueue,
    playbackShortcuts,
    recordingAction,
    synchronizeGlobalShortcuts,
  ]);

  const endShortcutRecording = useCallback(() => {
    const hadSession =
      recordingActionRef.current !== null || recordingPendingRef.current;
    recordingRequestIdRef.current += 1;
    recordingActionRef.current = null;
    recordingPendingRef.current = false;
    setRecordingAction(null);
    setIsRecordingPending(false);

    return hadSession
      ? enqueue(() => synchronizeGlobalShortcuts(false))
      : Promise.resolve();
  }, [enqueue, synchronizeGlobalShortcuts]);

  const beginShortcutRecording = useCallback(
    async (action: PlaybackShortcutAction) => {
      const previousAction = recordingActionRef.current;
      const requestDecision = getPlaybackShortcutRecordingRequestDecision(
        previousAction,
        action,
      );
      if (requestDecision !== "start" || recordingPendingRef.current) {
        await endShortcutRecording();
        if (requestDecision === "cancel-current") {
          return false;
        }
      }

      const requestId = recordingRequestIdRef.current + 1;
      recordingRequestIdRef.current = requestId;
      recordingPendingRef.current = true;
      setIsRecordingPending(true);

      let suspended = false;
      await enqueue(async () => {
        try {
          await synchronizeGlobalShortcuts(true);
          suspended = true;
        } catch (error) {
          if (recordingRequestIdRef.current === requestId) {
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
          await synchronizeGlobalShortcuts(false);
        }
      });

      if (recordingRequestIdRef.current !== requestId) {
        return false;
      }

      recordingPendingRef.current = false;
      setIsRecordingPending(false);
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
      synchronizeGlobalShortcuts,
      text.logs.shortcutRecordingSuspendFailed,
      text.settings.keyboardShortcutRecordingFailed,
    ],
  );

  useEffect(
    () => () => {
      recordingRequestIdRef.current += 1;
      recordingActionRef.current = null;
      recordingPendingRef.current = false;
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
    endShortcutRecording,
    isRecordingPending,
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
