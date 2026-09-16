import { useCallback, useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { PreparedPlaybackPlanCacheKey } from "../lib/backgroundPlaybackPlanCache";
import { formatText } from "../lib/formatText";
import {
  canApplyManualStepResponse,
  emptyManualPlaybackProgress,
  getManualEventRoute,
  isManualPlaybackEngaged,
  manualProgressFromFinishedEvent,
  manualProgressFromStep,
  shouldResetManualForSongChange,
  shouldRetryManualPreparedPlanStart,
  shouldShowManualProgress,
  type ManualPlaybackOutputMode,
  type ManualPlaybackUiProgress,
  type ManualPlaybackUiState,
} from "../lib/manualPlaybackState";
import {
  listenManualPlaybackEvents,
  startPreparedManualBackgroundPlayback,
  startPreparedManualForegroundPlayback,
  stepManualPlayback,
  stopManualPlayback,
  type ManualPlaybackEventPayload,
  type ManualPlaybackStepResponse,
} from "../lib/tauriApi";
import type { TargetWindowCompatibilityProfile } from "../types/experimentalInput";
import type { LibrarySongId } from "../types/library";
import type { Song } from "../types/score";
import type { PreparedPlaybackPlan } from "./usePlaybackPlanPreparation";

type UseManualPlaybackOptions = {
  appendLog: (message: string) => void;
  currentSongId: LibrarySongId | null;
  experimentalInputEnabled: boolean;
  foregroundKeyHoldMs: number;
  getOrPreparePlaybackPlan: (options: {
    priority: "direct" | "warm";
    resolvedSong?: Song | null;
    songIndex: number;
  }) => Promise<PreparedPlaybackPlan>;
  invalidatePlaybackPlan: (cacheKey: PreparedPlaybackPlanCacheKey) => void;
  outputMode: ManualPlaybackOutputMode;
  showNotice?: (message: string) => void;
  targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
  targetWindowHwnd: string | null;
  targetWindowKeyHoldMs: number;
  text: UiText;
};

type ManualStepRequest = {
  songId: LibrarySongId;
  songIndex: number;
  songName: string;
};

export function useManualPlayback({
  appendLog,
  currentSongId,
  experimentalInputEnabled,
  foregroundKeyHoldMs,
  getOrPreparePlaybackPlan,
  invalidatePlaybackPlan,
  outputMode,
  showNotice,
  targetWindowCompatibilityProfile,
  targetWindowHwnd,
  targetWindowKeyHoldMs,
  text,
}: UseManualPlaybackOptions) {
  const activeSessionIdRef = useRef<number | null>(null);
  const eventHandlerRef = useRef<(payload: ManualPlaybackEventPayload) => void>(() => {});
  const manualOutputModeRef = useRef<ManualPlaybackOutputMode | null>(null);
  const manualSongIdRef = useRef<LibrarySongId | null>(null);
  const pendingEventsRef = useRef(new Map<number, ManualPlaybackEventPayload[]>());
  const requestTokenRef = useRef(0);
  const stateRef = useRef<ManualPlaybackUiState>("idle");
  const stepQueueRef = useRef<Promise<void>>(Promise.resolve());
  const terminalSessionIdsRef = useRef(new Set<number>());
  const progressRef = useRef<ManualPlaybackUiProgress>(emptyManualPlaybackProgress);
  const [manualOutputMode, setManualOutputMode] =
    useState<ManualPlaybackOutputMode | null>(null);
  const [manualSongId, setManualSongId] = useState<LibrarySongId | null>(null);
  const [progress, setProgress] = useState<ManualPlaybackUiProgress>(
    emptyManualPlaybackProgress,
  );
  const [state, setState] = useState<ManualPlaybackUiState>("idle");

  const updateState = useCallback((nextState: ManualPlaybackUiState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const updateProgress = useCallback((nextProgress: ManualPlaybackUiProgress) => {
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  const reset = useCallback(
    ({ shouldLog = false }: { shouldLog?: boolean } = {}) => {
      requestTokenRef.current += 1;
      const sessionId = activeSessionIdRef.current;
      activeSessionIdRef.current = null;
      manualSongIdRef.current = null;
      manualOutputModeRef.current = null;
      pendingEventsRef.current.clear();
      terminalSessionIdsRef.current.clear();
      stepQueueRef.current = Promise.resolve();
      setManualSongId(null);
      setManualOutputMode(null);
      updateProgress(emptyManualPlaybackProgress);
      updateState("idle");

      if (sessionId !== null) {
        void stopManualPlayback(sessionId).catch(() => {});
      }
      if (shouldLog) {
        appendLog(text.logs.manualPlaybackStopped);
      }
    },
    [appendLog, text.logs.manualPlaybackStopped, updateProgress, updateState],
  );

  const applyTerminalEvent = useCallback(
    (payload: ManualPlaybackEventPayload) => {
      if (terminalSessionIdsRef.current.has(payload.sessionId)) {
        return;
      }

      terminalSessionIdsRef.current.add(payload.sessionId);
      activeSessionIdRef.current = null;
      if (payload.type === "finished") {
        updateProgress(
          manualProgressFromFinishedEvent(payload.progress, progressRef.current),
        );
        updateState("finished");
        return;
      }

      const errorMessage = payload.error ?? text.logs.manualPlaybackFailed;
      const notice = formatText(text.logs.manualPlaybackFailed, {
        error: errorMessage,
      });
      updateState("error");
      appendLog(notice);
      showNotice?.(notice);
    },
    [appendLog, showNotice, text.logs.manualPlaybackFailed, updateProgress, updateState],
  );

  eventHandlerRef.current = (payload) => {
    const route = getManualEventRoute({
      currentSessionId: activeSessionIdRef.current,
      eventSessionId: payload.sessionId,
      isStarting: stateRef.current === "starting",
    });

    if (route === "buffer") {
      const events = pendingEventsRef.current.get(payload.sessionId) ?? [];
      pendingEventsRef.current.set(payload.sessionId, [...events, payload]);
      return;
    }
    if (route === "apply") {
      applyTerminalEvent(payload);
    }
  };

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listenManualPlaybackEvents((event) => {
      eventHandlerRef.current(event.payload);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
      requestTokenRef.current += 1;
      const sessionId = activeSessionIdRef.current;
      activeSessionIdRef.current = null;
      if (sessionId !== null) {
        void stopManualPlayback(sessionId).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (
      shouldResetManualForSongChange({
        currentSongId,
        manualSongId: manualSongIdRef.current,
      })
    ) {
      reset();
    }
  }, [currentSongId, reset]);

  useEffect(() => {
    if (!experimentalInputEnabled && isManualPlaybackEngaged(stateRef.current)) {
      reset();
    }
  }, [experimentalInputEnabled, reset]);

  useEffect(() => {
    if (
      isManualPlaybackEngaged(stateRef.current) &&
      manualOutputModeRef.current !== null &&
      manualOutputModeRef.current !== outputMode
    ) {
      reset();
    }
  }, [outputMode, reset]);

  useEffect(() => {
    if (
      targetWindowHwnd === null &&
      isManualPlaybackEngaged(stateRef.current) &&
      manualOutputModeRef.current === "target-window"
    ) {
      reset();
    }
  }, [reset, targetWindowHwnd]);

  const applyStepResponse = useCallback(
    (response: ManualPlaybackStepResponse) => {
      if (!canApplyManualStepResponse(response, terminalSessionIdsRef.current)) {
        return;
      }
      updateProgress(manualProgressFromStep(response));
      updateState(response.state);
    },
    [updateProgress, updateState],
  );

  const failSession = useCallback(
    (error: unknown, sessionId: number | null) => {
      if (sessionId !== null && terminalSessionIdsRef.current.has(sessionId)) {
        return;
      }
      if (sessionId !== null) {
        terminalSessionIdsRef.current.add(sessionId);
      }
      activeSessionIdRef.current = null;
      const errorMessage = String(error instanceof Error ? error.message : error);
      const notice = formatText(text.logs.manualPlaybackFailed, { error: errorMessage });
      updateState("error");
      appendLog(notice);
      showNotice?.(notice);
    },
    [appendLog, showNotice, text.logs.manualPlaybackFailed, updateState],
  );

  const stepActiveSession = useCallback(
    (sessionId: number) => {
      const task = stepQueueRef.current.then(async () => {
        if (activeSessionIdRef.current !== sessionId) {
          return;
        }
        try {
          const response = await stepManualPlayback(sessionId);
          if (activeSessionIdRef.current === sessionId) {
            applyStepResponse(response);
          }
        } catch (error) {
          failSession(error, sessionId);
        }
      });
      stepQueueRef.current = task.catch(() => {});
      return task.then(() => true);
    },
    [applyStepResponse, failSession],
  );

  const startSession = useCallback(
    async (request: ManualStepRequest) => {
      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;
      pendingEventsRef.current.clear();
      terminalSessionIdsRef.current.clear();
      manualSongIdRef.current = request.songId;
      manualOutputModeRef.current = outputMode;
      setManualSongId(request.songId);
      setManualOutputMode(outputMode);
      updateProgress(emptyManualPlaybackProgress);
      updateState("starting");

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const prepared = await getOrPreparePlaybackPlan({
            priority: "direct",
            songIndex: request.songIndex,
          });
          let response: ManualPlaybackStepResponse;
          try {
            response =
              outputMode === "foreground"
                ? await startPreparedManualForegroundPlayback({
                    keyHoldMs: foregroundKeyHoldMs,
                    preparedPlanId: prepared.preparedPlanId,
                  })
                : await startPreparedManualBackgroundPlayback({
                    compatibilityProfile: targetWindowCompatibilityProfile,
                    hwnd: targetWindowHwnd ?? "",
                    keyHoldMs: targetWindowKeyHoldMs,
                    preparedPlanId: prepared.preparedPlanId,
                  });
          } catch (error) {
            if (shouldRetryManualPreparedPlanStart(attempt, error)) {
              invalidatePlaybackPlan(prepared.cacheKey);
              continue;
            }
            throw error;
          }

          if (requestTokenRef.current !== token) {
            void stopManualPlayback(response.sessionId).catch(() => {});
            return false;
          }

          activeSessionIdRef.current = response.sessionId;
          applyStepResponse(response);
          const pendingEvents = pendingEventsRef.current.get(response.sessionId) ?? [];
          pendingEventsRef.current.clear();
          for (const event of pendingEvents) {
            applyTerminalEvent(event);
          }
          appendLog(
            formatText(text.logs.manualPlaybackStarted, {
              songName: request.songName,
            }),
          );
          return true;
        }
      } catch (error) {
        if (requestTokenRef.current !== token) {
          return false;
        }
        failSession(error, activeSessionIdRef.current);
        return false;
      }

      return false;
    },
    [
      appendLog,
      applyStepResponse,
      applyTerminalEvent,
      failSession,
      foregroundKeyHoldMs,
      getOrPreparePlaybackPlan,
      invalidatePlaybackPlan,
      outputMode,
      targetWindowCompatibilityProfile,
      targetWindowHwnd,
      targetWindowKeyHoldMs,
      text.logs.manualPlaybackStarted,
      updateProgress,
      updateState,
    ],
  );

  const handleStep = useCallback(
    (request: ManualStepRequest) => {
      const sessionId = activeSessionIdRef.current;
      if (stateRef.current === "active" && sessionId !== null) {
        return stepActiveSession(sessionId);
      }
      if (stateRef.current === "starting" || stateRef.current === "tail") {
        return Promise.resolve(false);
      }
      return startSession(request);
    },
    [startSession, stepActiveSession],
  );

  return {
    activeSessionId: activeSessionIdRef.current,
    handleStep,
    isEngaged: isManualPlaybackEngaged(state),
    isTargetWindowEngaged:
      isManualPlaybackEngaged(state) && manualOutputMode === "target-window",
    manualOutputMode,
    manualSongId,
    progress,
    resetForAutomaticStart: reset,
    resetForLifecycleChange: reset,
    showsProgress: shouldShowManualProgress({
      currentSongId,
      manualSongId,
      state,
    }),
    state,
    stop: () => reset({ shouldLog: true }),
  };
}
