import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import {
  bufferBackgroundPlaybackEvent,
  getBackgroundPlaybackEventRoute,
  takePendingBackgroundPlaybackEvents,
} from "../lib/backgroundPlaybackEvents";
import { formatText } from "../lib/formatText";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import { isPreparedPlaybackPlanUnavailableError } from "../lib/preparedPlaybackPlanErrors";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import {
  listenForegroundPlaybackEvents,
  pauseForegroundPlayback,
  resumeForegroundPlayback,
  seekForegroundPlayback,
  startPreparedForegroundPlayback,
  stopForegroundPlayback as stopForegroundPlaybackSession,
  updateForegroundPlaybackOptions,
  type BackgroundPlaybackEventPayload,
} from "../lib/tauriApi";
import type { ForegroundPlaybackState } from "../types/experimentalInput";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Song } from "../types/score";
import type {
  PreparedPlaybackPlan,
} from "./usePlaybackPlanPreparation";

type UseForegroundPlaybackOptions = {
  appendLog: (message: string) => void;
  consumeQueuedItemAfterCurrent: (queueItemId: string, songCount: number) => PlaybackQueueItem | null;
  currentSong: Song | null;
  experimentalInputEnabled: boolean;
  getOrPreparePlaybackPlan: (options: {
    priority: "direct" | "warm";
    resolvedSong?: Song | null;
    songIndex: number;
  }) => Promise<PreparedPlaybackPlan>;
  getPlaybackOrderNextSongIndex: (options: {
    currentSongIndex: number;
    isShuffleEnabled: boolean;
    playbackMode: PlaybackMode;
  }) => number | null;
  importedSongsRef: React.MutableRefObject<Song[]>;
  invalidatePlaybackPlan: (cacheKey: PreparedPlaybackPlan["cacheKey"]) => void;
  isShuffleEnabled: boolean;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onBeforeStart: () => void;
  peekNextQueueItemAfterCurrent: (songCount: number) => PlaybackQueueItem | null;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  resolveSongForPlayback: (songIndex: number) => Promise<Song | null>;
  selectedSongIndex: number | null;
  setSelectedSongIndex: (songIndex: number | null) => void;
  startQueuePlayback: (songIndex: number) => void;
  text: UiText;
};

type ForegroundPlaybackContext = {
  sessionId: number;
  song: Song;
  songIndex: number;
};

const COUNTDOWN_START_SECONDS = 3;
const FOREGROUND_KEY_HOLD_MS = 40;

