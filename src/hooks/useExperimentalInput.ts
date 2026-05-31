import { useMemo, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  findSkyWindow,
  listCandidateWindows,
  sendTestKeyToWindow,
} from "../lib/tauriApi";
import type { CandidateWindow } from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";

type UseExperimentalInputOptions = {
  appendLog: (message: string) => void;
  keyMapping: KeyMapping;
  text: UiText;
};

export function useExperimentalInput({
  appendLog,
  keyMapping,
  text,
}: UseExperimentalInputOptions) {
  const [candidateWindows, setCandidateWindows] = useState<CandidateWindow[]>(
    [],
  );
  const [selectedWindowHwnd, setSelectedWindowHwnd] = useState<string | null>(
    null,
  );
  const [experimentalInputEnabled, setExperimentalInputEnabled] =
    useState(false);
  const [isRefreshingWindows, setIsRefreshingWindows] = useState(false);
  const [isDetectingSkyWindow, setIsDetectingSkyWindow] = useState(false);
  const [isSendingTestKey, setIsSendingTestKey] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const selectedWindow = useMemo(
    () =>
      candidateWindows.find((window) => window.hwnd === selectedWindowHwnd) ??
      null,
    [candidateWindows, selectedWindowHwnd],
  );
  const testSkyKey = keyMapping.Key5 ? "Key5" : "Key7";
  const testMappedKey = keyMapping[testSkyKey];
  const canSendTestKey =
    experimentalInputEnabled &&
    selectedWindowHwnd !== null &&
    testMappedKey.trim() !== "" &&
    !isSendingTestKey;

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

  async function handleSendTestKey() {
    if (!canSendTestKey || selectedWindowHwnd === null) {
      return;
    }

    setIsSendingTestKey(true);
    setLastError(null);
    appendLog(
      formatText(text.logs.experimentalTestKeyStarted, {
        key: testMappedKey,
        skyKey: testSkyKey,
      }),
    );

    try {
      const result = await sendTestKeyToWindow(selectedWindowHwnd, testMappedKey);
      appendLog(
        formatText(text.logs.experimentalTestKeySucceeded, {
          result,
        }),
      );
    } catch (error) {
      const errorMessage = String(error);
      setLastError(errorMessage);
      appendLog(
        formatText(text.logs.experimentalTestKeyFailed, {
          error: errorMessage,
        }),
      );
    } finally {
      setIsSendingTestKey(false);
    }
  }

  function handleExperimentalInputEnabledChange(enabled: boolean) {
    setExperimentalInputEnabled(enabled);
    appendLog(
      enabled
        ? text.logs.experimentalInputEnabled
        : text.logs.experimentalInputDisabled,
    );
  }

  return {
    canSendTestKey,
    candidateWindows,
    experimentalInputEnabled,
    handleDetectSkyWindow,
    handleRefreshWindows,
    handleSendTestKey,
    isDetectingSkyWindow,
    isRefreshingWindows,
    isSendingTestKey,
    lastError,
    selectedWindow,
    selectedWindowHwnd,
    setExperimentalInputEnabled: handleExperimentalInputEnabledChange,
    setSelectedWindowHwnd,
    testMappedKey,
    testSkyKey,
  };
}

