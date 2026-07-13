import { useEffect, useMemo, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { ExperimentalInputPreferences } from "../types/appData";
import {
  defaultExperimentalInputEnabled,
  defaultExperimentalInputMode,
  defaultTargetWindowCompatibilityProfile,
  normalizeExperimentalInputPreferences,
  normalizeTargetWindowCompatibilityProfile,
  normalizeTargetWindowMessageMethod,
} from "../lib/experimentalInputPreferences";
import {
  bufferBackgroundPlaybackEvent,
  getBackgroundPlaybackEventRoute,
  takePendingBackgroundPlaybackEvents,
} from "../lib/backgroundPlaybackEvents";
import { resolveBackgroundHandoffRollbackSongIndex } from "../lib/backgroundHandoffRollback";
import { resolveActivePlaybackSongIndex } from "../lib/activePlaybackSong";
import type { PreparedPlaybackPlanCacheKey } from "../lib/backgroundPlaybackPlanCache";
import { formatText } from "../lib/formatText";
import { getLibrarySongName } from "../lib/libraryCollections";
import { isPreparedPlaybackPlanUnavailableError } from "../lib/preparedPlaybackPlanErrors";
import { PreparationCancelledError } from "../lib/playbackPreparationScheduler";
import { decidePlaybackFinish } from "../lib/playbackFlow";
import { prepareWarmPlaybackPlan } from "../lib/warmPlaybackPreparation";
import {
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import {
  findSkyWindow,
  listenBackgroundPlaybackEvents,
  listCandidateWindows,
  pauseBackgroundPlayback,
  resumeBackgroundPlayback,
  seekBackgroundPlayback,
  startPreparedBackgroundPlayback,
  stopBackgroundPlayback,
  updateBackgroundPlaybackOptions,
  type BackgroundPlaybackEventPayload,
} from "../lib/tauriApi";
import type {
  CandidateWindow,
  ExperimentalInputMode,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type { LibrarySong, LibrarySongId } from "../types/library";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Song } from "../types/score";
import { useForegroundPlayback } from "./useForegroundPlayback";
import { usePlaybackPlanPreparation } from "./usePlaybackPlanPreparation";

type SelectedWindowSnapshot = NonNullable<
  ExperimentalInputPreferences
>["selectedWindowSnapshot"];

type UseExperimentalInputOptions = {
  appendLog: (message: string) => void;
  consumeNextQueueItemAfterCurrent: (
    songCount: number,
  ) => PlaybackQueueItem | null;
  consumeQueuedItemAfterCurrent: (
    queueItemId: string,
    songCount: number,
  ) => PlaybackQueueItem | null;
  currentSong: LibrarySong | null;
  currentPlaybackSongIndex: number | null;
  getPlaybackOrderNextSongIndex: (options: {
    currentSongIndex: number;
    isShuffleEnabled: boolean;
    playbackMode: PlaybackMode;
  }) => number | null;
  librarySongsRef: React.MutableRefObject<LibrarySong[]>;
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  getSongIdentityForPlayback: (songIndex: number) => string | null;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  peekNextQueueItemAfterCurrent: (songCount: number) => PlaybackQueueItem | null;
  resolveSongForPlayback: (songIndex: number) => Promise<Song | null>;
  resolveSongForWarmPreparation: (songIndex: number) => Promise<Song | null>;
  selectedSongIndex: number | null;
  setRequestedPlaybackSongIndex: (songIndex: number | null) => void;
  setSelectedSongIndex: (songIndex: number | null) => void;
  showNotice?: (message: string) => void;
  startQueuePlayback: (songIndex: number) => void;
  stopPreviewPlayback: () => void;
  text: UiText;
};

const defaultTargetWindowKeyHoldMs = 30;
const targetWindowKeyHoldMinMs = 10;
const targetWindowKeyHoldMaxMs = 200;

type BackgroundPlaybackContext = {
  sessionId: number;
  song: Song;
  songId: LibrarySongId | null;
};

type BackgroundHandoffTiming = {
  finish: (label: string) => void;
  mark: (label: string) => void;
};

export function useExperimentalInput({
  appendLog,
  consumeQueuedItemAfterCurrent,
  currentSong,
  currentPlaybackSongIndex,
  getPlaybackOrderNextSongIndex,
  getSongIdentityForPlayback,
  librarySongsRef,
  isShuffleEnabled,
  keyMapping,
  noteIntervalDelayMs,
  playbackMode,
  playbackSpeed,
  peekNextQueueItemAfterCurrent,
  resolveSongForPlayback,
  resolveSongForWarmPreparation,
  selectedSongIndex,
  setRequestedPlaybackSongIndex,
  setSelectedSongIndex,
  showNotice,
  startQueuePlayback,
  stopPreviewPlayback,
  text,
}: UseExperimentalInputOptions) {
  const experimentalPlaybackControllerRef =
    useRef<PreviewPlaybackController | null>(null);
  const backgroundPlaybackContextRef =
    useRef<BackgroundPlaybackContext | null>(null);
  const pendingBackgroundEventsRef = useRef<
    Map<number, BackgroundPlaybackEventPayload[]>
  >(new Map());
  const activeBackgroundSessionIdRef = useRef<number | null>(null);
  const backgroundHandoffTokenRef = useRef(0);
  const isBackgroundHandoffPendingRef = useRef(false);
  const backgroundPlaybackEventHandlerRef = useRef<
    (payload: BackgroundPlaybackEventPayload) => void
  >(() => {});
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
    useState(defaultExperimentalInputEnabled);
  const [experimentalInputMode, setExperimentalInputMode] =
    useState<ExperimentalInputMode>(defaultExperimentalInputMode);
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
  const [
    isBackgroundHandoffPending,
    setIsBackgroundHandoffPending,
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
  const { getOrPreparePlaybackPlan, invalidatePlaybackPlan } =
    usePlaybackPlanPreparation({
      getSongIdentityForPlayback,
      keyMapping,
      resolveSongForPlayback,
    });

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
    librarySongsRef,
    isShuffleEnabled,
    noteIntervalDelayMs,
    onBeforeStart: () => {
      stopPreviewPlayback();
      stopExperimentalPlayback({ logStopped: false });
    },
    playbackMode,
    playbackSpeed,
    resolveSongForPlayback,
    resolveSongForWarmPreparation,
    getOrPreparePlaybackPlan,
    invalidatePlaybackPlan,
    selectedSongIndex,
    setSelectedSongIndex,
    startQueuePlayback,
    text,
    consumeQueuedItemAfterCurrent,
    peekNextQueueItemAfterCurrent,
  });

  backgroundPlaybackEventHandlerRef.current = handleBackgroundPlaybackEvent;

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listenBackgroundPlaybackEvents((event) => {
      backgroundPlaybackEventHandlerRef.current(event.payload);
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
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
    const sessionId = activeBackgroundSessionIdRef.current;
    backgroundHandoffTokenRef.current += 1;
    isBackgroundHandoffPendingRef.current = false;
    pendingBackgroundEventsRef.current.clear();
    activeBackgroundSessionIdRef.current = null;
    setIsStartingExperimentalPlayback(false);
    setIsBackgroundHandoffPending(false);
    experimentalPlaybackControllerRef.current = null;
    backgroundPlaybackContextRef.current = null;
    setExperimentalPlaybackState("idle");
    setExperimentalPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });

    if (sessionId !== null) {
      void stopBackgroundPlayback(sessionId);
    }

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
      setExperimentalInputEnabled(defaultExperimentalInputEnabled);
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
      return false;
    }

    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return false;
    }

    return startExperimentalPlaybackWithPreflight(selectedSongIndex);
  }

  async function handlePlayExperimentalSong(songIndex: number) {
    if (
      !experimentalInputEnabled ||
      experimentalInputMode !== "target-window-message"
    ) {
      return false;
    }

    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return false;
    }

    return startExperimentalPlaybackWithPreflight(songIndex);
  }

  async function startExperimentalPlaybackWithPreflight(
    songIndex: number,
    { initialSeekMs }: { initialSeekMs?: number } = {},
  ) {
    if (!isTargetWindowReadyForPlayback()) {
      logMissingTargetWindow();
      return false;
    }

    if (selectedWindowHwnd === null) {
      logMissingTargetWindow();
      return false;
    }

    const handoffToken = beginBackgroundHandoff();
    const timing = createBackgroundHandoffTiming("background handoff");
    const requestedPlaybackSongId =
      librarySongsRef.current[songIndex]?.id ?? null;
    const rollbackPlaybackSongId =
      currentPlaybackSongIndex === null
        ? null
        : librarySongsRef.current[currentPlaybackSongIndex]?.id ?? null;

    timing.mark("request received");
    setRequestedPlaybackSongIndex(songIndex);
    timing.mark("requested-song UI update");

    const song = await resolveSongForPlayback(songIndex);
    timing.mark("score resolution");

    if (!isLatestBackgroundHandoff(handoffToken)) {
      rollbackRequestedPlaybackSong(handoffToken, rollbackPlaybackSongId);
      timing.finish("cancelled after score resolution");
      return false;
    }

    if (song === null) {
      finishBackgroundHandoff(handoffToken);
      rollbackRequestedPlaybackSong(handoffToken, rollbackPlaybackSongId);
      timing.finish("score unavailable");
      return false;
    }

    stopPreviewPlayback();
    foregroundPlayback.handleStopForegroundPlayback();

    return startExperimentalPlaybackForSong(songIndex, song, {
      handoffToken,
      initialSeekMs,
      requestedPlaybackSongId,
      rollbackPlaybackSongId,
      timing,
    });
  }

  async function prepareExperimentalSong(songIndex: number) {
    if (!experimentalInputEnabled) {
      return false;
    }

    try {
      const prepared = await prepareWarmPlaybackPlan({
        prepareResolvedSong: (resolvedSong) =>
          getOrPreparePlaybackPlan({
            priority: "warm",
            resolvedSong,
            songIndex,
          }),
        resolveSongForWarmPreparation,
        songIndex,
      });

      if (prepared === null) {
        return false;
      }
      return prepared.preparedPlanId > 0;
    } catch (error) {
      if (import.meta.env.DEV && !(error instanceof PreparationCancelledError)) {
        console.debug("[background-handoff timing] warm prepare failed", error);
      }
      return false;
    }
  }

  function isTargetWindowReadyForPlayback() {
    return selectedWindowHwnd !== null;
  }

  function logMissingTargetWindow() {
    const message = text.logs.experimentalTargetWindowMissing;
    appendLog(message);
    showNotice?.(message);
  }

  function beginBackgroundHandoff() {
    const token = backgroundHandoffTokenRef.current + 1;

    backgroundHandoffTokenRef.current = token;
    isBackgroundHandoffPendingRef.current = true;
    pendingBackgroundEventsRef.current.clear();
    setIsBackgroundHandoffPending(true);
    setIsStartingExperimentalPlayback(true);
    setLastError(null);

    return token;
  }

  function finishBackgroundHandoff(token: number) {
    if (backgroundHandoffTokenRef.current !== token) {
      return;
    }

    isBackgroundHandoffPendingRef.current = false;
    setIsBackgroundHandoffPending(false);
    setIsStartingExperimentalPlayback(false);
  }

  function isLatestBackgroundHandoff(token: number) {
    return (
      isBackgroundHandoffPendingRef.current &&
      backgroundHandoffTokenRef.current === token
    );
  }

  function rollbackRequestedPlaybackSong(
    handoffToken: number,
    rollbackPlaybackSongId: LibrarySongId | null,
  ) {
    const rollbackPlaybackSongIndex =
      resolveBackgroundHandoffRollbackSongIndex({
        activeHandoffToken: backgroundHandoffTokenRef.current,
        handoffToken,
        librarySongs: librarySongsRef.current,
        rollbackPlaybackSongId,
      });

    if (rollbackPlaybackSongIndex === undefined) {
      return;
    }

    setRequestedPlaybackSongIndex(rollbackPlaybackSongIndex);
  }

  async function startExperimentalPlaybackForSong(
    songIndex: number,
    resolvedSong: Song,
    options: {
      handoffToken: number;
      initialSeekMs?: number;
      requestedPlaybackSongId: LibrarySongId | null;
      rollbackPlaybackSongId: LibrarySongId | null;
      timing: BackgroundHandoffTiming;
      preparedPlanRetryCount?: number;
    },
  ): Promise<boolean> {
    if (selectedWindowHwnd === null) {
      finishBackgroundHandoff(options.handoffToken);
      rollbackRequestedPlaybackSong(
        options.handoffToken,
        options.rollbackPlaybackSongId,
      );
      options.timing.finish("missing target");
      return false;
    }

    const song = resolvedSong;

    if (song.songNotes.length === 0) {
      stopExperimentalPlayback({ logStopped: false });
      setSelectedSongIndex(songIndex);
      setExperimentalPlaybackState("finished");
      appendLog(text.logs.experimentalPlaybackFinished);
      options.timing.finish("empty song");
      return true;
    }

    try {
      options.timing.mark("playback-plan cache lookup");
      const preparedPlan = await getOrPreparePlaybackPlan({
        priority: "direct",
        resolvedSong: song,
        songIndex,
      });
      options.timing.mark("playback-plan prepared");
      return startPreparedExperimentalPlaybackForSong(songIndex, song, {
        handoffToken: options.handoffToken,
        initialSeekMs: options.initialSeekMs,
        preparedPlanId: preparedPlan.preparedPlanId,
        cacheKey: preparedPlan.cacheKey,
        preparedPlanRetryCount: options.preparedPlanRetryCount ?? 0,
        requestedPlaybackSongId: options.requestedPlaybackSongId,
        rollbackPlaybackSongId: options.rollbackPlaybackSongId,
        timing: options.timing,
      });
    } catch (error) {
      const errorMessage = String(error);

      setLastError(errorMessage);
      appendLog(errorMessage);
      showNotice?.(errorMessage);
      finishBackgroundHandoff(options.handoffToken);
      replayActiveSessionEventsAfterFailedHandoff();
      rollbackRequestedPlaybackSong(
        options.handoffToken,
        options.rollbackPlaybackSongId,
      );
      options.timing.finish("prepare failed");
      return false;
    }
  }

  async function startPreparedExperimentalPlaybackForSong(
    songIndex: number,
    song: Song,
    options: {
      handoffToken: number;
      initialSeekMs?: number;
      preparedPlanId: number;
      cacheKey: PreparedPlaybackPlanCacheKey;
      preparedPlanRetryCount: number;
      requestedPlaybackSongId: LibrarySongId | null;
      rollbackPlaybackSongId: LibrarySongId | null;
      timing: BackgroundHandoffTiming;
    },
  ): Promise<boolean> {
    const targetWindowHwnd = selectedWindowHwnd;
    if (targetWindowHwnd === null) {
      finishBackgroundHandoff(options.handoffToken);
      rollbackRequestedPlaybackSong(
        options.handoffToken,
        options.rollbackPlaybackSongId,
      );
      options.timing.finish("missing target before start");
      return false;
    }

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
    setLastError(null);

    try {
      options.timing.mark("Rust start invoke");
      const response = await startPreparedBackgroundPlayback({
        compatibilityProfile,
        hwnd: targetWindowHwnd,
        initialProgressMs: options.initialSeekMs,
        keyHoldMs: targetWindowKeyHoldMsRef.current,
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
        preparedPlanId: options.preparedPlanId,
      });
      options.timing.mark("new session accepted");

      if (!isLatestBackgroundHandoff(options.handoffToken)) {
        void stopBackgroundPlayback(response.sessionId);
        rollbackRequestedPlaybackSong(
          options.handoffToken,
          options.rollbackPlaybackSongId,
        );
        options.timing.finish("stale response stopped");
        return false;
      }

      activeBackgroundSessionIdRef.current = response.sessionId;
      backgroundPlaybackContextRef.current = {
        sessionId: response.sessionId,
        song,
        songId: options.requestedPlaybackSongId,
      };
      setSelectedSongIndex(songIndex);
      experimentalPlaybackControllerRef.current = createBackgroundPlaybackController(
        response.sessionId,
      );
      finishBackgroundHandoff(options.handoffToken);
      setExperimentalPlaybackState("playing");
      setExperimentalPlaybackProgress({
        currentMs: Math.min(options.initialSeekMs ?? 0, response.totalMs),
        percent:
          response.totalMs > 0
            ? (Math.min(options.initialSeekMs ?? 0, response.totalMs) /
                response.totalMs) *
              100
            : 0,
        totalMs: response.totalMs,
      });
      appendLog(
        formatText(text.logs.experimentalPlaybackStarted, {
          songName: song.name,
          target: targetWindowTitle,
        }),
      );
      options.timing.mark("player state installed");
      flushPendingBackgroundPlaybackEvents(response.sessionId);
      warmNextLikelyExperimentalSong(songIndex);
      options.timing.finish("started");
      return true;
    } catch (error) {
      if (!isLatestBackgroundHandoff(options.handoffToken)) {
        rollbackRequestedPlaybackSong(
          options.handoffToken,
          options.rollbackPlaybackSongId,
        );
        options.timing.finish("stale failure ignored");
        return false;
      }

      if (
        options.preparedPlanRetryCount === 0 &&
        isPreparedPlaybackPlanUnavailableError(error)
      ) {
        invalidatePlaybackPlan(options.cacheKey);
        options.timing.mark("prepared plan evicted; retrying once");
        return startExperimentalPlaybackForSong(songIndex, song, {
          handoffToken: options.handoffToken,
          initialSeekMs: options.initialSeekMs,
          preparedPlanRetryCount: 1,
          requestedPlaybackSongId: options.requestedPlaybackSongId,
          rollbackPlaybackSongId: options.rollbackPlaybackSongId,
          timing: options.timing,
        });
      }

      finishBackgroundHandoff(options.handoffToken);
      const errorMessage = String(error);
      const isInvalidTargetWindow = isTargetWindowInvalidError(errorMessage);
      const logTemplate =
        isInvalidTargetWindow
          ? text.logs.experimentalSavedTargetWindowUnavailable
          : selectedWindow === null && selectedWindowSnapshot !== undefined
            ? text.logs.experimentalRestoredTargetWindowSendFailed
            : text.logs.experimentalPlaybackCommandFailed;

      console.warn("[real-playback] background playback start failed", {
        error,
        profile: compatibilityProfile,
        targetWindowHwnd,
      });
      setLastError(logTemplate);
      appendLog(logTemplate);
      if (isInvalidTargetWindow) {
        showNotice?.(text.logs.experimentalSavedTargetWindowUnavailableShort);
        setSelectedWindowHwnd(null);
        setSelectedWindowSnapshot(undefined);
      }
      replayActiveSessionEventsAfterFailedHandoff();
      rollbackRequestedPlaybackSong(
        options.handoffToken,
        options.rollbackPlaybackSongId,
      );
      options.timing.finish("start failed");
      return false;
    }
  }

  function handleExperimentalPlaybackFinished(
    songId: LibrarySongId | null,
    song: Song,
  ) {
    experimentalPlaybackControllerRef.current = null;
    backgroundPlaybackContextRef.current = null;
    activeBackgroundSessionIdRef.current = null;

    const currentLibrarySongs = librarySongsRef.current;
    const songIndex = resolveActivePlaybackSongIndex({
      librarySongs: currentLibrarySongs,
      songId,
    });

    if (songIndex === null) {
      setExperimentalPlaybackState("finished");
      appendLog(text.logs.experimentalPlaybackFinished);
      return;
    }

    const queuedItem =
      playbackModeRef.current === "repeat-one"
        ? null
        : peekNextQueueItemAfterCurrent(currentLibrarySongs.length);
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
      songCount: currentLibrarySongs.length,
    });

    if (finishDecision.type === "repeat-current") {
      appendLog(
        formatText(text.logs.repeatOneTriggered, { songName: song.name }),
      );
      void startExperimentalPlaybackWithPreflight(songIndex).then((started) => {
        if (!started) {
          setExperimentalPlaybackState("finished");
          appendLog(text.logs.experimentalPlaybackFinished);
        }
      });
      return;
    }

    if (finishDecision.type === "play-next") {
      const nextSong = currentLibrarySongs[finishDecision.nextSongIndex] ?? null;
      const logTemplate =
        queuedItem === null
          ? text.logs.repeatAllTriggered
          : text.logs.queueNextTriggered;

      appendLog(
        formatText(logTemplate, {
          songName: nextSong ? getLibrarySongName(nextSong) : song.name,
        }),
      );
      void startExperimentalPlaybackWithPreflight(
        finishDecision.nextSongIndex,
      ).then((started) => {
        if (!started) {
          setExperimentalPlaybackState("finished");
          appendLog(text.logs.experimentalPlaybackFinished);
          return;
        }

        if (queuedItem === null) {
          startQueuePlayback(finishDecision.nextSongIndex);
          return;
        }

        consumeQueuedItemAfterCurrent(
          queuedItem.id,
          currentLibrarySongs.length,
        );
      });
      return;
    }

    setExperimentalPlaybackState("finished");
    appendLog(text.logs.experimentalPlaybackFinished);
  }

  function getActiveTargetWindowPlaybackSongId() {
    return activeBackgroundSessionIdRef.current === null
      ? null
      : backgroundPlaybackContextRef.current?.songId ?? null;
  }

  function handleBackgroundPlaybackEvent(
    payload: BackgroundPlaybackEventPayload,
  ) {
    const route = getBackgroundPlaybackEventRoute({
      currentSessionId: activeBackgroundSessionIdRef.current ?? -1,
      eventSessionId: payload.sessionId,
      isStartPending: isBackgroundHandoffPendingRef.current,
    });

    if (route === "buffer") {
      pendingBackgroundEventsRef.current = bufferBackgroundPlaybackEvent(
        pendingBackgroundEventsRef.current,
        payload,
      );
      return;
    }

    if (route === "ignore") {
      return;
    }

    applyBackgroundPlaybackEvent(payload);
  }

  function flushPendingBackgroundPlaybackEvents(sessionId: number) {
    const pendingEvents = takePendingBackgroundPlaybackEvents(
      pendingBackgroundEventsRef.current,
      sessionId,
    );
    pendingBackgroundEventsRef.current.clear();

    for (const event of pendingEvents) {
      if (event.sessionId !== activeBackgroundSessionIdRef.current) {
        continue;
      }

      applyBackgroundPlaybackEvent(event);
    }
  }

  function replayActiveSessionEventsAfterFailedHandoff() {
    const activeSessionId = activeBackgroundSessionIdRef.current;

    if (activeSessionId === null) {
      pendingBackgroundEventsRef.current.clear();
      return;
    }

    flushPendingBackgroundPlaybackEvents(activeSessionId);
  }

  function warmNextLikelyExperimentalSong(currentSongIndex: number) {
    const currentLibrarySongs = librarySongsRef.current;
    const queuedItem =
      playbackModeRef.current === "repeat-one"
        ? null
        : peekNextQueueItemAfterCurrent(currentLibrarySongs.length);
    const nextSongIndex =
      queuedItem?.songIndex ??
      getPlaybackOrderNextSongIndex({
        currentSongIndex,
        isShuffleEnabled: isShuffleEnabledRef.current,
        playbackMode: playbackModeRef.current,
      });

    if (nextSongIndex !== null) {
      void prepareExperimentalSong(nextSongIndex);
    }
  }

  function applyBackgroundPlaybackEvent(payload: BackgroundPlaybackEventPayload) {
    if (payload.type === "progress" && payload.progress) {
      setExperimentalPlaybackProgress(payload.progress);
      return;
    }

    if (payload.type === "state" && payload.state) {
      if (payload.state === "playing" || payload.state === "paused") {
        setExperimentalPlaybackState(payload.state);
      }
      return;
    }

    if (payload.type === "finished") {
      const context = backgroundPlaybackContextRef.current;

      if (context?.sessionId === payload.sessionId) {
        handleExperimentalPlaybackFinished(context.songId, context.song);
      }
      return;
    }

    if (payload.type === "error") {
      const errorMessage = payload.error ?? text.logs.experimentalPlaybackCommandFailed;
      const isInvalidTargetWindow = isTargetWindowInvalidError(errorMessage);
      const logTemplate =
        isInvalidTargetWindow
          ? text.logs.experimentalSavedTargetWindowUnavailable
          : selectedWindow === null && selectedWindowSnapshot !== undefined
            ? text.logs.experimentalRestoredTargetWindowSendFailed
            : text.logs.experimentalPlaybackCommandFailed;

      console.warn("[real-playback] background playback worker failed", {
        error: payload.error,
        sessionId: payload.sessionId,
      });
      backgroundPlaybackContextRef.current = null;
      activeBackgroundSessionIdRef.current = null;
      experimentalPlaybackControllerRef.current = null;
      setExperimentalPlaybackState("idle");
      setLastError(logTemplate);
      appendLog(logTemplate);
      if (isInvalidTargetWindow) {
        showNotice?.(text.logs.experimentalSavedTargetWindowUnavailableShort);
        setSelectedWindowHwnd(null);
        setSelectedWindowSnapshot(undefined);
      }
    }
  }

  function createBackgroundPlaybackController(
    sessionId: number,
  ): PreviewPlaybackController {
    return {
      pause() {
        void pauseBackgroundPlayback(sessionId);
      },
      resume() {
        void resumeBackgroundPlayback(sessionId);
      },
      seekTo(timeMs) {
        void seekBackgroundPlayback(sessionId, timeMs);
      },
      stop() {
        void stopBackgroundPlayback(sessionId);
      },
      updateOptions(nextOptions) {
        void updateBackgroundPlaybackOptions({
          noteIntervalDelayMs: nextOptions.noteIntervalDelayMs,
          playbackSpeed: nextOptions.playbackSpeed,
          sessionId,
        });
      },
    };
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
    getActiveForegroundPlaybackSongId:
      foregroundPlayback.getActiveForegroundPlaybackSongId,
    getActiveTargetWindowPlaybackSongId,
    handleDetectSkyWindow,
    ensureTargetWindowAvailableForPlayback,
    handleExperimentalInputModeChange,
    handlePauseExperimentalPlayback,
    handlePrepareExperimentalSong: prepareExperimentalSong,
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
      isBackgroundHandoffPending ||
      foregroundPlayback.isForegroundStartPending ||
      experimentalPlaybackState === "playing" ||
      experimentalPlaybackState === "paused",
    isBackgroundHandoffPending,
    isForegroundStartPending: foregroundPlayback.isForegroundStartPending,
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

function createBackgroundHandoffTiming(label: string): BackgroundHandoffTiming {
  if (!import.meta.env.DEV) {
    return {
      finish() {},
      mark() {},
    };
  }

  const startedAt = performance.now();
  let previousAt = startedAt;
  const marks: string[] = [];

  return {
    finish(finalLabel) {
      const now = performance.now();

      console.debug(
        `[background-handoff timing] ${label}: ${finalLabel}; total=${(
          now - startedAt
        ).toFixed(1)}ms; ${marks.join("; ")}`,
      );
    },
    mark(markLabel) {
      const now = performance.now();

      marks.push(
        `${markLabel}=+${(now - previousAt).toFixed(1)}ms (${(
          now - startedAt
        ).toFixed(1)}ms)`,
      );
      previousAt = now;
    },
  };
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