export function useForegroundPlayback({
  appendLog,
  consumeQueuedItemAfterCurrent,
  currentSong,
  experimentalInputEnabled,
  getOrPreparePlaybackPlan,
  getPlaybackOrderNextSongIndex,
  importedSongsRef,
  invalidatePlaybackPlan,
  isShuffleEnabled,
  noteIntervalDelayMs,
  onBeforeStart,
  peekNextQueueItemAfterCurrent,
  playbackMode,
  playbackSpeed,
  resolveSongForPlayback,
  selectedSongIndex,
  setSelectedSongIndex,
  startQueuePlayback,
  text,
}: UseForegroundPlaybackOptions) {
  const activeForegroundSessionIdRef = useRef<number | null>(null);
  const completedForegroundSessionIdsRef = useRef(new Set<number>());
  const countdownResolveRef = useRef<((completed: boolean) => void) | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const foregroundPlaybackContextRef = useRef<ForegroundPlaybackContext | null>(null);
  const foregroundRequestTokenRef = useRef(0);
  const foregroundPlaybackEventHandlerRef = useRef<
    (payload: BackgroundPlaybackEventPayload) => void
  >(() => {});
  const isForegroundStartPendingRef = useRef(false);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const noteIntervalDelayMsRef = useRef(noteIntervalDelayMs);
  const pendingForegroundEventsRef = useRef<
    Map<number, BackgroundPlaybackEventPayload[]>
  >(new Map());
  const playbackModeRef = useRef<PlaybackMode>(playbackMode);
  const playbackSpeedRef = useRef(playbackSpeed);
  const [foregroundPlaybackState, setForegroundPlaybackState] =
    useState<ForegroundPlaybackState>("idle");
  const [foregroundCountdown, setForegroundCountdown] = useState<number | null>(
    null,
  );
  const [foregroundPlaybackProgress, setForegroundPlaybackProgress] =
    useState<PreviewPlaybackProgress>({ currentMs: 0, percent: 0, totalMs: 0 });
  const [isForegroundStartPending, setIsForegroundStartPending] = useState(false);

  const isForegroundPlaybackActive =
    foregroundPlaybackState === "countdown" ||
    foregroundPlaybackState === "playing" ||
    foregroundPlaybackState === "paused";
  const canStartForegroundPlayback =
    experimentalInputEnabled && currentSong !== null && !isForegroundPlaybackActive && !isForegroundStartPending;
  const canStopForegroundPlayback = isForegroundPlaybackActive || isForegroundStartPending;
  const bottomPlaybackState = mapForegroundStateToPlaybackState(
    foregroundPlaybackState,
  );

  foregroundPlaybackEventHandlerRef.current = handleForegroundPlaybackEvent;

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listenForegroundPlaybackEvents((event) => {
      foregroundPlaybackEventHandlerRef.current(event.payload);
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
      stopForegroundPlayback({ nextState: "stopped", shouldLog: false });
    };
  }, []);

  useEffect(() => {
    isShuffleEnabledRef.current = isShuffleEnabled;
  }, [isShuffleEnabled]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    noteIntervalDelayMsRef.current = noteIntervalDelayMs;
    updateActiveForegroundPlaybackOptions();
  }, [noteIntervalDelayMs]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    updateActiveForegroundPlaybackOptions();
  }, [playbackSpeed]);

  useEffect(() => {
    if (!experimentalInputEnabled) {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: false });
    }
  }, [experimentalInputEnabled]);

  function clearCountdownTimer() {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    const resolve = countdownResolveRef.current;
    countdownResolveRef.current = null;
    resolve?.(false);
  }

  function setForegroundStartPending(pending: boolean) {
    isForegroundStartPendingRef.current = pending;
    setIsForegroundStartPending(pending);
  }

  function startCountdown(requestToken: number) {
    clearCountdownTimer();
    setForegroundPlaybackState("countdown");
    setForegroundCountdown(COUNTDOWN_START_SECONDS);
    appendLog(text.logs.foregroundPlaybackFocusReminder);
    appendLog(text.logs.foregroundPlaybackCountdownStarted);

    return new Promise<boolean>((resolve) => {
      countdownResolveRef.current = resolve;

      function tick(countdown: number) {
        countdownTimerRef.current = window.setTimeout(() => {
          if (foregroundRequestTokenRef.current !== requestToken) {
            resolve(false);
            return;
          }

          const nextCountdown = countdown - 1;

          if (nextCountdown <= 0) {
            countdownTimerRef.current = null;
            countdownResolveRef.current = null;
            setForegroundCountdown(null);
            resolve(true);
            return;
          }

          setForegroundCountdown(nextCountdown);
          tick(nextCountdown);
        }, 1000);
      }

      tick(COUNTDOWN_START_SECONDS);
    });
  }

  function resetForegroundPlayback(nextState: ForegroundPlaybackState) {
    foregroundPlaybackContextRef.current = null;
    activeForegroundSessionIdRef.current = null;
    pendingForegroundEventsRef.current.clear();
    setForegroundCountdown(null);
    setForegroundPlaybackState(nextState);
    setForegroundPlaybackProgress({ currentMs: 0, percent: 0, totalMs: 0 });
  }

  function stopForegroundPlayback({
    nextState,
    shouldLog,
  }: {
    nextState: ForegroundPlaybackState;
    shouldLog: boolean;
  }) {
    const wasCountingDown = foregroundPlaybackState === "countdown";
    const sessionId = activeForegroundSessionIdRef.current;

    foregroundRequestTokenRef.current += 1;
    setForegroundStartPending(false);
    clearCountdownTimer();
    resetForegroundPlayback(nextState);

    if (sessionId !== null) {
      void stopForegroundPlaybackSession(sessionId).catch(() => {});
    }

    if (shouldLog) {
      appendLog(
        wasCountingDown
          ? text.logs.foregroundPlaybackCountdownCancelled
          : text.logs.foregroundPlaybackStopped,
      );
    }
  }

  function handleStopForegroundPlayback() {
    if (!canStopForegroundPlayback && activeForegroundSessionIdRef.current === null) {
      return;
    }

    stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
  }

  function handlePauseForegroundPlayback() {
    if (foregroundPlaybackState === "countdown") {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
      return;
    }

    const sessionId = activeForegroundSessionIdRef.current;
    if (foregroundPlaybackState !== "playing" || sessionId === null) {
      return;
    }

    void pauseForegroundPlayback(sessionId).catch(() => {});
  }

  function handleResumeForegroundPlayback() {
    const sessionId = activeForegroundSessionIdRef.current;
    if (foregroundPlaybackState !== "paused" || sessionId === null) {
      return;
    }

    void resumeForegroundPlayback(sessionId).catch(() => {});
  }

  function handleSeekForegroundPlayback(timeMs: number) {
    if (foregroundPlaybackState === "finished") {
      if (selectedSongIndex !== null) {
        onBeforeStart();
        void startForegroundPlaybackForSong(selectedSongIndex, {
          initialSeekMs: timeMs,
          withCountdown: false,
        });
      }
      return;
    }

    const sessionId = activeForegroundSessionIdRef.current;
    if (
      sessionId === null ||
      (foregroundPlaybackState !== "playing" && foregroundPlaybackState !== "paused")
    ) {
      return;
    }

    void seekForegroundPlayback(sessionId, timeMs).catch(() => {});
  }

  function handleStartForegroundPlayback() {
    if (!canStartForegroundPlayback || selectedSongIndex === null) {
      return;
    }

    onBeforeStart();
    void startForegroundPlaybackForSong(selectedSongIndex, { withCountdown: true });
  }

  function handlePlayForegroundSong(songIndex: number): Promise<boolean> {
    if (!experimentalInputEnabled) {
      return Promise.resolve(false);
    }

    onBeforeStart();
    return startForegroundPlaybackForSong(songIndex, { withCountdown: true });
  }

  async function startForegroundPlaybackForSong(
    songIndex: number,
    {
      initialSeekMs,
      withCountdown,
    }: { initialSeekMs?: number; withCountdown: boolean },
  ): Promise<boolean> {
    const requestToken = foregroundRequestTokenRef.current + 1;
    foregroundRequestTokenRef.current = requestToken;
    setForegroundStartPending(true);
    clearCountdownTimer();

    const activeSessionId = activeForegroundSessionIdRef.current;
    if (activeSessionId !== null) {
      activeForegroundSessionIdRef.current = null;
      foregroundPlaybackContextRef.current = null;
      void stopForegroundPlaybackSession(activeSessionId).catch(() => {});
    }

    const song = await resolveSongForPlayback(songIndex);
    if (foregroundRequestTokenRef.current !== requestToken) {
      return false;
    }

    if (!song) {
      setForegroundStartPending(false);
      appendLog(text.logs.noSelectedScore);
      return false;
    }

    setSelectedSongIndex(songIndex);
    if (song.songNotes.length === 0) {
      setForegroundStartPending(false);
      resetForegroundPlayback("finished");
      appendLog(text.logs.foregroundPlaybackFinished);
      return false;
    }

    const preparation = getOrPreparePlaybackPlan({
      priority: "direct",
      resolvedSong: song,
      songIndex,
    });
    const countdown = withCountdown
      ? startCountdown(requestToken)
      : Promise.resolve(true);

    let preparedPlan: PreparedPlaybackPlan;
    let countdownCompleted: boolean;
    try {
      [preparedPlan, countdownCompleted] = await Promise.all([preparation, countdown]);
    } catch (error) {
      if (foregroundRequestTokenRef.current === requestToken) {
        setForegroundStartPending(false);
        clearCountdownTimer();
        setForegroundCountdown(null);
        setForegroundPlaybackState("error");
        appendLog(
          formatText(text.logs.foregroundPlaybackKeySendFailed, {
            error: String(error),
          }),
        );
      }
      return false;
    }

    if (!countdownCompleted || foregroundRequestTokenRef.current !== requestToken) {
      return false;
    }

    return startPreparedForegroundPlaybackForSong({
      initialSeekMs,
      preparedPlan,
      requestToken,
      retryCount: 0,
      songIndex,
    });
  }

  async function startPreparedForegroundPlaybackForSong({
    initialSeekMs,
    preparedPlan,
    requestToken,
    retryCount,
    songIndex,
  }: {
    initialSeekMs?: number;
    preparedPlan: PreparedPlaybackPlan;
    requestToken: number;
    retryCount: number;
    songIndex: number;
  }): Promise<boolean> {
    if (foregroundRequestTokenRef.current !== requestToken) {
      return false;
    }
    try {
      const response = await startPreparedForegroundPlayback({
        initialProgressMs: initialSeekMs,
        keyHoldMs: FOREGROUND_KEY_HOLD_MS,
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
        preparedPlanId: preparedPlan.preparedPlanId,
      });

      if (foregroundRequestTokenRef.current !== requestToken) {
        void stopForegroundPlaybackSession(response.sessionId).catch(() => {});
        return false;
      }

      activeForegroundSessionIdRef.current = response.sessionId;
      foregroundPlaybackContextRef.current = {
        sessionId: response.sessionId,
        song: preparedPlan.song,
        songIndex,
      };
      setForegroundStartPending(false);
      setForegroundPlaybackState("playing");
      setForegroundPlaybackProgress({
        currentMs: Math.min(initialSeekMs ?? 0, response.totalMs),
        percent:
          response.totalMs > 0
            ? (Math.min(initialSeekMs ?? 0, response.totalMs) / response.totalMs) * 100
            : 0,
        totalMs: response.totalMs,
      });
      appendLog(
        formatText(text.logs.foregroundPlaybackStarted, {
          songName: preparedPlan.song.name,
        }),
      );
      flushPendingForegroundPlaybackEvents(response.sessionId);
      warmLikelyForegroundSong(songIndex);
      return true;
    } catch (error) {
      if (foregroundRequestTokenRef.current !== requestToken) {
        return false;
      }

      if (retryCount === 0 && isPreparedPlaybackPlanUnavailableError(error)) {
        invalidatePlaybackPlan(preparedPlan.cacheKey);
        try {
          const replacement = await getOrPreparePlaybackPlan({
            priority: "direct",
            resolvedSong: preparedPlan.song,
            songIndex,
          });
          if (foregroundRequestTokenRef.current !== requestToken) {
            return false;
          }
          return startPreparedForegroundPlaybackForSong({
            initialSeekMs,
            preparedPlan: replacement,
            requestToken,
            retryCount: 1,
            songIndex,
          });
        } catch (retryError) {
          error = retryError;
        }
      }

      setForegroundStartPending(false);
      resetForegroundPlayback("error");
      appendLog(
        formatText(text.logs.foregroundPlaybackKeySendFailed, {
          error: String(error),
        }),
      );
      return false;
    }
  }

  function handleForegroundPlaybackEvent(payload: BackgroundPlaybackEventPayload) {
    const route = getBackgroundPlaybackEventRoute({
      currentSessionId: activeForegroundSessionIdRef.current ?? -1,
      eventSessionId: payload.sessionId,
      isStartPending: isForegroundStartPendingRef.current,
    });

    if (route === "buffer") {
      pendingForegroundEventsRef.current = bufferBackgroundPlaybackEvent(
        pendingForegroundEventsRef.current,
        payload,
      );
      return;
    }

    if (route === "apply") {
      applyForegroundPlaybackEvent(payload);
    }
  }

  function flushPendingForegroundPlaybackEvents(sessionId: number) {
    const pending = takePendingBackgroundPlaybackEvents(
      pendingForegroundEventsRef.current,
      sessionId,
    );
    pendingForegroundEventsRef.current.clear();

    for (const event of pending) {
      if (event.sessionId === activeForegroundSessionIdRef.current) {
        applyForegroundPlaybackEvent(event);
      }
    }
  }

  function applyForegroundPlaybackEvent(payload: BackgroundPlaybackEventPayload) {
    if (payload.sessionId !== activeForegroundSessionIdRef.current) {
      return;
    }

    if (payload.type === "progress" && payload.progress) {
      setForegroundPlaybackProgress(payload.progress);
      return;
    }

    if (payload.type === "state" && (payload.state === "playing" || payload.state === "paused")) {
      setForegroundPlaybackState(payload.state);
      return;
    }

    if (payload.type === "error") {
      resetForegroundPlayback("error");
      appendLog(
        formatText(text.logs.foregroundPlaybackKeySendFailed, {
          error: payload.error ?? text.logs.foregroundPlaybackKeySendFailed,
        }),
      );
      return;
    }

    if (payload.type === "finished") {
      if (completedForegroundSessionIdsRef.current.has(payload.sessionId)) {
        return;
      }
      completedForegroundSessionIdsRef.current.add(payload.sessionId);
      const context = foregroundPlaybackContextRef.current;
      if (context?.sessionId === payload.sessionId) {
        resetForegroundPlayback("finished");
        handleForegroundPlaybackFinished(context.songIndex, context.song);
      }
    }
  }

  function handleForegroundPlaybackFinished(songIndex: number, song: Song) {
    const currentImportedSongs = importedSongsRef.current;
    const queuedItem =
      playbackModeRef.current === "repeat-one"
        ? null
        : peekNextQueueItemAfterCurrent(currentImportedSongs.length);
    const playbackOrderNextSongIndex =
      queuedItem === null && playbackModeRef.current === "repeat-all"
        ? getPlaybackOrderNextSongIndex({
            currentSongIndex: songIndex,
            isShuffleEnabled: isShuffleEnabledRef.current,
            playbackMode: playbackModeRef.current,
          })
        : null;
    const finishDecision = decidePlaybackFinish({
      allowLibraryFallback: false,
      currentSongIndex: songIndex,
      isShuffleEnabled: isShuffleEnabledRef.current,
      playbackMode: playbackModeRef.current,
      queuedSongIndex: queuedItem?.songIndex ?? playbackOrderNextSongIndex ?? null,
      songCount: currentImportedSongs.length,
    });

    if (finishDecision.type === "repeat-current") {
      appendLog(formatText(text.logs.repeatOneTriggered, { songName: song.name }));
      void startForegroundPlaybackForSong(songIndex, { withCountdown: false });
      return;
    }

    if (finishDecision.type === "play-next") {
      const nextSong = currentImportedSongs[finishDecision.nextSongIndex] ?? song;
      appendLog(
        formatText(
          queuedItem === null ? text.logs.repeatAllTriggered : text.logs.queueNextTriggered,
          { songName: nextSong.name },
        ),
      );
      void startForegroundPlaybackForSong(finishDecision.nextSongIndex, {
        withCountdown: false,
      }).then((started) => {
        if (!started) {
          setForegroundPlaybackState("finished");
          appendLog(text.logs.foregroundPlaybackFinished);
          return;
        }
        if (queuedItem) {
          consumeQueuedItemAfterCurrent(queuedItem.id, currentImportedSongs.length);
        } else {
          startQueuePlayback(finishDecision.nextSongIndex);
        }
      });
      return;
    }

    setForegroundPlaybackState("finished");
    appendLog(text.logs.foregroundPlaybackFinished);
  }

  function warmLikelyForegroundSong(currentSongIndex: number) {
    const queuedItem = peekNextQueueItemAfterCurrent(importedSongsRef.current.length);
    const nextSongIndex = queuedItem?.songIndex ?? getPlaybackOrderNextSongIndex({
        currentSongIndex,
        isShuffleEnabled: isShuffleEnabledRef.current,
        playbackMode: playbackModeRef.current,
      });

    if (nextSongIndex !== null) {
      void getOrPreparePlaybackPlan({
        priority: "warm",
        songIndex: nextSongIndex,
      }).catch(() => {});
    }
  }

  function updateActiveForegroundPlaybackOptions() {
    const sessionId = activeForegroundSessionIdRef.current;
    if (sessionId === null) {
      return;
    }

    void updateForegroundPlaybackOptions({
      noteIntervalDelayMs: noteIntervalDelayMsRef.current,
      playbackSpeed: playbackSpeedRef.current,
      sessionId,
    }).catch(() => {});
  }

  return {
    canStartForegroundPlayback,
    canStopForegroundPlayback,
    bottomPlaybackState,
    foregroundCountdown,
    foregroundPlaybackProgress,
    foregroundPlaybackState,
    handlePauseForegroundPlayback,
    handlePlayForegroundSong,
    handleResumeForegroundPlayback,
    handleSeekForegroundPlayback,
    handleStartForegroundPlayback,
    handleStopForegroundPlayback,
    isForegroundPlaybackActive,
    isForegroundStartPending,
  };
}

function mapForegroundStateToPlaybackState(
  state: ForegroundPlaybackState,
): PlaybackState {
  if (state === "countdown" || state === "playing") {
    return "playing";
  }

  if (state === "paused") {
    return "paused";
  }

  return state === "finished" ? "finished" : "idle";
}
