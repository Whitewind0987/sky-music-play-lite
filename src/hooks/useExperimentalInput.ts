import { useEffect, useMemo, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { ExperimentalInputPreferences } from "../types/appData";
import {
  defaultTargetWindowCompatibilityProfile,
  normalizeExperimentalInputPreferences,
  normalizeTargetWindowCompatibilityProfile,
  normalizeTargetWindowMessageMethod,
} from "../lib/experimentalInputPreferences";
import { formatText } from "../lib/formatText";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import { prepareMappedKeyboardKeyGroups } from "../lib/scoreKeyMapping";
import {
  findSkyWindow,
  listCandidateWindows,
  sendKeyGroupToWindowMessage,
} from "../lib/tauriApi";
import type {
  CandidateWindow,
  ExperimentalInputMode,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Song } from "../types/score";
import { useForegroundPlayback } from "./useForegroundPlayback";

type SelectedWindowSnapshot = NonNullable<
  ExperimentalInputPreferences
>["selectedWindowSnapshot"];

type UseExperimentalInputOptions = {
  appendLog: (message: string) => void;
  consumeNextQueueItemAfterCurrent: (
    songCount: number,
  ) => PlaybackQueueItem | null;
  currentSong: Song | null;
  getPlaybackOrderNextSongIndex: (options: {
    currentSongIndex: number;
    isShuffleEnabled: boolean;
    playbackMode: PlaybackMode;
  }) => number | null;
  importedSongsRef: React.MutableRefObject<Song[]>;
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  resolveSongForPlayback: (songIndex: number) => Promise<Song | null>;
  selectedSongIndex: number | null;
  setSelectedSongIndex: (songIndex: number | null) => void;
  showNotice?: (message: string) => void;
  startQueuePlayback: (songIndex: number) => void;
  stopPreviewPlayback: () => void;
  text: UiText;
};

const defaultTargetWindowKeyHoldMs = 30;
const targetWindowKeyHoldMinMs = 10;
const targetWindowKeyHoldMaxMs = 200;
const REAL_PLAYBACK_PROGRESS_TICK_MS = 100;

export function useExperimentalInput({
  appendLog,
  consumeNextQueueItemAfterCurrent,
  currentSong,
  getPlaybackOrderNextSongIndex,
  importedSongsRef,
  isShuffleEnabled,
  keyMapping,
  noteIntervalDelayMs,
  playbackMode,
  playbackSpeed,
  resolveSongForPlayback,
  selectedSongIndex,
  setSelectedSongIndex,
  showNotice,
  startQueuePlayback,
  stopPreviewPlayback,
  text,
}: UseExperimentalInputOptions) {
  const experimentalPlaybackControllerRef =
    useRef<PreviewPlaybackController | null>(null);
  const experimentalPlaybackRunIdRef = useRef(0);
  const hasAutoRefreshedRestoredWindowRef = useRef(false);
  const isShuffleEnabledRef = useRef(isShuffleEnabled);
  const noteIntervalDelayMsRef = useRef(noteIntervalDelayMs);
  const playbackModeRef = useRef<PlaybackMode>(playbackMode);
  const playbackSpeedRef = useRef(playbackSpeed);
  const targetWindowMessageMethodRef =
    useRef<TargetWindowMessageMethod>("post-message");
  const targetWindowCompatibilityProfileRef =
    useRef<TargetWindowCompatibilityProfile>(
      defaultTargetWindowCompatibilityProfile,
    );
  const targetWindowKeyHoldMsRef = useRef(defaultTargetWindowKeyHoldMs);
  const [candidateWindows, setCandidateWindows] = useState<CandidateWindow[]>(
    [],
  );
  const [selectedWindowHwnd, setSelectedWindowHwnd] = useState<string | null>(
    null,
  );
  const [selectedWindowSnapshot, setSelectedWindowSnapshot] =
    useState<SelectedWindowSnapshot>(undefined);
  const [experimentalInputEnabled, setExperimentalInputEnabled] =
    useState(false);
  const [experimentalInputMode, setExperimentalInputMode] =
    useState<ExperimentalInputMode>("target-window-message");
  const [targetWindowMessageMethod, setTargetWindowMessageMethod] =
    useState<TargetWindowMessageMethod>("post-message");
  const [
    targetWindowCompatibilityProfile,
    setTargetWindowCompatibilityProfile,
  ] = useState<TargetWindowCompatibilityProfile>(
    defaultTargetWindowCompatibilityProfile,
  );
  const [targetWindowKeyHoldMs, setTargetWindowKeyHoldMs] = useState(
    defaultTargetWindowKeyHoldMs,
  );
  const [isRefreshingWindows, setIsRefreshingWindows] = useState(false);
  const [isDetectingSkyWindow, setIsDetectingSkyWindow] = useState(false);
  const [
    isStartingExperimentalPlayback,
    setIsStartingExperimentalPlayback,
  ] = useState(false);
  const [experimentalPlaybackState, setExperimentalPlaybackState] =
    useState<PlaybackState>("idle");
  const [experimentalPlaybackProgress, setExperimentalPlaybackProgress] =
    useState<PreviewPlaybackProgress>({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  const [lastError, setLastError] = useState<string | null>(null);

  const selectedWindow = useMemo(
    () =>
      candidateWindows.find((window) => window.hwnd === selectedWindowHwnd) ??
      null,
    [candidateWindows, selectedWindowHwnd],
  );
  const canAttemptExperimentalPlayback =
    experimentalInputEnabled &&
    experimentalInputMode === "target-window-message" &&
    currentSong !== null &&
    !isStartingExperimentalPlayback &&
    experimentalPlaybackState !== "playing" &&
    experimentalPlaybackState !== "paused";
  const canStartExperimentalPlayback =
    canAttemptExperimentalPlayback &&
    selectedWindowHwnd !== null;
  const canStopExperimentalPlayback =
    isStartingExperimentalPlayback ||
    experimentalPlaybackState === "playing" ||
    experimentalPlaybackState === "paused";
  const foregroundPlayback = useForegroundPlayback({
    appendLog,
    currentSong,
    experimentalInputEnabled,
    getPlaybackOrderNextSongIndex,
    importedSongsRef,
    isShuffleEnabled,
    keyMapping,
    noteIntervalDelayMs,
    onBeforeStart: () => {
      stopPreviewPlayback();
      stopExperimentalPlayback({ logStopped: false });
    },
    playbackMode,
    playbackSpeed,
    resolveSongForPlayback,
    selectedSongIndex,
    setSelectedSongIndex,
    startQueuePlayback,
    text,
    consumeNextQueueItemAfterCurrent,
  });

  useEffect(() => {
    return () => {
      stopExperimentalPlayback({ logStopped: false });
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
    experimentalPlaybackControllerRef.current?.updateOptions({
      noteIntervalDelayMs,
      playbackSpeed: playbackSpeedRef.current,
    });
  }, [noteIntervalDelayMs]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    experimentalPlaybackControllerRef.current?.updateOptions({
      noteIntervalDelayMs: noteIntervalDelayMsRef.current,
      playbackSpeed,
    });
  }, [playbackSpeed]);

  async function handleRefreshWindows() {
    setIsRefreshingWindows(true);
    setLastError(null);

    try {
      const windows = await listCandidateWindows();
      setCandidateWindows(windows);
      const refreshedSelectedWindow = windows.find(
        (window) => window.hwnd === selectedWindowHwnd,
      );

      if (refreshedSelectedWindow) {
        setSelectedWindowSnapshot(
          candidateWindowToSnapshot(refreshedSelectedWindow),
        );
      } else if (selectedWindowHwnd !== null) {
        appendLog(
          formatText(text.logs.experimentalRestoredTargetWindowMissing, {
            target: getTargetLabelFromSnapshot(
              selectedWindowSnapshot,
              selectedWindowHwnd,
            ),
          }),
        );
      }
      appendLog(
        formatText(text.logs.experimentalWindowListRefreshed, {
          count: windows.length,
        }),
      );
    } catch (error) {
      const errorMessage = String(error);
      setLastError(errorMessage);
      appendLog(
        formatText(text.logs.experimentalWindowListFailed, {
          error: errorMessage,
        }),
      );
    } finally {
      setIsRefreshingWindows(false);
    }
  }

  async function handleDetectSkyWindow() {
    setIsDetectingSkyWindow(true);
    setLastError(null);

    try {
      const skyWindow = await findSkyWindow();

      if (skyWindow === null) {
        appendLog(text.logs.experimentalSkyWindowNotFound);
        return;
      }

      setCandidateWindows((currentWindows) => {
        if (currentWindows.some((window) => window.hwnd === skyWindow.hwnd)) {
          return currentWindows;
        }

        return [skyWindow, ...currentWindows];
      });
      setSelectedWindowSnapshot(candidateWindowToSnapshot(skyWindow));
      setSelectedWindowHwnd(skyWindow.hwnd);
      appendLog(
        formatText(text.logs.experimentalSkyWindowDetected, {
          title: skyWindow.title || skyWindow.class_name,
        }),
      );
    } catch (error) {
      const errorMessage = String(error);
      setLastError(errorMessage);
      appendLog(
        formatText(text.logs.experimentalSkyWindowFailed, {
          error: errorMessage,
        }),
      );
    } finally {
      setIsDetectingSkyWindow(false);
    }
  }

  async function ensureTargetWindowAvailableForPlayback() {
    if (
      !experimentalInputEnabled ||
      experimentalInputMode !== "target-window-message"
    ) {
      return true;
    }

    if (selectedWindowHwnd === null) {
      logMissingTargetWindow();
      return false;
    }

    setLastError(null);

    try {
      const windows = await listCandidateWindows();
      setCandidateWindows(windows);

      const refreshedSelectedWindow = windows.find(
        (window) => window.hwnd === selectedWindowHwnd,
      );

      if (refreshedSelectedWindow) {
        setSelectedWindowSnapshot(
          candidateWindowToSnapshot(refreshedSelectedWindow),
        );
        return true;
      }

      appendLog(text.logs.experimentalSavedTargetWindowUnavailable);
      showNotice?.(text.logs.experimentalSavedTargetWindowUnavailableShort);
      setSelectedWindowHwnd(null);
      setSelectedWindowSnapshot(undefined);
      return false;
    } catch (error) {
      const errorMessage = String(error instanceof Error ? error.message : error);
      const message = formatText(text.logs.experimentalWindowListFailed, {
        error: errorMessage,
      });

      setLastError(errorMessage);
      appendLog(message);
      showNotice?.(message);
      return false;
    }
  }

  function handleExperimentalInputEnabledChange(enabled: boolean) {
    if (!enabled) {
      stopExperimentalPlayback({ logStopped: false });
      foregroundPlayback.handleStopForegroundPlayback();
    }

    setExperimentalInputEnabled(enabled);
    appendLog(
      enabled
        ? text.logs.experimentalInputEnabled
        : text.logs.experimentalInputDisabled,
    );
  }

  function handleExperimentalInputModeChange(mode: ExperimentalInputMode) {
    if (mode === experimentalInputMode) {
      return;
    }

    stopExperimentalPlayback({ logStopped: false });
    foregroundPlayback.handleStopForegroundPlayback();

    if (mode === "target-window-message") {
      const normalizedProfile = normalizeTargetWindowCompatibilityProfile(
        targetWindowCompatibilityProfileRef.current,
      );

      targetWindowMessageMethodRef.current = "post-message";
      targetWindowCompatibilityProfileRef.current = normalizedProfile;
      setTargetWindowMessageMethod("post-message");
      setTargetWindowCompatibilityProfile(normalizedProfile);
    }

    setExperimentalInputMode(mode);
    appendLog(
      formatText(text.logs.experimentalInputModeSelected, {
        mode:
          mode === "foreground"
            ? text.settings.experimentalForegroundMode
            : text.settings.experimentalTargetWindowMode,
      }),
    );
  }

  function stopExperimentalPlayback({
    logStopped,
  }: {
    logStopped: boolean;
  }) {
    experimentalPlaybackRunIdRef.current += 1;
    setIsStartingExperimentalPlayback(false);
    experimentalPlaybackControllerRef.current?.stop();
    experimentalPlaybackControllerRef.current = null;
    setExperimentalPlaybackState("idle");
    setExperimentalPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });

    if (logStopped) {
      appendLog(text.logs.experimentalPlaybackStopped);
    }
  }

  function handleStopExperimentalPlayback() {
    if (!canStopExperimentalPlayback) {
      return;
    }

    stopExperimentalPlayback({ logStopped: true });
  }

  function handleTargetWindowCompatibilityProfileChange(
    profile: TargetWindowCompatibilityProfile,
  ) {
    const normalizedProfile = normalizeTargetWindowCompatibilityProfile(profile);

    if (normalizedProfile === targetWindowCompatibilityProfileRef.current) {
      return;
    }

    targetWindowCompatibilityProfileRef.current = normalizedProfile;
    setTargetWindowCompatibilityProfile(normalizedProfile);
    appendLog(
      formatText(text.logs.experimentalTargetWindowProfileSelected, {
        profile:
          text.settings.experimentalTargetWindowCompatibilityProfiles[
            normalizedProfile
          ],
      }),
    );
  }

  function handleSelectedWindowChange(hwnd: string) {
    const candidateWindow = candidateWindows.find(
      (window) => window.hwnd === hwnd,
    );

    setSelectedWindowHwnd(hwnd);
    setSelectedWindowSnapshot(
      candidateWindow
        ? candidateWindowToSnapshot(candidateWindow)
        : hwnd === selectedWindowHwnd
          ? selectedWindowSnapshot
          : undefined,
    );
  }

  function applyExperimentalInputPreferences(
    preferences:
      | {
          experimentalInputEnabled: boolean;
          experimentalInputMode: ExperimentalInputMode;
          selectedWindowHwnd: string | null;
          selectedWindowSnapshot?: SelectedWindowSnapshot;
          targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
          targetWindowKeyHoldMs: number;
          targetWindowMessageMethod: TargetWindowMessageMethod;
        }
      | undefined,
  ) {
    if (!preferences) {
      setExperimentalInputEnabled(false);
      setSelectedWindowHwnd(null);
      setSelectedWindowSnapshot(undefined);
      return;
    }

    const normalizedPreferences =
      normalizeExperimentalInputPreferences(preferences);

    const clampedKeyHoldMs = clampTargetWindowKeyHoldMs(
      normalizedPreferences.targetWindowKeyHoldMs,
    );

    targetWindowMessageMethodRef.current =
      normalizedPreferences.targetWindowMessageMethod;
    targetWindowCompatibilityProfileRef.current =
      normalizedPreferences.targetWindowCompatibilityProfile;
    targetWindowKeyHoldMsRef.current = clampedKeyHoldMs;
    setExperimentalInputEnabled(normalizedPreferences.experimentalInputEnabled);
    setSelectedWindowHwnd(normalizedPreferences.selectedWindowHwnd);
    setSelectedWindowSnapshot(normalizedPreferences.selectedWindowSnapshot);
    setExperimentalInputMode(normalizedPreferences.experimentalInputMode);
    setTargetWindowMessageMethod(normalizedPreferences.targetWindowMessageMethod);
    setTargetWindowCompatibilityProfile(
      normalizedPreferences.targetWindowCompatibilityProfile,
    );
    setTargetWindowKeyHoldMs(clampedKeyHoldMs);
    appendLog(text.logs.experimentalInputPreferencesRestored);

    if (normalizedPreferences.selectedWindowHwnd !== null) {
      appendLog(
        formatText(text.logs.experimentalRestoredTargetWindow, {
          target: getTargetLabelFromSnapshot(
            normalizedPreferences.selectedWindowSnapshot,
            normalizedPreferences.selectedWindowHwnd,
          ),
        }),
      );

      if (!hasAutoRefreshedRestoredWindowRef.current) {
        hasAutoRefreshedRestoredWindowRef.current = true;
        void refreshCandidateWindowsForRestoredTarget(
          normalizedPreferences.selectedWindowHwnd,
        );
      }
    }
  }

  async function refreshCandidateWindowsForRestoredTarget(
    restoredHwnd: string,
  ) {
    try {
      const windows = await listCandidateWindows();
      setCandidateWindows(windows);

      const restoredWindow = windows.find(
        (window) => window.hwnd === restoredHwnd,
      );

      if (restoredWindow) {
        setSelectedWindowSnapshot(candidateWindowToSnapshot(restoredWindow));
      }
    } catch (error) {
      appendLog(
        formatText(text.logs.experimentalWindowListFailed, {
          error: String(error instanceof Error ? error.message : error),
        }),
      );
    }
  }

  function handlePauseExperimentalPlayback() {
    if (experimentalPlaybackState !== "playing") {
      return;
    }

    experimentalPlaybackControllerRef.current?.pause();
    setExperimentalPlaybackState("paused");
    appendLog(text.logs.experimentalPlaybackPaused);
  }

  function handleResumeExperimentalPlayback() {
    if (experimentalPlaybackState !== "paused") {
      return;
    }

    experimentalPlaybackControllerRef.current?.resume();
    setExperimentalPlaybackState("playing");
    appendLog(text.logs.experimentalPlaybackResumed);
  }

  function handleSeekExperimentalPlayback(timeMs: number) {
    if (
      experimentalPlaybackState !== "playing" &&
      experimentalPlaybackState !== "paused" &&
      experimentalPlaybackState !== "finished"
    ) {
      return;
    }

    if (experimentalPlaybackState === "finished") {
      if (selectedSongIndex !== null) {
        void startExperimentalPlaybackWithPreflight(selectedSongIndex, {
          initialSeekMs: timeMs,
        });
      }
      return;
    }

    experimentalPlaybackControllerRef.current?.seekTo(timeMs);
  }

  async function handleStartExperimentalPlayback() {
    if (!canAttemptExperimentalPlayback || selectedSongIndex === null) {
      return;
    }

    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return;
    }

    await startExperimentalPlaybackWithPreflight(selectedSongIndex);
  }

  async function handlePlayExperimentalSong(songIndex: number) {
    if (
      !experimentalInputEnabled ||
      experimentalInputMode !== "target-window-message"
    ) {
      return;
    }

    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return;
    }

    await startExperimentalPlaybackWithPreflight(songIndex, {
      stopExistingBeforeResolve: true,
    });
  }

  async function startExperimentalPlaybackWithPreflight(
    songIndex: number,
    {
      initialSeekMs,
      stopExistingBeforeResolve = false,
    }: { initialSeekMs?: number; stopExistingBeforeResolve?: boolean } = {},
  ) {
    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return;
    }

    if (selectedWindowHwnd === null) {
      logMissingTargetWindow();
      return;
    }

    if (stopExistingBeforeResolve) {
      stopPreviewPlayback();
      foregroundPlayback.handleStopForegroundPlayback();
      stopExperimentalPlayback({ logStopped: false });
    }

    const runId = experimentalPlaybackRunIdRef.current + 1;

    experimentalPlaybackRunIdRef.current = runId;
    setIsStartingExperimentalPlayback(true);
    setLastError(null);

    const song = await resolveSongForPlayback(songIndex);

    if (experimentalPlaybackRunIdRef.current !== runId) {
      return;
    }

    if (song === null) {
      setIsStartingExperimentalPlayback(false);
      return;
    }

    if (!stopExistingBeforeResolve) {
      stopPreviewPlayback();
      foregroundPlayback.handleStopForegroundPlayback();
      stopExperimentalPlayback({ logStopped: false });
      experimentalPlaybackRunIdRef.current = runId;
      setIsStartingExperimentalPlayback(true);
    }

    if (experimentalPlaybackRunIdRef.current !== runId) {
      return;
    }

    setIsStartingExperimentalPlayback(false);
    startExperimentalPlaybackForSong(songIndex, song, { initialSeekMs });
  }

  function isTargetWindowReadyForPlayback() {
    return selectedWindowHwnd !== null;
  }

  function logMissingTargetWindow() {
    const message = text.logs.experimentalTargetWindowMissing;
    appendLog(message);
    showNotice?.(message);
  }

  async function startExperimentalPlaybackForSong(
    songIndex: number,
    resolvedSong?: Song,
    options: { initialSeekMs?: number } = {},
  ) {
    if (selectedWindowHwnd === null) {
      return;
    }

    const song = resolvedSong ?? (await resolveSongForPlayback(songIndex));

    if (!song) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    setSelectedSongIndex(songIndex);

    if (song.songNotes.length === 0) {
      stopExperimentalPlayback({ logStopped: false });
      setExperimentalPlaybackState("finished");
      appendLog(text.logs.experimentalPlaybackFinished);
      return;
    }

    let mappedKeyGroups: Map<number, string[]>;

    try {
      mappedKeyGroups = prepareMappedKeyboardKeyGroups(
        song.songNotes,
        keyMapping,
      );
    } catch (error) {
      const errorMessage = String(error);

      setLastError(errorMessage);
      appendLog(errorMessage);
      showNotice?.(errorMessage);
      return;
    }

    const runId = experimentalPlaybackRunIdRef.current + 1;
    const targetWindowHwnd = selectedWindowHwnd;
    const targetWindowTitle =
      selectedWindow?.title ||
      selectedWindowSnapshot?.title ||
      selectedWindow?.class_name ||
      selectedWindowSnapshot?.className ||
      targetWindowHwnd;
    const method = normalizeTargetWindowMessageMethod(
      targetWindowMessageMethodRef.current,
    );
    const compatibilityProfile = normalizeTargetWindowCompatibilityProfile(
      targetWindowCompatibilityProfileRef.current,
    );
    targetWindowMessageMethodRef.current = method;
    targetWindowCompatibilityProfileRef.current = compatibilityProfile;
    experimentalPlaybackRunIdRef.current = runId;
    setExperimentalPlaybackState("playing");
    setLastError(null);
    setExperimentalPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: getAdjustedPreviewDurationMs(song.songNotes, {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
      }),
    });
    appendLog(
      formatText(text.logs.experimentalPlaybackStarted, {
        songName: song.name,
        target: targetWindowTitle,
      }),
    );

    experimentalPlaybackControllerRef.current = schedulePreviewPlayback(
      song.songNotes,
      (noteGroup) => {
        const mappedKeys = mappedKeyGroups.get(noteGroup[0]?.time ?? -1);

        if (mappedKeys) {
          void sendExperimentalNoteGroup({
            mappedKeys,
            runId,
            targetWindowHwnd,
          });
        }
      },
      () => {
        if (experimentalPlaybackRunIdRef.current !== runId) {
          return;
        }

        handleExperimentalPlaybackFinished(songIndex, song);
      },
      {
        initialProgressMs: options.initialSeekMs,
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        onProgress: setExperimentalPlaybackProgress,
        playbackSpeed: playbackSpeedRef.current,
        progressTickMs: REAL_PLAYBACK_PROGRESS_TICK_MS,
      },
    );
  }

  function handleExperimentalPlaybackFinished(songIndex: number, song: Song) {
    experimentalPlaybackControllerRef.current = null;

    const currentImportedSongs = importedSongsRef.current;
    const queuedItem =
      playbackModeRef.current === "repeat-one"
        ? null
        : consumeNextQueueItemAfterCurrent(currentImportedSongs.length);
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
      appendLog(
        formatText(text.logs.repeatOneTriggered, { songName: song.name }),
      );
      void startExperimentalPlaybackForSong(songIndex);
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
      if (queuedItem === null) {
        startQueuePlayback(finishDecision.nextSongIndex);
      }
      void startExperimentalPlaybackForSong(finishDecision.nextSongIndex);
      return;
    }

    setExperimentalPlaybackState("finished");
    appendLog(text.logs.experimentalPlaybackFinished);
  }

  async function sendExperimentalNoteGroup({
    mappedKeys,
    runId,
    targetWindowHwnd,
  }: {
    mappedKeys: string[];
    runId: number;
    targetWindowHwnd: string;
  }) {
    try {
      if (experimentalPlaybackRunIdRef.current !== runId) {
        return;
      }

      await sendKeyGroupToWindowMessage({
        compatibilityProfile: targetWindowCompatibilityProfileRef.current,
        hwnd: targetWindowHwnd,
        keyHoldMs: targetWindowKeyHoldMsRef.current,
        keys: mappedKeys,
        method: "post-message",
      });
    } catch (error) {
      if (experimentalPlaybackRunIdRef.current !== runId) {
        return;
      }

      const errorMessage = String(error);
      const isInvalidTargetWindow = isTargetWindowInvalidError(errorMessage);
      const logTemplate =
        isInvalidTargetWindow
          ? text.logs.experimentalSavedTargetWindowUnavailable
          : selectedWindow === null && selectedWindowSnapshot !== undefined
            ? text.logs.experimentalRestoredTargetWindowSendFailed
            : text.logs.experimentalPlaybackCommandFailed;

      console.warn("[real-playback] background key send failed", {
        error,
        profile: targetWindowCompatibilityProfileRef.current,
        targetWindowHwnd,
      });
      setLastError(logTemplate);
      appendLog(logTemplate);
      if (isInvalidTargetWindow) {
        showNotice?.(text.logs.experimentalSavedTargetWindowUnavailableShort);
      }
      stopExperimentalPlayback({ logStopped: false });
    }
  }

  return {
    applyExperimentalInputPreferences,
    canAttemptExperimentalPlayback,
    canStartExperimentalPlayback,
    canStopExperimentalPlayback,
    candidateWindows,
    experimentalInputEnabled,
    experimentalInputMode,
    experimentalPlaybackProgress,
    experimentalPlaybackState,
    foregroundBottomPlaybackState: foregroundPlayback.bottomPlaybackState,
    foregroundCountdown: foregroundPlayback.foregroundCountdown,
    foregroundPlaybackProgress: foregroundPlayback.foregroundPlaybackProgress,
    foregroundPlaybackState: foregroundPlayback.foregroundPlaybackState,
    handleDetectSkyWindow,
    ensureTargetWindowAvailableForPlayback,
    handleExperimentalInputModeChange,
    handlePauseExperimentalPlayback,
    handlePauseForegroundPlayback:
      foregroundPlayback.handlePauseForegroundPlayback,
    handlePlayExperimentalSong,
    handlePlayForegroundSong: foregroundPlayback.handlePlayForegroundSong,
    handleRefreshWindows,
    handleResumeExperimentalPlayback,
    handleResumeForegroundPlayback:
      foregroundPlayback.handleResumeForegroundPlayback,
    handleSeekExperimentalPlayback,
    handleSeekForegroundPlayback:
      foregroundPlayback.handleSeekForegroundPlayback,
    handleStartExperimentalPlayback,
    handleStartForegroundPlayback:
      foregroundPlayback.handleStartForegroundPlayback,
    handleStopForegroundPlayback:
      foregroundPlayback.handleStopForegroundPlayback,
    handleStopExperimentalPlayback,
    isDetectingSkyWindow,
    isExperimentalPlaybackRunning:
      isStartingExperimentalPlayback ||
      experimentalPlaybackState === "playing" ||
      experimentalPlaybackState === "paused",
    isRefreshingWindows,
    lastError,
    selectedWindow,
    selectedWindowHwnd,
    selectedWindowSnapshot,
    setExperimentalInputEnabled: handleExperimentalInputEnabledChange,
    setSelectedWindowHwnd: handleSelectedWindowChange,
    setTargetWindowCompatibilityProfile:
      handleTargetWindowCompatibilityProfileChange,
    targetWindowCompatibilityProfile,
    targetWindowKeyHoldMs,
    targetWindowMessageMethod,
    canStartForegroundPlayback:
      experimentalInputMode === "foreground" &&
      foregroundPlayback.canStartForegroundPlayback,
    canStopForegroundPlayback: foregroundPlayback.canStopForegroundPlayback,
  };
}

function clampTargetWindowKeyHoldMs(keyHoldMs: number) {
  if (!Number.isFinite(keyHoldMs)) {
    return defaultTargetWindowKeyHoldMs;
  }

  return Math.min(
    targetWindowKeyHoldMaxMs,
    Math.max(targetWindowKeyHoldMinMs, Math.round(keyHoldMs)),
  );
}

function candidateWindowToSnapshot(
  candidateWindow: CandidateWindow,
): SelectedWindowSnapshot {
  return {
    className: candidateWindow.class_name,
    hwnd: candidateWindow.hwnd,
    processName: candidateWindow.process_name ?? undefined,
    title: candidateWindow.title,
  };
}

function getTargetLabelFromSnapshot(
  snapshot: SelectedWindowSnapshot,
  hwnd: string,
) {
  if (snapshot?.title) {
    return `${snapshot.title} / HWND ${hwnd}`;
  }

  if (snapshot?.className) {
    return `${snapshot.className} / HWND ${hwnd}`;
  }

  return `HWND ${hwnd}`;
}

function isTargetWindowInvalidError(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();

  return (
    normalizedMessage.includes("window") &&
    (normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("no longer available"))
  );
}

