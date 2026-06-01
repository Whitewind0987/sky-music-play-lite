import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  schedulePreviewPlayback,
  type PreviewPlaybackController,
} from "../lib/playbackScheduler";
import { mapScoreNoteToKeyboardKey } from "../lib/scoreKeyMapping";
import { sendForegroundKeyGroup } from "../lib/tauriApi";
import type {
  ForegroundPlaybackState,
} from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type {
  NoteIntervalDelayMs,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Note, Song } from "../types/score";

type UseForegroundPlaybackOptions = {
  appendLog: (message: string) => void;
  currentSong: Song | null;
  experimentalInputEnabled: boolean;
  keyMapping: KeyMapping;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onBeforeStart: () => void;
  playbackSpeed: PlaybackSpeed;
  text: UiText;
};

const COUNTDOWN_START_SECONDS = 3;
const COUNTDOWN_TICK_MS = 1000;

export function useForegroundPlayback({
  appendLog,
  currentSong,
  experimentalInputEnabled,
  keyMapping,
  noteIntervalDelayMs,
  onBeforeStart,
  playbackSpeed,
  text,
}: UseForegroundPlaybackOptions) {
  const controllerRef = useRef<PreviewPlaybackController | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const [foregroundPlaybackState, setForegroundPlaybackState] =
    useState<ForegroundPlaybackState>("idle");
  const [foregroundCountdown, setForegroundCountdown] = useState<number | null>(
    null,
  );
  const isForegroundPlaybackActive =
    foregroundPlaybackState === "countdown" ||
    foregroundPlaybackState === "playing";
  const canStartForegroundPlayback =
    experimentalInputEnabled &&
    currentSong !== null &&
    currentSong.songNotes.length > 0 &&
    !isForegroundPlaybackActive;
  const canStopForegroundPlayback = isForegroundPlaybackActive;

  useEffect(() => {
    return () => {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: false });
    };
  }, []);

  useEffect(() => {
    if (isForegroundPlaybackActive) {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
    }
  }, [currentSong]);

  function clearCountdownTimer() {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }

  function stopForegroundPlayback({
    nextState,
    shouldLog,
  }: {
    nextState: ForegroundPlaybackState;
    shouldLog: boolean;
  }) {
    const wasCountingDown = foregroundPlaybackState === "countdown";

    runIdRef.current += 1;
    clearCountdownTimer();
    controllerRef.current?.stop();
    controllerRef.current = null;
    setForegroundCountdown(null);
    setForegroundPlaybackState(nextState);

    if (shouldLog) {
      appendLog(
        wasCountingDown
          ? text.logs.foregroundPlaybackCountdownCancelled
          : text.logs.foregroundPlaybackStopped,
      );
    }
  }

  function handleStopForegroundPlayback() {
    if (!canStopForegroundPlayback) {
      return;
    }

    stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
  }

  function handleStartForegroundPlayback() {
    if (!canStartForegroundPlayback || currentSong === null) {
      return;
    }

    onBeforeStart();

    const runId = runIdRef.current + 1;

    runIdRef.current = runId;
    setForegroundPlaybackState("countdown");
    setForegroundCountdown(COUNTDOWN_START_SECONDS);
    appendLog(text.logs.foregroundPlaybackFocusReminder);
    appendLog(text.logs.foregroundPlaybackCountdownStarted);
    scheduleCountdownTick(runId, COUNTDOWN_START_SECONDS, currentSong);
  }

  function scheduleCountdownTick(
    runId: number,
    currentCountdown: number,
    song: Song,
  ) {
    clearCountdownTimer();

    countdownTimerRef.current = window.setTimeout(() => {
      if (runIdRef.current !== runId) {
        return;
      }

      const nextCountdown = currentCountdown - 1;

      if (nextCountdown <= 0) {
        setForegroundCountdown(null);
        startForegroundPlayback(runId, song);
        return;
      }

      setForegroundCountdown(nextCountdown);
      scheduleCountdownTick(runId, nextCountdown, song);
    }, COUNTDOWN_TICK_MS);
  }

  function startForegroundPlayback(runId: number, song: Song) {
    setForegroundPlaybackState("playing");
    appendLog(
      formatText(text.logs.foregroundPlaybackStarted, {
        songName: song.name,
      }),
    );

    controllerRef.current = schedulePreviewPlayback(
      song.songNotes,
      (noteGroup) => {
        void sendForegroundNoteGroup({ noteGroup, runId });
      },
      () => {
        if (runIdRef.current !== runId) {
          return;
        }

        controllerRef.current = null;
        setForegroundPlaybackState("finished");
        appendLog(text.logs.foregroundPlaybackFinished);
      },
      {
        noteIntervalDelayMs,
        playbackSpeed,
      },
    );
  }

  async function sendForegroundNoteGroup({
    noteGroup,
    runId,
  }: {
    noteGroup: Note[];
    runId: number;
  }) {
    try {
      const mappedKeys = noteGroup.map((note) =>
        mapScoreNoteToKeyboardKey(note, keyMapping),
      );

      if (runIdRef.current !== runId) {
        return;
      }

      await sendForegroundKeyGroup(mappedKeys);
    } catch (error) {
      if (runIdRef.current !== runId) {
        return;
      }

      const errorMessage = String(error);

      setForegroundPlaybackState("error");
      appendLog(
        formatText(text.logs.foregroundPlaybackKeySendFailed, {
          error: errorMessage,
        }),
      );
      controllerRef.current?.stop();
      controllerRef.current = null;
    }
  }

  return {
    canStartForegroundPlayback,
    canStopForegroundPlayback,
    foregroundCountdown,
    foregroundPlaybackState,
    handleStartForegroundPlayback,
    handleStopForegroundPlayback,
    isForegroundPlaybackActive,
  };
}
