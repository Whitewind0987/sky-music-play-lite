import { useCallback, useEffect, useRef, useState } from "react";
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
import { createPreviewInstrumentAudio } from "../lib/previewInstrumentAudio";
import { createPreviewPianoArticulation } from "../lib/previewPianoArticulation";
import { defaultPreviewVolume, normalizePreviewVolume, type PreviewAudioPreferences } from "../lib/previewAudioPreferences";
import type { PreviewInstrument } from "../lib/previewInstrumentSamples";
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
  advanceQueuePlayback: (queueItemId: string, previousSongId: LibrarySongId | null) => void;
  appendLog: (entry: string) => void;
  peekNextQueueItemAfterCurrent: (
    currentSongIndex: number,
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
  startQueuePlayback: (songIndex: number, previousSongIndex: number | null) => void;
  text: UiText;
};

export function usePreviewPlayback({
  advanceQueuePlayback,
  appendLog,
  peekNextQueueItemAfterCurrent,
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
  const instrumentAudioRef = useRef<ReturnType<typeof createPreviewInstrumentAudio> | null>(null);
  const audioOutputAllowedRef = useRef(true);
  const [previewAudio, setPreviewAudio] = useState<PreviewAudioPreferences>({ volume: defaultPreviewVolume, muted: true });
  const previewAudioRef = useRef(previewAudio);
  const isPreviewAudioEnabled = !previewAudio.muted;
  const [previewInstrument, setPreviewInstrument] = useState<PreviewInstrument>("piano");
  const pendingRequestRef = useRef<object | null>(null);
  const activeKeyEntriesRef = useRef<PreviewActiveKeyEntry[]>([]);
  const activeKeyPruneTimerRef = useRef<number | null>(null);
  const activePreviewSongIdRef = useRef<LibrarySongId | null>(null);
  const isShuffleEnabledRef = useRef(false);
  const noteIntervalDelayMsRef = useRef(defaultNoteIntervalDelayMs);
  const playbackModeRef = useRef<PlaybackMode>(defaultPlaybackMode);
  const playbackSpeedRef = useRef(defaultPlaybackSpeed);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [isPreviewStartPending, setIsPreviewStartPending] = useState(false);
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
    !isPreviewStartPending &&
    (playbackState === "idle" || playbackState === "finished");

  useEffect(() => {
    return () => {
      pendingRequestRef.current = null;
      playbackControllerRef.current?.stop();
      instrumentAudioRef.current?.dispose();

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
    pendingRequestRef.current = null;
    setIsPreviewStartPending(false);
    playbackControllerRef.current?.stop();
    instrumentAudioRef.current?.stop();
    playbackControllerRef.current = null;
    activePreviewSongIdRef.current = null;
    resetActiveKeys();
    setPlaybackState(nextState);
    resetPlaybackProgress();
  }

  async function startPreviewForSong(
    songIndex: number,
    options: { initialSeekMs?: number; onStarted?: (songIndex: number) => void } = {},
  ): Promise<boolean> {
    const request = {};
    pendingRequestRef.current = request;
    setIsPreviewStartPending(true);
    try {
      const previewSongId = librarySongsRef.current[songIndex]?.id ?? null;
      const [song] = await Promise.all([
        resolveSongForPlayback(songIndex),
        !previewAudioRef.current.muted && audioOutputAllowedRef.current
          ? instrumentAudioRef.current?.prepare()
          : undefined,
      ]);
      const resolvedSongIndex = resolveActivePlaybackSongIndex({
        librarySongs: librarySongsRef.current,
        songId: previewSongId,
      });

      if (request !== pendingRequestRef.current || !song || resolvedSongIndex === null) {
        return false;
      }

      const notes = song.songNotes;
      const pianoArticulation = song.formatVersion === 2 ? undefined : createPreviewPianoArticulation(notes);
      const currentTimingOptions = {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
      };

      if (notes.length === 0) {
        stopCurrentPreview("finished");
        appendLog(text.logs.previewFinished);
        return false;
      }

      setSelectedSongIndex(resolvedSongIndex);
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
          if (!previewAudioRef.current.muted && audioOutputAllowedRef.current) {
            instrumentAudioRef.current?.playGroup(noteGroup, playbackSpeedRef.current, pianoArticulation?.(
              noteGroup[0].time,
              { playbackSpeed: playbackSpeedRef.current, noteIntervalDelayMs: noteIntervalDelayMsRef.current },
            ));
          }
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
              : peekNextQueueItemAfterCurrent(currentSongIndex, currentLibrarySongs.length);
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
            instrumentAudioRef.current?.stop();
            appendLog(
              formatText(text.logs.repeatOneTriggered, { songName: song.name }),
            );
            setPlaybackState("finished");
            void startPreviewForSong(currentSongIndex);
            return;
          }

          if (finishDecision.type === "play-next") {
            instrumentAudioRef.current?.stop();
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
            setPlaybackState("finished");
            void startPreviewForSong(finishDecision.nextSongIndex, {
              onStarted: (nextSongIndex) => {
                const songs = librarySongsRef.current;
                if (queuedItem) {
                  advanceQueuePlayback(queuedItem.id, completedSongId);
                } else {
                  const previousSongIndex = resolveActivePlaybackSongIndex({
                    librarySongs: songs,
                    songId: completedSongId,
                  });
                  startQueuePlayback(nextSongIndex, previousSongIndex);
                }
              },
            });
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
      options.onStarted?.(resolvedSongIndex);
      return true;
    } catch (error) {
      if (request !== pendingRequestRef.current) {
        return false;
      }
      stopCurrentPreview();
      appendLog(
        formatText(text.logs.playbackError, {
          error: String(error instanceof Error ? error.message : error),
        }),
      );
      return false;
    } finally {
      if (request === pendingRequestRef.current) {
        pendingRequestRef.current = null;
        setIsPreviewStartPending(false);
      }
    }
  }

  function handlePlayImportedSong(songIndex: number) {
    stopCurrentPreview();
    return startPreviewForSong(songIndex);
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
    instrumentAudioRef.current?.stop();
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
    if (playbackControllerRef.current === null && pendingRequestRef.current === null) {
      instrumentAudioRef.current?.stop();
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

    instrumentAudioRef.current?.stop();
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
    instrumentAudioRef.current?.updateSpeed(nextPlaybackSpeed);
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
    previewAudio: savedPreviewAudio,
  }: {
    isShuffleEnabled: boolean;
    noteIntervalDelayMs: NoteIntervalDelayMs;
    playbackMode: PlaybackMode;
    playbackSpeed: PlaybackSpeed;
    previewAudio?: PreviewAudioPreferences;
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
    instrumentAudioRef.current?.updateSpeed(nextPlaybackSpeed);
    playbackControllerRef.current?.updateOptions(nextOptions);
    if (savedPreviewAudio) updatePreviewAudio(savedPreviewAudio);
  }

  function updatePreviewAudio(preferences: PreviewAudioPreferences) {
    previewAudioRef.current = preferences;
    setPreviewAudio(preferences);
    const audio = instrumentAudioRef.current ??= createPreviewInstrumentAudio();
    audio.setVolume(preferences.volume, preferences.muted);
  }

  function handlePreviewAudioToggle() {
    const preferences = { ...previewAudioRef.current, muted: !previewAudioRef.current.muted };
    updatePreviewAudio(preferences);
    if (!preferences.muted) void instrumentAudioRef.current?.prepare();
  }

  function handlePreviewVolumeChange(volume: number) {
    updatePreviewAudio({ ...previewAudioRef.current, volume: normalizePreviewVolume(volume) });
  }

  function handlePreviewInstrumentChange(instrument: PreviewInstrument) {
    setPreviewInstrument(instrument);
    const audio = instrumentAudioRef.current ??= createPreviewInstrumentAudio();
    audio.selectInstrument(instrument);
    if (!previewAudioRef.current.muted && audioOutputAllowedRef.current) void audio.prepare();
  }

  const setPreviewAudioOutputAllowed = useCallback((allowed: boolean) => {
    audioOutputAllowedRef.current = allowed;
    if (!allowed) instrumentAudioRef.current?.stop();
  }, []);

  return {
    activeKeys,
    applyPlaybackSettings,
    bottomPlayerProgress,
    canPlayPreview,
    handleNoteIntervalDelayChange,
    handlePausePreview,
    handlePreviewAudioToggle,
    handlePreviewVolumeChange,
    handlePreviewInstrumentChange,
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
    isPreviewAudioEnabled,
    isPreviewStartPending,
    noteIntervalDelayMs,
    playbackMode,
    playbackProgress,
    playbackSpeed,
    playbackState,
    previewAudio,
    previewDurationMs,
    previewInstrument,
    setPreviewAudioOutputAllowed,
    stopCurrentPreview,
  };
}
