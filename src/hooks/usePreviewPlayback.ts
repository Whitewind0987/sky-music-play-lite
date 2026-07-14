import { useEffect, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import { resolveActivePlaybackSongIndex } from "../lib/activePlaybackSong";
import {
  getAdjustedPreviewDurationFromMetadata,
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import { formatText } from "../lib/formatText";
import { getLibrarySongName } from "../lib/libraryCollections";
import {
  applyNoteGroupToPreviewActiveKeys,
  getNextPreviewExpiryMs,
  prunePreviewActiveKeys,
  type PreviewActiveKeyEntry,
} from "../lib/previewActiveKeys";
import type { LibrarySong, LibrarySongId } from "../types/library";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
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
  consumeNextQueueItemAfterCurrent: (
    songCount: number,
  ) => PlaybackQueueItem | null;
  currentSelectedSong: LibrarySong | null;
  getPlaybackOrderNextSongIndex: (options: {
    currentSongIndex: number;
    isShuffleEnabled: boolean;
    playbackMode: PlaybackMode;
  }) => number | null;
  librarySongsRef: React.MutableRefObject<LibrarySong[]>;
  resolveSongForPlayback: (songIndex: number) => Promise<Song | null>;
  selectedSongIndex: number | null;
  setSelectedSongIndex: (songIndex: number | null) => void;
  startQueuePlayback: (songIndex: number) => void;
  text: UiText;
};

export function usePreviewPlayback({
  appendLog,
  consumeNextQueueItemAfterCurrent,
  currentSelectedSong,
  getPlaybackOrderNextSongIndex,
  librarySongsRef,
  resolveSongForPlayback,
  selectedSongIndex,
  setSelectedSongIndex,
  startQueuePlayback,
  text,
}: UsePreviewPlaybackOptions) {
  const playbackControllerRef = useRef<PreviewPlaybackController | null>(null);
  const activeKeyEntriesRef = useRef<PreviewActiveKeyEntry[]>([]);
  const activeKeyPruneTimerRef = useRef<number | null>(null);
  const activePreviewSongIdRef = useRef<LibrarySongId | null>(null);
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
      : currentSelectedSong.source === "local-import"
        ? getAdjustedPreviewDurationFromMetadata(currentSelectedSong.metadata, {
            noteIntervalDelayMs,
            playbackSpeed,
          })
        : !currentSelectedSong.isBuiltInLoaded &&
            currentSelectedSong.builtInDurationMs !== undefined
          ? currentSelectedSong.builtInDurationMs
          : getAdjustedPreviewDurationMs(currentSelectedSong.song.songNotes, {
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

      if (activeKeyPruneTimerRef.current !== null) {
        window.clearTimeout(activeKeyPruneTimerRef.current);
        activeKeyPruneTimerRef.current = null;
      }
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

  function clearActiveKeyPruneTimer() {
    if (activeKeyPruneTimerRef.current !== null) {
      window.clearTimeout(activeKeyPruneTimerRef.current);
      activeKeyPruneTimerRef.current = null;
    }
  }

  function scheduleActiveKeyPrune() {
    clearActiveKeyPruneTimer();
    const nextExpiryMs = getNextPreviewExpiryMs(activeKeyEntriesRef.current);

    if (nextExpiryMs === null) {
      return;
    }

    const delayMs = Math.max(0, nextExpiryMs - performance.now());
    activeKeyPruneTimerRef.current = window.setTimeout(() => {
      activeKeyPruneTimerRef.current = null;
      activeKeyEntriesRef.current = prunePreviewActiveKeys(
        activeKeyEntriesRef.current,
        performance.now(),
      );
      setActiveKeys(activeKeyEntriesRef.current.map((entry) => entry.key));
      scheduleActiveKeyPrune();
    }, delayMs);
  }

  function resetActiveKeys() {
    clearActiveKeyPruneTimer();
    activeKeyEntriesRef.current = [];
    setActiveKeys([]);
  }

  function stopCurrentPreview(nextState: PlaybackState = "idle") {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    activePreviewSongIdRef.current = null;
    resetActiveKeys();
    setPlaybackState(nextState);
    resetPlaybackProgress();
  }

  async function startPreviewForSong(
    songIndex: number,
    options: { initialSeekMs?: number } = {},
  ) {
    try {
      const previewSongId = librarySongsRef.current[songIndex]?.id ?? null;
      const song = await resolveSongForPlayback(songIndex);

      if (!song) {
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
      activePreviewSongIdRef.current = previewSongId;
      setPlaybackProgress({
        currentMs: options.initialSeekMs ?? 0,
        percent: 0,
        totalMs: getAdjustedPreviewDurationMs(notes, currentTimingOptions),
      });
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
          activeKeyEntriesRef.current = applyNoteGroupToPreviewActiveKeys(
            activeKeyEntriesRef.current,
            noteGroup,
            performance.now(),
            playbackSpeedRef.current,
          );
          setActiveKeys(activeKeyEntriesRef.current.map((entry) => entry.key));
          scheduleActiveKeyPrune();
          appendLog(
            formatText(text.logs.playingPreviewKey, {
              key: noteGroup.map((note) => note.key).join(", "),
            }),
          );
        },
        () => {
          const completedSongId = activePreviewSongIdRef.current;
          resetActiveKeys();
          playbackControllerRef.current = null;
          activePreviewSongIdRef.current = null;

          const currentLibrarySongs = librarySongsRef.current;
          const currentSongIndex = resolveActivePlaybackSongIndex({
            librarySongs: currentLibrarySongs,
            songId: completedSongId,
          });

          if (currentSongIndex === null) {
            setPlaybackState("finished");
            appendLog(text.logs.previewFinished);
            return;
          }

          const queuedItem =
            playbackModeRef.current === "repeat-one"
              ? null
              : consumeNextQueueItemAfterCurrent(currentLibrarySongs.length);
          const playbackOrderNextSongIndex =
            queuedItem === null && playbackModeRef.current === "repeat-all"
              ? getPlaybackOrderNextSongIndex({
                  currentSongIndex,
                  isShuffleEnabled: isShuffleEnabledRef.current,
                  playbackMode: playbackModeRef.current,
                })
              : null;
          const finishDecision = decidePlaybackFinish({
            allowLibraryFallback: false,
            currentSongIndex,
            isShuffleEnabled: isShuffleEnabledRef.current,
            playbackMode: playbackModeRef.current,
            queuedSongIndex:
              queuedItem?.songIndex ?? playbackOrderNextSongIndex ?? null,
            songCount: currentLibrarySongs.length,
          });

          if (finishDecision.type === "repeat-current") {
            appendLog(
              formatText(text.logs.repeatOneTriggered, { songName: song.name }),
            );
            void startPreviewForSong(currentSongIndex);
            return;
          }

          if (finishDecision.type === "play-next") {
            const nextSong =
              currentLibrarySongs[finishDecision.nextSongIndex] ?? null;
            const logTemplate =
              queuedItem === null
                ? text.logs.repeatAllTriggered
                : text.logs.queueNextTriggered;

            appendLog(
              formatText(logTemplate, {
                songName: nextSong ? getLibrarySongName(nextSong) : song.name,
              }),
            );
            if (queuedItem === null) {
              startQueuePlayback(finishDecision.nextSongIndex);
            }
            void startPreviewForSong(finishDecision.nextSongIndex);
            return;
          }

          setPlaybackState("finished");
          appendLog(text.logs.previewFinished);
        },
        {
          initialProgressMs: options.initialSeekMs,
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
    void startPreviewForSong(songIndex);
  }

  function handlePlayPreview() {
    if (selectedSongIndex === null) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    stopCurrentPreview();
    void startPreviewForSong(selectedSongIndex);
  }

  function handlePausePreview() {
    if (playbackState !== "playing") {
      return;
    }

    playbackControllerRef.current?.pause();
    resetActiveKeys();
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

  function handleSeekPreview(timeMs: number) {
    if (
      playbackState !== "playing" &&
      playbackState !== "paused" &&
      playbackState !== "finished"
    ) {
      return;
    }

    if (playbackState === "finished") {
      if (selectedSongIndex !== null) {
        stopCurrentPreview();
        void startPreviewForSong(selectedSongIndex, { initialSeekMs: timeMs });
      }
      return;
    }

    playbackControllerRef.current?.seekTo(timeMs);
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

  function getActivePreviewPlaybackSongId() {
    return playbackControllerRef.current === null
      ? null
      : activePreviewSongIdRef.current;
  }

  function applyPlaybackSettings({
    isShuffleEnabled: nextIsShuffleEnabled,
    noteIntervalDelayMs: nextNoteIntervalDelayMs,
    playbackMode: nextPlaybackMode,
    playbackSpeed: nextPlaybackSpeed,
  }: {
    isShuffleEnabled: boolean;
    noteIntervalDelayMs: NoteIntervalDelayMs;
    playbackMode: PlaybackMode;
    playbackSpeed: PlaybackSpeed;
  }) {
    const nextOptions = {
      noteIntervalDelayMs: nextNoteIntervalDelayMs,
      playbackSpeed: nextPlaybackSpeed,
    };

    isShuffleEnabledRef.current = nextIsShuffleEnabled;
    noteIntervalDelayMsRef.current = nextNoteIntervalDelayMs;
    playbackModeRef.current = nextPlaybackMode;
    playbackSpeedRef.current = nextPlaybackSpeed;
    setIsShuffleEnabled(nextIsShuffleEnabled);
    setNoteIntervalDelayMs(nextNoteIntervalDelayMs);
    setPlaybackMode(nextPlaybackMode);
    setPlaybackSpeed(nextPlaybackSpeed);
    playbackControllerRef.current?.updateOptions(nextOptions);
  }

  return {
    activeKeys,
    applyPlaybackSettings,
    bottomPlayerProgress,
    canPlayPreview,
    handleNoteIntervalDelayChange,
    handlePausePreview,
    handlePlaybackSpeedChange,
    handlePlayImportedSong,
    handlePlayPreview,
    handleRepeatModeCycle,
    handleResumePreview,
    handleSeekPreview,
    handleShuffleToggle,
    handleStopPreview,
    getActivePreviewPlaybackSongId,
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
