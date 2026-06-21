import { register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
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
  playbackShortcutActions,
  type PlaybackShortcutAction,
  type PlaybackShortcutNotices,
  type PlaybackShortcutScope,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";

type PlaybackHotkeyControls = Record<PlaybackShortcutAction, () => void>;
type UsePlaybackShortcutsOptions = { appendLog: (entry: string) => void; showNotice: (message: string) => void; text: UiText };

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button" || target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
}

export function usePlaybackShortcuts({ appendLog, showNotice, text }: UsePlaybackShortcutsOptions) {
  const controlsRef = useRef<PlaybackHotkeyControls>({ next: () => {}, pauseResume: () => {}, stop: () => {} });
  const operationRef = useRef<Promise<void>>(Promise.resolve());
  const registeredRef = useRef(new Map<PlaybackShortcutAction, string>());
  const latestBindingsRef = useRef<PlaybackShortcuts>(defaultPlaybackShortcuts);
  const appendLogRef = useRef(appendLog);
  const showNoticeRef = useRef(showNotice);
  const [shortcutNotice, setShortcutNotice] = useState<PlaybackShortcutNotices>({});
  const [playbackShortcuts, setPlaybackShortcutsState] = useState<PlaybackShortcuts>(defaultPlaybackShortcuts);

  latestBindingsRef.current = playbackShortcuts;
  useEffect(() => { appendLogRef.current = appendLog; showNoticeRef.current = showNotice; }, [appendLog, showNotice]);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const next = operationRef.current.catch(() => undefined).then(operation);
    operationRef.current = next;
    return next;
  }, []);

  const setPlaybackHotkeyControls = useCallback((controls: PlaybackHotkeyControls) => { controlsRef.current = controls; }, []);
  const clearShortcutNotice = useCallback(() => setShortcutNotice({}), []);
  const setPlaybackShortcuts = useCallback((bindings: PlaybackShortcuts) => setPlaybackShortcutsState(bindings), []);
  const setPlaybackShortcutCode = useCallback((action: PlaybackShortcutAction, code: string) => {
    setPlaybackShortcutsState((current) => ({ ...current, [action]: { ...current[action], code } }));
  }, []);
  const setPlaybackShortcutScope = useCallback((action: PlaybackShortcutAction, scope: PlaybackShortcutScope) => {
    setPlaybackShortcutsState((current) => ({ ...current, [action]: { ...current[action], scope } }));
  }, []);
  const resetPlaybackShortcuts = useCallback(() => setPlaybackShortcutsState(defaultPlaybackShortcuts), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) return;
      const action = playbackShortcutActions.find((candidate) => latestBindingsRef.current[candidate].scope === "in-app" && latestBindingsRef.current[candidate].code === event.code);
      if (action) { event.preventDefault(); controlsRef.current[action](); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    void enqueue(async () => {
      const desired = latestBindingsRef.current;
      for (const action of playbackShortcutActions) {
        const binding = desired[action];
        const registered = registeredRef.current.get(action);
        if (registered && (binding.scope !== "global" || !toGlobalShortcutAccelerators(binding.code).includes(registered))) {
          await unregister(registered).catch(() => {});
          registeredRef.current.delete(action);
        }
        if (binding.scope !== "global" || registeredRef.current.has(action)) continue;
        const candidates = toGlobalShortcutAccelerators(binding.code);
        const unsafeStop = action === "stop" && isUnsafeGlobalStopShortcut(binding.code);
        if (unsafeStop || candidates.length === 0) {
          failGlobalBinding(action, binding.code, unsafeStop ? text.settings.keyboardShortcutUnsafeGlobalStop : text.settings.keyboardShortcutGlobalStopFailed);
          continue;
        }
        let registeredAccelerator: string | null = null;
        for (const accelerator of candidates) {
          try {
            await register(accelerator, (event: ShortcutEvent) => {
              if (event.state === "Pressed") controlsRef.current[action]();
            });
            registeredAccelerator = accelerator;
            break;
          } catch { /* try alias */ }
        }
        if (registeredAccelerator) {
          registeredRef.current.set(action, registeredAccelerator);
          setShortcutNotice((current) => { const { [action]: _notice, ...rest } = current; return rest; });
        } else {
          failGlobalBinding(action, binding.code, text.settings.keyboardShortcutGlobalStopFailed);
        }
      }
    });
  }, [enqueue, playbackShortcuts, text.logs.globalHotkeyRegisterFailed, text.settings.keyboardShortcutGlobalStopFailed, text.settings.keyboardShortcutUnsafeGlobalStop]);

  function failGlobalBinding(action: PlaybackShortcutAction, code: string, message: string) {
    if (latestBindingsRef.current[action].scope !== "global") return;
    setShortcutNotice((current) => ({ ...current, [action]: message }));
    setPlaybackShortcutsState((current) => ({ ...current, [action]: { ...current[action], scope: "in-app" } }));
    showNoticeRef.current(message);
    appendLogRef.current(formatText(text.logs.globalHotkeyRegisterFailed, { shortcut: formatShortcutCode(code) || code }));
  }

  useEffect(() => () => {
    void enqueue(async () => {
      await Promise.all(Array.from(registeredRef.current.values(), (accelerator) => unregister(accelerator).catch(() => {})));
      registeredRef.current.clear();
    });
  }, [enqueue]);

  return { clearShortcutNotice, playbackShortcuts, resetPlaybackShortcuts, setPlaybackHotkeyControls, setPlaybackShortcutCode, setPlaybackShortcutScope, setPlaybackShortcuts, shortcutNotice };
}
