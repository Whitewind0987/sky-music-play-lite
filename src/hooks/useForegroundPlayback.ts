import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import { mapScoreNoteToKeyboardKey } from "../lib/scoreKeyMapping";
import { sendForegroundKeyGroup } from "../lib/tauriApi";
import type { ForegroundPlaybackState } from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Note, Song } from "../types/score";

type UseForegroundPlaybackOptions = {
  appendLog: (message: string) => void;
  consumeNextQueueItem: (songCount: number) => PlaybackQueueItem | null;
  currentSong: Song | null;
  experimentalInputEnabled: boolean;
  importedSongs: Song[];
  importedSongsRef: React.MutableRefObject<Song[]>;
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onBeforeStart: () => void;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  selectedSongIndex: number | null;
  setSelectedSongIndex: (songIndex: number | null) => void;
  text: UiText;
};

const COUNTDOWN_START_SECONDS = 3;
const COUNTDOWN_TICK_MS = 1000;

export function useForegroundPlayback({
  appendLog,
  consumeNextQueueItem,
  currentSong,
  experimentalInputEnabled,
  importedSongs,
  importedSongsRef,
  isShuffleEnabled,
  keyMapping,
  noteIntervalDelayMs,
  onBeforeStart,
  playbackMode,
  playbackSpeed,
  selectedSongIndex,
  setSelectedSongIndex,
  text,
}: UseForegroundPlaybackOptions) {
  const controllerRef = useRef<PreviewPlaybackController | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const ignoreNextCurrentSongChangeRef = useRef(false);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const noteIntervalDelayMsRef = useRef(noteIntervalDelayMs);
  const playbackModeRef = useRef<PlaybackMode>(playbackMode);
  const playbackSpeedRef = useRef(playbackSpeed);
  const runIdRef = useRef(0);
  const [foregroundPlaybackState, setForegroundPlaybackState] =
    useState<ForegroundPlaybackState>("idle");
  const [foregroundCountdown, setForegroundCountdown] = useState<number | null>(
    null,
  );
  const [foregroundPlaybackProgress, setForegroundPlaybackProgress] =
    useState<PreviewPlaybackProgress>({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  const isForegroundPlaybackActive =
    foregroundPlaybackState === "countdown" ||
    foregroundPlaybackState === "playing" ||
    foregroundPlaybackState === "paused";
  const canStartForegroundPlayback =
    experimentalInputEnabled &&
    currentSong !== null &&
    currentSong.songNotes.length > 0 &&
    !isForegroundPlaybackActive;
  const canStopForegroundPlayback = isForegroundPlaybackActive;
  const bottomPlaybackState = mapForegroundStateToPlaybackState(
    foregroundPlaybackState,
  );

  useEffect(() => {
    return () => {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: false });
    };
  }, []);

  useEffect(() => {
    if (isForegroundPlaybackActive) {
      if (ignoreNextCurrentSongChangeRef.current) {
        ignoreNextCurrentSongChangeRef.current = false;
        return;
      }

      stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
    }
  }, [currentSong]);

  useEffect(() => {
    isShuffleEnabledRef.current = isShuffleEnabled;
  }, [isShuffleEnabled]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    noteIntervalDelayMsRef.current = noteIntervalDelayMs;
    controllerRef.current?.updateOptions({
      noteIntervalDelayMs,
      playbackSpeed: playbackSpeedRef.current,
    });
  }, [noteIntervalDelayMs]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    controllerRef.current?.updateOptions({
      noteIntervalDelayMs: noteIntervalDelayMsRef.current,
      playbackSpeed,
    });
  }, [playbackSpeed]);

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
    setForegroundPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });

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

  function handlePauseForegroundPlayback() {
    if (foregroundPlaybackState === "countdown") {
      stopForegroundPlayback({ nextState: "stopped", shouldLog: true });
      return;
    }

    if (foregroundPlaybackState !== "playing") {
      return;
    }

    controllerRef.current?.pause();
    setForegroundPlaybackState("paused");
    appendLog(text.logs.foregroundPlaybackPaused);
  }

  function handleResumeForegroundPlayback() {
    if (foregroundPlaybackState !== "paused") {
      return;
    }

    controllerRef.current?.resume();
    setForegroundPlaybackState("playing");
    appendLog(text.logs.foregroundPlaybackResumed);
  }

  function handleStartForegroundPlayback() {
    if (!canStartForegroundPlayback || selectedSongIndex === null) {
      return;
    }

    onBeforeStart();
    startForegroundPlaybackForSong(selectedSongIndex, { withCountdown: true });
  }

  function handlePlayForegroundSong(songIndex: number) {
    if (!experimentalInputEnabled) {
      return;
    }

    onBeforeStart();
    startForegroundPlaybackForSong(songIndex, { withCountdown: true });
  }

  function startForegroundPlaybackForSong(
    songIndex: number,
    { withCountdown }: { withCountdown: boolean },
  ) {
    const song = importedSongsRef.current[songIndex] ?? importedSongs[songIndex];

    if (!song) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    ignoreNextCurrentSongChangeRef.current = selectedSongIndex !== songIndex;
    setSelectedSongIndex(songIndex);

    if (song.songNotes.length === 0) {
      stopForegroundPlayback({ nextState: "finished", shouldLog: false });
      appendLog(text.logs.foregroundPlaybackFinished);
      return;
    }

    clearCountdownTimer();
    controllerRef.current?.stop();
    controllerRef.current = null;
    const runId = runIdRef.current + 1;

    runIdRef.current = runId;
    setForegroundPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: getAdjustedPreviewDurationMs(song.songNotes, {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
      }),
    });

    if (!withCountdown) {
      startForegroundPlayback(runId, songIndex, song);
      return;
    }

    setForegroundPlaybackState("countdown");
    setForegroundCountdown(COUNTDOWN_START_SECONDS);
    appendLog(text.logs.foregroundPlaybackFocusReminder);
    appendLog(text.logs.foregroundPlaybackCountdownStarted);
    scheduleCountdownTick(runId, COUNTDOWN_START_SECONDS, songIndex, song);
  }

  function scheduleCountdownTick(
    runId: number,
    currentCountdown: number,
    songIndex: number,
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
        startForegroundPlayback(runId, songIndex, song);
        return;
      }

      setForegroundCountdown(nextCountdown);
      scheduleCountdownTick(runId, nextCountdown, songIndex, song);
    }, COUNTDOWN_TICK_MS);
  }

  function startForegroundPlayback(runId: number, songIndex: number, song: Song) {
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

        handleForegroundPlaybackFinished(songIndex, song);
      },
      {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        onProgress: setForegroundPlaybackProgress,
        playbackSpeed: playbackSpeedRef.current,
      },
    );
  }

  function handleForegroundPlaybackFinished(songIndex: number, song: Song) {
    controllerRef.current = null;

    const currentImportedSongs = importedSongsRef.current;
    const queuedItem =
      playbackModeRef.current === "repeat-one"
        ? null
        : consumeNextQueueItem(currentImportedSongs.length);
    const finishDecision = decidePlaybackFinish({
      currentSongIndex: songIndex,
      isShuffleEnabled: isShuffleEnabledRef.current,
      playbackMode: playbackModeRef.current,
      queuedSongIndex: queuedItem?.songIndex ?? null,
      songCount: currentImportedSongs.length,
    });

    if (finishDecision.type === "repeat-current") {
      appendLog(
        formatText(text.logs.repeatOneTriggered, { songName: song.name }),
      );
      startForegroundPlaybackForSong(songIndex, { withCountdown: false });
      return;
    }

    if (finishDecision.type === "play-next") {
      const nextSong = currentImportedSongs[finishDecision.nextSongIndex] ?? song;
      const logTemplate =
        queuedItem === null
          ? text.logs.repeatAllTriggered
          : text.logs.queueNextTriggered;

      appendLog(
        formatText(logTemplate, {
          songName: nextSong.name,
        }),
      );
      startForegroundPlaybackForSong(finishDecision.nextSongIndex, {
        withCountdown: false,
      });
      return;
    }

    setForegroundPlaybackState("finished");
    appendLog(text.logs.foregroundPlaybackFinished);
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
    bottomPlaybackState,
    foregroundCountdown,
    foregroundPlaybackProgress,
    foregroundPlaybackState,
    handlePauseForegroundPlayback,
    handlePlayForegroundSong,
    handleResumeForegroundPlayback,
    handleStartForegroundPlayback,
    handleStopForegroundPlayback,
    isForegroundPlaybackActive,
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

  if (state === "finished") {
    return "finished";
  }

  return "idle";
}
