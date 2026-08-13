import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  createScoreRecordingKeyLookup,
  createScoreRecordingSession,
  finishScoreRecordingSession,
  processScoreRecordingEvent,
  scoreRecordingSessionToSong,
} from "../lib/scoreRecording";
import {
  isScoreRecordingTargetCurrent,
  shouldCancelRecordingForSkyLifecycle,
} from "../lib/scoreRecordingFlow";
import {
  cancelScoreRecording,
  getSkyWindowMonitorState,
  listenScoreRecordingEvents,
  listenSkyWindowLifecycleEvents,
  startScoreRecording,
  stopScoreRecording,
} from "../lib/tauriApi";
import {
  skyKeyNames,
  type KeyMapping,
} from "../types/keyMapping";
import type {
  ScoreRecordingKeyLookup,
  ScoreRecordingSession,
} from "../types/scoreRecording";
import type { Song } from "../types/score";

export type ScoreRecordingLifecycle =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "cancelling";

type ActiveRecording = {
  keyMappingSnapshot: KeyMapping;
  lookup: ScoreRecordingKeyLookup;
  nativeStarted: boolean;
  sessionId: number;
  targetHwnd: string;
};

type UseScoreRecordingOptions = {
  appendLog: (message: string) => void;
  keyMapping: KeyMapping;
  saveRecordedSong: (song: Song) => Promise<unknown>;
  showNotice: (message: string) => void;
  text: UiText["scoreRecording"];
};

