import {
  register,
  unregister,
  type ShortcutEvent,
} from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  formatShortcutCode,
  isUnsafeGlobalStopShortcut,
  toGlobalShortcutAccelerators,
} from "../lib/playbackShortcuts";
import {
  defaultPlaybackShortcuts,
  type PlaybackShortcutAction,
  type PlaybackShortcutNotices,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";

type PlaybackHotkeyControls = Record<PlaybackShortcutAction, () => void>;

type UsePlaybackShortcutsOptions = {
  appendLog: (entry: string) => void;
  showNotice: (message: string) => void;
  text: UiText;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

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

export function usePlaybackShortcuts({
  appendLog,
  showNotice,
  text,
}: UsePlaybackShortcutsOptions) {
  const playbackHotkeyControlsRef = useRef<PlaybackHotkeyControls>({
    next: () => {},
    pauseResume: () => {},
    stop: () => {},
  });
  const globalStopShortcutOperationRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const appendLogRef = useRef(appendLog);
  const showNoticeRef = useRef(showNotice);
  const [shortcutNotice, setShortcutNotice] =
    useState<PlaybackShortcutNotices>({});
  const [playbackShortcuts, setPlaybackShortcuts] =
    useState<PlaybackShortcuts>(defaultPlaybackShortcuts);

  useEffect(() => {
    appendLogRef.current = appendLog;
    showNoticeRef.current = showNotice;
  }, [appendLog, showNotice]);

  const setPlaybackHotkeyControls = useCallback(
    (controls: PlaybackHotkeyControls) => {
      playbackHotkeyControlsRef.current = controls;
    },
    [],
  );

  const clearShortcutNotice = useCallback(() => {
    setShortcutNotice({});
  }, []);

  function enqueueGlobalStopShortcutOperation(operation: () => Promise<void>) {
    const nextOperation = globalStopShortcutOperationRef.current
      .catch(() => undefined)
      .then(operation);

    globalStopShortcutOperationRef.current = nextOperation;
    return nextOperation;
  }

  useEffect(() => {
    function handleInAppShortcutKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.code === playbackShortcuts.pauseResume) {
        event.preventDefault();
        playbackHotkeyControlsRef.current.pauseResume();
        return;
      }

      if (event.code === playbackShortcuts.next) {
        event.preventDefault();
        playbackHotkeyControlsRef.current.next();
      }
    }

    window.addEventListener("keydown", handleInAppShortcutKeyDown);

    return () => {
      window.removeEventListener("keydown", handleInAppShortcutKeyDown);
    };
  }, [playbackShortcuts.next, playbackShortcuts.pauseResume]);

  useEffect(() => {
    let isCancelled = false;
    const registeredAccelerators: string[] = [];

    async function registerGlobalStopHotkey() {
      const shortcutCode = playbackShortcuts.stop;
      const acceleratorCandidates = toGlobalShortcutAccelerators(shortcutCode);
      const shortcutLabel = formatShortcutCode(shortcutCode) || shortcutCode;

      if (isUnsafeGlobalStopShortcut(shortcutCode)) {
        setShortcutNotice((currentNotices) => ({
          ...currentNotices,
          stop: text.settings.keyboardShortcutUnsafeGlobalStop,
        }));
        return;
      }

      if (shortcutCode.trim() !== "" && acceleratorCandidates.length === 0) {
        setShortcutNotice((currentNotices) => ({
          ...currentNotices,
          stop: text.settings.keyboardShortcutGlobalStopFailed,
        }));
        return;
      }

      await enqueueGlobalStopShortcutOperation(async () => {
        if (acceleratorCandidates.length > 0) {
          await unregister(Array.from(new Set(acceleratorCandidates))).catch(
            () => {},
          );
        }

        if (isCancelled) {
          return;
        }

        for (const accelerator of acceleratorCandidates) {
          try {
            await register(accelerator, (event: ShortcutEvent) => {
              if (event.state !== "Pressed") {
                return;
              }

              playbackHotkeyControlsRef.current.stop();
            });

            if (isCancelled) {
              await unregister(accelerator).catch(() => {});
              return;
            }

            registeredAccelerators.push(accelerator);
            setShortcutNotice((currentNotices) => {
              const { stop: _stopNotice, ...nextNotices } = currentNotices;
              return nextNotices;
            });
            return;
          } catch (error) {
            const isLastCandidate =
              accelerator ===
              acceleratorCandidates[acceleratorCandidates.length - 1];

            if (!isLastCandidate) {
              continue;
            }

            const failureMessage =
              text.settings.keyboardShortcutGlobalStopFailed;

            console.warn(
              "Failed to register global Stop hotkey.",
              shortcutLabel,
              error,
            );
            setShortcutNotice((currentNotices) => ({
              ...currentNotices,
              stop: failureMessage,
            }));
            showNoticeRef.current(failureMessage);
            appendLogRef.current(
              formatText(text.logs.globalHotkeyRegisterFailed, {
                shortcut: shortcutLabel,
              }),
            );
          }
        }
      });
    }

    void registerGlobalStopHotkey();

    return () => {
      isCancelled = true;

      void enqueueGlobalStopShortcutOperation(async () => {
        if (registeredAccelerators.length > 0) {
          await unregister(Array.from(new Set(registeredAccelerators))).catch(
            () => {},
          );
        }
      });
    };
  }, [
    playbackShortcuts.stop,
    text.logs.globalHotkeyRegisterFailed,
    text.settings.keyboardShortcutGlobalStopFailed,
    text.settings.keyboardShortcutUnsafeGlobalStop,
  ]);

  return {
    clearShortcutNotice,
    playbackShortcuts,
    setPlaybackHotkeyControls,
    setPlaybackShortcuts,
    shortcutNotice,
  };
}
