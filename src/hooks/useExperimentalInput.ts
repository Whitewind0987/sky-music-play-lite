import { useEffect, useMemo, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "../lib/playbackScheduler";
import { mapScoreNoteToKeyboardKey } from "../lib/scoreKeyMapping";
import {
  findSkyWindow,
  listCandidateWindows,
  sendMappedKeyToWindow,
} from "../lib/tauriApi";
import type {
  CandidateWindow,
  ExperimentalInputMode,
} from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type {
  NoteIntervalDelayMs,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { Note, Song } from "../types/score";
import { useForegroundPlayback } from "./useForegroundPlayback";

type UseExperimentalInputOptions = {
  appendLog: (message: string) => void;
  currentSong: Song | null;
  keyMapping: KeyMapping;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackSpeed: PlaybackSpeed;
  stopPreviewPlayback: () => void;
  text: UiText;
};

export function useExperimentalInput({
  appendLog,
  currentSong,
  keyMapping,
  noteIntervalDelayMs,
  playbackSpeed,
  stopPreviewPlayback,
  text,
}: UseExperimentalInputOptions) {
  const experimentalPlaybackControllerRef =
    useRef<PreviewPlaybackController | null>(null);
  const experimentalPlaybackRunIdRef = useRef(0);
  const [candidateWindows, setCandidateWindows] = useState<CandidateWindow[]>(
    [],
  );
  const [selectedWindowHwnd, setSelectedWindowHwnd] = useState<string | null>(
    null,
  );
  const [experimentalInputEnabled, setExperimentalInputEnabled] =
    useState(false);
  const [experimentalInputMode, setExperimentalInputMode] =
    useState<ExperimentalInputMode>("target-window-message");
  const [isRefreshingWindows, setIsRefreshingWindows] = useState(false);
  const [isDetectingSkyWindow, setIsDetectingSkyWindow] = useState(false);
  const [isExperimentalPlaybackRunning, setIsExperimentalPlaybackRunning] =
    useState(false);
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
  const canStartExperimentalPlayback =
    experimentalInputEnabled &&
    experimentalInputMode === "target-window-message" &&
    selectedWindowHwnd !== null &&
    currentSong !== null &&
    currentSong.songNotes.length > 0 &&
    !isExperimentalPlaybackRunning;
  const canStopExperimentalPlayback = isExperimentalPlaybackRunning;
  const foregroundPlayback = useForegroundPlayback({
    appendLog,
    currentSong,
    experimentalInputEnabled,
    keyMapping,
    noteIntervalDelayMs,
    onBeforeStart: () => {
      stopPreviewPlayback();
      stopExperimentalPlayback({ logStopped: false });
    },
    playbackSpeed,
    text,
  });

  useEffect(() => {
    return () => {
      stopExperimentalPlayback({ logStopped: false });
    };
  }, []);

  async function handleRefreshWindows() {
    setIsRefreshingWindows(true);
    setLastError(null);

    try {
      const windows = await listCandidateWindows();
      setCandidateWindows(windows);
      setSelectedWindowHwnd((currentHwnd) =>
        currentHwnd !== null &&
        windows.some((window) => window.hwnd === currentHwnd)
          ? currentHwnd
          : null,
      );
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
    experimentalPlaybackControllerRef.current?.stop();
    experimentalPlaybackControllerRef.current = null;
    setIsExperimentalPlaybackRunning(false);
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

  function handleStartExperimentalPlayback() {
    if (
      !canStartExperimentalPlayback ||
      selectedWindowHwnd === null ||
      currentSong === null
    ) {
      return;
    }

    stopPreviewPlayback();
    foregroundPlayback.handleStopForegroundPlayback();
    stopExperimentalPlayback({ logStopped: false });

    const runId = experimentalPlaybackRunIdRef.current + 1;
    const targetWindowHwnd = selectedWindowHwnd;
    const targetWindowTitle =
      selectedWindow?.title || selectedWindow?.class_name || targetWindowHwnd;

    experimentalPlaybackRunIdRef.current = runId;
    setIsExperimentalPlaybackRunning(true);
    setLastError(null);
    appendLog(
      formatText(text.logs.experimentalPlaybackStarted, {
        songName: currentSong.name,
        target: targetWindowTitle,
      }),
    );

    experimentalPlaybackControllerRef.current = schedulePreviewPlayback(
      currentSong.songNotes,
      (noteGroup) => {
        void sendExperimentalNoteGroup({
          noteGroup,
          runId,
          targetWindowHwnd,
        });
      },
      () => {
        if (experimentalPlaybackRunIdRef.current !== runId) {
          return;
        }

        experimentalPlaybackControllerRef.current = null;
        setIsExperimentalPlaybackRunning(false);
        appendLog(text.logs.experimentalPlaybackFinished);
      },
      {
        noteIntervalDelayMs,
        onProgress: setExperimentalPlaybackProgress,
        playbackSpeed,
      },
    );
  }

  async function sendExperimentalNoteGroup({
    noteGroup,
    runId,
    targetWindowHwnd,
  }: {
    noteGroup: Note[];
    runId: number;
    targetWindowHwnd: string;
  }) {
    try {
      const mappedKeys = noteGroup.map((note) =>
        mapScoreNoteToKeyboardKey(note, keyMapping),
      );

      for (const mappedKey of mappedKeys) {
        if (experimentalPlaybackRunIdRef.current !== runId) {
          return;
        }

        await sendMappedKeyToWindow(targetWindowHwnd, mappedKey);
      }

      appendLog(
        formatText(text.logs.experimentalPlaybackSentKeys, {
          keys: mappedKeys.join(", "),
        }),
      );
    } catch (error) {
      if (experimentalPlaybackRunIdRef.current !== runId) {
        return;
      }

      const errorMessage = String(error);
      const logTemplate = isTargetWindowInvalidError(errorMessage)
        ? text.logs.experimentalPlaybackTargetInvalid
        : text.logs.experimentalPlaybackCommandFailed;

      setLastError(errorMessage);
      appendLog(formatText(logTemplate, { error: errorMessage }));
      stopExperimentalPlayback({ logStopped: false });
    }
  }

  return {
    canStartExperimentalPlayback,
    canStopExperimentalPlayback,
    candidateWindows,
    experimentalInputEnabled,
    experimentalInputMode,
    experimentalPlaybackProgress,
    foregroundCountdown: foregroundPlayback.foregroundCountdown,
    foregroundPlaybackState: foregroundPlayback.foregroundPlaybackState,
    handleDetectSkyWindow,
    handleExperimentalInputModeChange,
    handleRefreshWindows,
    handleStartExperimentalPlayback,
    handleStartForegroundPlayback:
      foregroundPlayback.handleStartForegroundPlayback,
    handleStopForegroundPlayback:
      foregroundPlayback.handleStopForegroundPlayback,
    handleStopExperimentalPlayback,
    isDetectingSkyWindow,
    isExperimentalPlaybackRunning,
    isRefreshingWindows,
    lastError,
    selectedWindow,
    selectedWindowHwnd,
    setExperimentalInputEnabled: handleExperimentalInputEnabledChange,
    setSelectedWindowHwnd,
    canStartForegroundPlayback:
      experimentalInputMode === "foreground" &&
      foregroundPlayback.canStartForegroundPlayback,
    canStopForegroundPlayback: foregroundPlayback.canStopForegroundPlayback,
  };
}

function isTargetWindowInvalidError(errorMessage: string) {
  const normalizedMessage = errorMessage.toLowerCase();

  return (
    normalizedMessage.includes("window") &&
    (normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("no longer available"))
  );
}