export function useScoreRecording({
  appendLog,
  keyMapping,
  saveRecordedSong,
  showNotice,
  text,
}: UseScoreRecordingOptions) {
  const [lifecycle, setLifecycle] =
    useState<ScoreRecordingLifecycle>("idle");
  const [recordedNoteCount, setRecordedNoteCount] = useState(0);
  const [completedSession, setCompletedSession] =
    useState<ScoreRecordingSession | null>(null);
  const [completedName, setCompletedName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const lifecycleRef = useRef<ScoreRecordingLifecycle>("idle");
  const mountedRef = useRef(true);
  const nextSessionIdRef = useRef(1);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const sessionRef = useRef<ScoreRecordingSession | null>(null);
  const scoreEventUnlistenRef = useRef<(() => void) | null>(null);
  const skyLifecycleUnlistenRef = useRef<(() => void) | null>(null);
  const acceptingEventsRef = useRef(false);
  const isSavingRef = useRef(false);

  function updateLifecycle(nextLifecycle: ScoreRecordingLifecycle) {
    lifecycleRef.current = nextLifecycle;
    if (mountedRef.current) {
      setLifecycle(nextLifecycle);
    }
  }

  function updateRecordedNoteCount(count: number) {
    if (mountedRef.current) {
      setRecordedNoteCount(count);
    }
  }

  function updateIsSaving(nextIsSaving: boolean) {
    isSavingRef.current = nextIsSaving;
    if (mountedRef.current) {
      setIsSaving(nextIsSaving);
    }
  }

  function safelyUnlisten(unlisten: (() => void) | null) {
    try {
      unlisten?.();
    } catch {
      // Listener teardown must not prevent the remaining native cleanup.
    }
  }

  function clearListeners() {
    const scoreUnlisten = scoreEventUnlistenRef.current;
    const lifecycleUnlisten = skyLifecycleUnlistenRef.current;
    scoreEventUnlistenRef.current = null;
    skyLifecycleUnlistenRef.current = null;
    safelyUnlisten(scoreUnlisten);
    safelyUnlisten(lifecycleUnlisten);
  }

  function clearActiveFrontendSession() {
    acceptingEventsRef.current = false;
    clearListeners();
    activeRecordingRef.current = null;
    sessionRef.current = null;
    updateRecordedNoteCount(0);
  }

  function reportFailure(message: string) {
    appendLog(message);
    showNotice(message);
  }

  function isCurrentRecording(active: ActiveRecording) {
    return activeRecordingRef.current === active;
  }

  function isStarting() {
    return lifecycleRef.current === "starting";
  }

  function isRecording() {
    return lifecycleRef.current === "recording";
  }

  async function cancelForSkyLifecycle(sessionId: number) {
    const active = activeRecordingRef.current;
    if (
      active === null ||
      active.sessionId !== sessionId ||
      lifecycleRef.current !== "recording"
    ) {
      return;
    }

    updateLifecycle("cancelling");
    try {
      const response = await cancelScoreRecording(sessionId);
      if (!isCurrentRecording(active)) {
        return;
      }
      clearActiveFrontendSession();
      setCompletedSession(null);
      updateLifecycle("idle");
      appendLog(text.autoCancelledLog);
      if (response.warning === null) {
        showNotice(text.targetChanged);
      } else {
        appendLog(text.autoCancelWarning);
        showNotice(text.autoCancelWarning);
      }
    } catch {
      if (!isCurrentRecording(active)) {
        return;
      }
      updateLifecycle("recording");
      reportFailure(text.autoCancelFailed);
    }
  }

  async function start() {
    if (lifecycleRef.current !== "idle" || isSavingRef.current) {
      return;
    }

    updateLifecycle("starting");
    const keyMappingSnapshot: KeyMapping = { ...keyMapping };
    const lookup = createScoreRecordingKeyLookup(keyMappingSnapshot);
    if (lookup.ambiguousKeys.size > 0) {
      updateLifecycle("idle");
      showNotice(text.duplicateMapping);
      return;
    }

    const sessionId = nextSessionIdRef.current;
    if (sessionId >= Number.MAX_SAFE_INTEGER) {
      updateLifecycle("idle");
      reportFailure(text.startFailed);
      return;
    }
    nextSessionIdRef.current += 1;

    let targetHwnd: string;
    try {
      const snapshot = await getSkyWindowMonitorState();
      if (!mountedRef.current || !isStarting()) {
        return;
      }
      if (snapshot.window === null) {
        updateLifecycle("idle");
        showNotice(text.skyNotDetected);
        return;
      }
      targetHwnd = snapshot.window.hwnd;
    } catch {
      if (mountedRef.current && isStarting()) {
        updateLifecycle("idle");
        reportFailure(text.startFailed);
      }
      return;
    }

    const active: ActiveRecording = {
      keyMappingSnapshot,
      lookup,
      nativeStarted: false,
      sessionId,
      targetHwnd,
    };
    activeRecordingRef.current = active;
    sessionRef.current = createScoreRecordingSession(sessionId);
    acceptingEventsRef.current = true;
    updateRecordedNoteCount(0);

    let scoreUnlisten: (() => void) | null = null;
    try {
      scoreUnlisten = await listenScoreRecordingEvents((event) => {
        if (!acceptingEventsRef.current || !isCurrentRecording(active)) {
          return;
        }
        const currentSession = sessionRef.current;
        if (currentSession === null) {
          return;
        }
        const nextSession = processScoreRecordingEvent(
          currentSession,
          event.payload,
          active.lookup,
        );
        sessionRef.current = nextSession;
        if (nextSession.notes.length !== currentSession.notes.length) {
          updateRecordedNoteCount(nextSession.notes.length);
        }
      });
    } catch {
      clearActiveFrontendSession();
      updateLifecycle("idle");
      reportFailure(text.startFailed);
      return;
    }

    if (
      !mountedRef.current ||
      !isStarting() ||
      !isCurrentRecording(active)
    ) {
      safelyUnlisten(scoreUnlisten);
      clearActiveFrontendSession();
      return;
    }
    scoreEventUnlistenRef.current = scoreUnlisten;

    try {
      await startScoreRecording({
        keys: skyKeyNames.map((skyKey) => active.keyMappingSnapshot[skyKey]),
        sessionId,
        targetHwnd,
      });
      active.nativeStarted = true;
    } catch {
      if (isCurrentRecording(active)) {
        clearActiveFrontendSession();
        updateLifecycle("idle");
        reportFailure(text.startFailed);
      }
      return;
    }

    if (!mountedRef.current || !isCurrentRecording(active)) {
      acceptingEventsRef.current = false;
      void cancelScoreRecording(sessionId).catch(() => {});
      clearActiveFrontendSession();
      return;
    }
    setCompletedSession(null);
    setCompletedName("");

    try {
      const lifecycleUnlisten = await listenSkyWindowLifecycleEvents((event) => {
        if (
          shouldCancelRecordingForSkyLifecycle(targetHwnd, event.payload)
        ) {
          void cancelForSkyLifecycle(sessionId);
        }
      });
      if (!mountedRef.current || !isCurrentRecording(active)) {
        safelyUnlisten(lifecycleUnlisten);
        void cancelScoreRecording(sessionId).catch(() => {});
        clearActiveFrontendSession();
        return;
      }
      skyLifecycleUnlistenRef.current = lifecycleUnlisten;
    } catch {
      try {
        const response = await cancelScoreRecording(sessionId);
        if (isCurrentRecording(active)) {
          clearActiveFrontendSession();
          updateLifecycle("idle");
          if (response.warning === null) {
            reportFailure(text.startFailed);
          } else {
            reportFailure(text.startCleanupWarning);
          }
        }
      } catch {
        if (isCurrentRecording(active)) {
          updateLifecycle("recording");
          reportFailure(text.lifecycleSetupFailed);
        }
      }
      return;
    }

    updateLifecycle("recording");
    try {
      const currentSnapshot = await getSkyWindowMonitorState();
      if (
        isCurrentRecording(active) &&
        isRecording() &&
        !isScoreRecordingTargetCurrent(targetHwnd, currentSnapshot)
      ) {
        await cancelForSkyLifecycle(sessionId);
        return;
      }
    } catch {
      if (
        isCurrentRecording(active) &&
        isRecording()
      ) {
        await cancelForSkyLifecycle(sessionId);
        return;
      }
    }

    if (
      isCurrentRecording(active) &&
      isRecording()
    ) {
      appendLog(text.startedLog);
    }
  }

  async function stop() {
    const active = activeRecordingRef.current;
    if (active === null || lifecycleRef.current !== "recording") {
      return;
    }

    updateLifecycle("stopping");
    let warning: string | null;
    try {
      const response = await stopScoreRecording(active.sessionId);
      warning = response.warning;
    } catch {
      if (isCurrentRecording(active)) {
        updateLifecycle("recording");
        reportFailure(text.stopFailed);
      }
      return;
    }

    if (!isCurrentRecording(active)) {
      return;
    }
    const currentSession = sessionRef.current;
    const finishedSession =
      currentSession === null
        ? null
        : finishScoreRecordingSession(currentSession);
    clearActiveFrontendSession();
    updateLifecycle("idle");
    appendLog(text.stoppedLog);

    if (finishedSession === null || finishedSession.notes.length === 0) {
      setCompletedSession(null);
      setCompletedName("");
      if (warning === null) {
        showNotice(text.noValidNotes);
      } else {
        appendLog(text.stopWarningNoValidNotes);
        showNotice(text.stopWarningNoValidNotes);
      }
      return;
    }
    setCompletedSession(finishedSession);
    if (warning !== null) {
      appendLog(text.stopWarning);
      showNotice(text.stopWarning);
    }
  }

  async function cancel() {
    const active = activeRecordingRef.current;
    if (active === null || lifecycleRef.current !== "recording") {
      return;
    }

    updateLifecycle("cancelling");
    let warning: string | null;
    try {
      const response = await cancelScoreRecording(active.sessionId);
      warning = response.warning;
    } catch {
      if (isCurrentRecording(active)) {
        updateLifecycle("recording");
        reportFailure(text.cancelFailed);
      }
      return;
    }

    if (!isCurrentRecording(active)) {
      return;
    }
    clearActiveFrontendSession();
    setCompletedSession(null);
    setCompletedName("");
    updateLifecycle("idle");
    appendLog(text.cancelledLog);
    if (warning !== null) {
      appendLog(text.cancelWarning);
      showNotice(text.cancelWarning);
    }
  }

  function changeCompletedName(name: string) {
    if (!isSavingRef.current) {
      setCompletedName(name);
    }
  }

  async function saveCompletedRecording() {
    const session = completedSession;

    if (
      session === null ||
      lifecycleRef.current !== "idle" ||
      isSavingRef.current
    ) {
      return;
    }

    const name = completedName.trim();
    if (name.length === 0) {
      showNotice(text.emptyName);
      return;
    }

    const song = scoreRecordingSessionToSong(session, name);
    if (song === null) {
      reportFailure(text.saveInvalidRecording);
      return;
    }

    updateIsSaving(true);
    try {
      await saveRecordedSong(song);
      if (!mountedRef.current) {
        return;
      }
      setCompletedSession(null);
      setCompletedName("");
      const message = formatText(text.saveSucceeded, { name });
      appendLog(message);
      showNotice(message);
    } catch {
      if (mountedRef.current) {
        reportFailure(text.saveFailed);
      }
    } finally {
      updateIsSaving(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      acceptingEventsRef.current = false;
      const active = activeRecordingRef.current;
      clearListeners();
      activeRecordingRef.current = null;
      sessionRef.current = null;
      if (active?.nativeStarted) {
        void cancelScoreRecording(active.sessionId).catch(() => {});
      }
    };
  }, []);

  return {
    canCancel: lifecycle === "recording",
    canStart: lifecycle === "idle" && !isSaving,
    canStop: lifecycle === "recording",
    completedName,
    completedSession,
    handleCancel: cancel,
    handleCompletedNameChange: changeCompletedName,
    handleSave: saveCompletedRecording,
    handleStart: start,
    handleStop: stop,
    isBusy:
      lifecycle === "starting" ||
      lifecycle === "stopping" ||
      lifecycle === "cancelling",
    isRecording: lifecycle === "recording",
    isSaving,
    lifecycle,
    recordedNoteCount,
  };
}
