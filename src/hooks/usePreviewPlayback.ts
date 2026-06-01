import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import { formatText } from "../lib/formatText";
import type { PlaybackState } from "../types/playback";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
  type NoteIntervalDelayMs,
  type PlaybackMode,
  type PlaybackSpeed,
} from "../types/playbackOptions";
import type { Song } from "../types/score";

type UsePreviewPlaybackOptions = {
  appendLog: (entry: string) => void;
  currentSelectedSong: Song | null;
  importedSongs: Song[];
  importedSongsRef: React.MutableRefObject<Song[]>;
  selectedSongIndex: number | null;
  setSelectedSongIndex: (songIndex: number | null) => void;
  text: UiText;
};

export function usePreviewPlayback({
  appendLog,
  currentSelectedSong,
  importedSongs,
  importedSongsRef,
  selectedSongIndex,
  setSelectedSongIndex,
  text,
}: UsePreviewPlaybackOptions) {
  const playbackControllerRef = useRef<PreviewPlaybackController | null>(null);
  const isShuffleEnabledRef = useRef(false);
  const noteIntervalDelayMsRef = useRef(defaultNoteIntervalDelayMs);
  const playbackModeRef = useRef<PlaybackMode>(defaultPlaybackMode);
  const playbackSpeedRef = useRef(defaultPlaybackSpeed);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackProgress, setPlaybackProgress] =
    useState<PreviewPlaybackProgress>({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>(defaultPlaybackMode);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [noteIntervalDelayMs, setNoteIntervalDelayMs] =
    useState<NoteIntervalDelayMs>(defaultNoteIntervalDelayMs);
  const [playbackSpeed, setPlaybackSpeed] =
    useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const previewDurationMs =
    currentSelectedSong === null
      ? 0
      : getAdjustedPreviewDurationMs(currentSelectedSong.songNotes, {
          noteIntervalDelayMs,
          playbackSpeed,
        });
  const bottomPlayerProgress =
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished"
      ? playbackProgress
      : {
          currentMs: 0,
          percent: 0,
          totalMs: previewDurationMs,
        };
  const canPlayPreview =
    currentSelectedSong !== null &&
    (playbackState === "idle" || playbackState === "finished");

  useEffect(() => {
    return () => {
      playbackControllerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    isShuffleEnabledRef.current = isShuffleEnabled;
  }, [isShuffleEnabled]);

  useEffect(() => {
    noteIntervalDelayMsRef.current = noteIntervalDelayMs;
  }, [noteIntervalDelayMs]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  function resetPlaybackProgress() {
    setPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  }

  function stopCurrentPreview(nextState: PlaybackState = "idle") {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    setActiveKeys([]);
    setPlaybackState(nextState);
    resetPlaybackProgress();
  }

  function startPreviewForSong(songIndex: number) {
    try {
      const song = importedSongs[songIndex];

      if (!song) {
        appendLog(text.logs.noSelectedScore);
        return;
      }

      const notes = song.songNotes;
      const currentTimingOptions = {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
      };

      setSelectedSongIndex(songIndex);

      if (notes.length === 0) {
        stopCurrentPreview("finished");
        appendLog(text.logs.previewFinished);
        return;
      }

      setPlaybackState("playing");
      resetPlaybackProgress();
      appendLog(
        formatText(text.logs.previewStartedWithOptions, {
          delayMs: currentTimingOptions.noteIntervalDelayMs,
          songName: song.name,
          speed: currentTimingOptions.playbackSpeed,
        }),
      );

      playbackControllerRef.current = schedulePreviewPlayback(
        notes,
        (noteGroup) => {
          const keys = noteGroup.map((note) => note.key);

          setActiveKeys(keys);
          appendLog(
            formatText(text.logs.playingPreviewKey, { key: keys.join(", ") }),
          );
        },
        () => {
          setActiveKeys([]);
          playbackControllerRef.current = null;

          const currentImportedSongs = importedSongsRef.current;
          const finishDecision = decidePlaybackFinish({
            currentSongIndex: songIndex,
            isShuffleEnabled: isShuffleEnabledRef.current,
            playbackMode: playbackModeRef.current,
            songCount: currentImportedSongs.length,
          });

          if (finishDecision.type === "repeat-current") {
            appendLog(
              formatText(text.logs.repeatOneTriggered, { songName: song.name }),
            );
            startPreviewForSong(songIndex);
            return;
          }

          if (finishDecision.type === "play-next") {
            const nextSong =
              currentImportedSongs[finishDecision.nextSongIndex] ?? song;

            appendLog(
              formatText(text.logs.repeatAllTriggered, {
                songName: nextSong.name,
              }),
            );
            startPreviewForSong(finishDecision.nextSongIndex);
            return;
          }

          setPlaybackState("finished");
          appendLog(text.logs.previewFinished);
        },
        {
          noteIntervalDelayMs: currentTimingOptions.noteIntervalDelayMs,
          onProgress: setPlaybackProgress,
          playbackSpeed: currentTimingOptions.playbackSpeed,
        },
      );
    } catch (error) {
      stopCurrentPreview();
      appendLog(
        formatText(text.logs.playbackError, {
          error: String(error instanceof Error ? error.message : error),
        }),
      );
    }
  }

  function handlePlayImportedSong(songIndex: number) {
    stopCurrentPreview();
    startPreviewForSong(songIndex);
  }

  function handlePlayPreview() {
    if (selectedSongIndex === null) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    stopCurrentPreview();
    startPreviewForSong(selectedSongIndex);
  }

  function handlePausePreview() {
    if (playbackState !== "playing") {
      return;
    }

    playbackControllerRef.current?.pause();
    setActiveKeys([]);
    setPlaybackState("paused");
    appendLog(text.logs.previewPaused);
  }

  function handleResumePreview() {
    if (playbackState !== "paused") {
      return;
    }

    playbackControllerRef.current?.resume();
    setPlaybackState("playing");
    appendLog(text.logs.previewResumed);
  }

  function handleStopPreview() {
    if (playbackState !== "playing" && playbackState !== "paused") {
      return;
    }

    stopCurrentPreview();
    appendLog(text.logs.previewStopped);
  }

  function handleShuffleToggle() {
    setIsShuffleEnabled((currentValue) => {
      const nextValue = !currentValue;

      isShuffleEnabledRef.current = nextValue;
      return nextValue;
    });
  }

  function handleRepeatModeCycle() {
    setPlaybackMode((currentMode) => {
      if (currentMode === "sequence") {
        playbackModeRef.current = "repeat-all";
        return "repeat-all";
      }

      if (currentMode === "repeat-all") {
        playbackModeRef.current = "repeat-one";
        return "repeat-one";
      }

      playbackModeRef.current = "sequence";
      return "sequence";
    });
  }

  function handleNoteIntervalDelayChange(
    nextNoteIntervalDelayMs: NoteIntervalDelayMs,
  ) {
    const nextOptions = {
      noteIntervalDelayMs: nextNoteIntervalDelayMs,
      playbackSpeed: playbackSpeedRef.current,
    };

    noteIntervalDelayMsRef.current = nextNoteIntervalDelayMs;
    setNoteIntervalDelayMs(nextNoteIntervalDelayMs);
    playbackControllerRef.current?.updateOptions(nextOptions);
  }

  function handlePlaybackSpeedChange(nextPlaybackSpeed: PlaybackSpeed) {
    const nextOptions = {
      noteIntervalDelayMs: noteIntervalDelayMsRef.current,
      playbackSpeed: nextPlaybackSpeed,
    };

    playbackSpeedRef.current = nextPlaybackSpeed;
    setPlaybackSpeed(nextPlaybackSpeed);
    playbackControllerRef.current?.updateOptions(nextOptions);
  }

  return {
    activeKeys,
    bottomPlayerProgress,
    canPlayPreview,
    handleNoteIntervalDelayChange,
    handlePausePreview,
    handlePlaybackSpeedChange,
    handlePlayImportedSong,
    handlePlayPreview,
    handleRepeatModeCycle,
    handleResumePreview,
    handleShuffleToggle,
    handleStopPreview,
    isShuffleEnabled,
    noteIntervalDelayMs,
    playbackMode,
    playbackProgress,
    playbackSpeed,
    playbackState,
    previewDurationMs,
    stopCurrentPreview,
  };
}
