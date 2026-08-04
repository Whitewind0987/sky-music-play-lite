import { register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  findMatchingInAppShortcutAction,
  fallbackGlobalPlaybackShortcutToInApp,
  formatPlaybackShortcut,
  isUnsafeGlobalPlaybackShortcut,
  normalizeGlobalPlaybackShortcutScope,
  shouldUnregisterGlobalPlaybackShortcut,
  tryRegisterGlobalPlaybackShortcut,
} from "../lib/playbackShortcuts";
import {
  defaultPlaybackShortcuts,
  playbackShortcutActions,
  type PlaybackShortcutAction,
  type PlaybackShortcutNotices,
  type PlaybackShortcutScope,
  type PlaybackShortcutBinding,
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
  const registeredRef = useRef(new Map<PlaybackShortcutAction, { accelerator: string; binding: PlaybackShortcutBinding }>());
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
  const setPlaybackShortcuts = useCallback(
    (bindings: PlaybackShortcuts) =>
      setPlaybackShortcutsState(
        playbackShortcutActions.reduce<PlaybackShortcuts>(
          (normalized, action) => ({
            ...normalized,
            [action]: normalizeGlobalPlaybackShortcutScope(bindings[action]),
          }),
          { ...defaultPlaybackShortcuts },
        ),
      ),
    [],
  );
  const setPlaybackShortcutCode = useCallback((action: PlaybackShortcutAction, code: string) => {
    setPlaybackShortcutsState((current) => ({ ...current, [action]: { ...current[action], code } }));
  }, []);
  const setPlaybackShortcutScope = useCallback((action: PlaybackShortcutAction, scope: PlaybackShortcutScope) => {
    setPlaybackShortcutsState((current) => ({ ...current, [action]: { ...current[action], scope } }));
  }, []);
  const resetPlaybackShortcuts = useCallback(() => setPlaybackShortcutsState(defaultPlaybackShortcuts), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      const action = findMatchingInAppShortcutAction(
        latestBindingsRef.current,
        event,
        isEditableTarget(event.target),
      );
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
        if (
          registered &&
          shouldUnregisterGlobalPlaybackShortcut(
            binding,
            registered.accelerator,
          )
        ) {
          try {
            await unregister(registered.accelerator);
            registeredRef.current.delete(action);
          } catch {
            const message = text.settings.keyboardShortcutGlobalFailed;
            setShortcutNotice((current) => ({ ...current, [action]: message }));
            setPlaybackShortcutsState((current) => ({ ...current, [action]: registered.binding }));
            showNoticeRef.current(message);
            appendLogRef.current(
              formatText(text.logs.globalHotkeyRegisterFailed, {
                shortcut: formatPlaybackShortcut(registered.binding),
              }),
            );
            continue;
          }
        }
        if (binding.scope !== "global" || registeredRef.current.has(action)) continue;
        const unsafeGlobal = isUnsafeGlobalPlaybackShortcut(binding);
        if (unsafeGlobal) {
          failGlobalBinding(
            action,
            binding,
            text.settings.keyboardShortcutUnsafeGlobal,
          );
          continue;
        }
        const registeredAccelerator =
          await tryRegisterGlobalPlaybackShortcut(
            binding,
            (accelerator) =>
              register(accelerator, (event: ShortcutEvent) => {
                if (event.state === "Pressed") controlsRef.current[action]();
              }),
          );
        if (registeredAccelerator) {
          registeredRef.current.set(action, { accelerator: registeredAccelerator, binding });
          setShortcutNotice((current) => { const { [action]: _notice, ...rest } = current; return rest; });
        } else {
          failGlobalBinding(
            action,
            binding,
            text.settings.keyboardShortcutGlobalFailed,
          );
        }
      }
    });
  }, [
    enqueue,
    playbackShortcuts,
    text.logs.globalHotkeyRegisterFailed,
    text.settings.keyboardShortcutGlobalFailed,
    text.settings.keyboardShortcutUnsafeGlobal,
  ]);

  function failGlobalBinding(
    action: PlaybackShortcutAction,
    binding: PlaybackShortcutBinding,
    message: string,
  ) {
    if (latestBindingsRef.current[action].scope !== "global") return;
    setShortcutNotice((current) => ({ ...current, [action]: message }));
    setPlaybackShortcutsState((current) => ({
      ...current,
      [action]: fallbackGlobalPlaybackShortcutToInApp(current[action]),
    }));
    showNoticeRef.current(message);
    appendLogRef.current(
      formatText(text.logs.globalHotkeyRegisterFailed, {
        shortcut: formatPlaybackShortcut(binding),
      }),
    );
  }

  useEffect(() => () => {
    void enqueue(async () => {
      await Promise.all(Array.from(registeredRef.current.values(), (registered) => unregister(registered.accelerator).catch(() => {})));
      registeredRef.current.clear();
    });
  }, [enqueue]);

  return { clearShortcutNotice, playbackShortcuts, resetPlaybackShortcuts, setPlaybackHotkeyControls, setPlaybackShortcutCode, setPlaybackShortcutScope, setPlaybackShortcuts, shortcutNotice };
}
