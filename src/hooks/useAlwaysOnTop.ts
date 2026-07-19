import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { AppLogEntry } from "../lib/tauriApi";
import {
  applyAlwaysOnTopTransition,
  createAlwaysOnTopFailureReport,
} from "../lib/windowAlwaysOnTop";

type UseAlwaysOnTopOptions = {
  appendDetailedLog?: (entry: AppLogEntry) => void;
  appendLog: (entry: string) => void;
  showNotice?: (message: string) => void;
  text: UiText["logs"];
};

export function useAlwaysOnTop({
  appendDetailedLog,
  appendLog,
  showNotice,
  text,
}: UseAlwaysOnTopOptions) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const currentValueRef = useRef(false);
  const hasAppliedPersistedPreferenceRef = useRef(false);
  const hasStartedInitializationRef = useRef(false);
  const isReadyRef = useRef(false);
  const isUpdatingRef = useRef(false);

  const reportFailure = useCallback(
    (desiredAlwaysOnTop: boolean, error: unknown) => {
      const report = createAlwaysOnTopFailureReport({
        desiredAlwaysOnTop,
        error,
        messageTemplate: text.alwaysOnTopChangeFailed,
      });

      appendLog(report.message);
      showNotice?.(report.message);
      appendDetailedLog?.(report.detailedLog);
    },
    [appendDetailedLog, appendLog, showNotice, text],
  );

  const applyPersistedPreference = useCallback(
    (persistedAlwaysOnTop: boolean) => {
      currentValueRef.current = persistedAlwaysOnTop;
      hasAppliedPersistedPreferenceRef.current = true;
      setIsAlwaysOnTop(persistedAlwaysOnTop);
    },
    [],
  );

  const initializeNativeState = useCallback(async () => {
    if (
      !hasAppliedPersistedPreferenceRef.current ||
      hasStartedInitializationRef.current
    ) {
      return;
    }

    hasStartedInitializationRef.current = true;
    isUpdatingRef.current = true;
    setIsUpdating(true);
    const desiredValue = currentValueRef.current;
    const result = await applyAlwaysOnTopTransition({
      currentValue: false,
      desiredValue,
      isUpdating: false,
      setNativeAlwaysOnTop: (value) =>
        getCurrentWindow().setAlwaysOnTop(value),
    });

    if (result.status === "failed") {
      currentValueRef.current = result.value;
      setIsAlwaysOnTop(result.value);
      reportFailure(desiredValue, result.error);
    }

    isUpdatingRef.current = false;
    isReadyRef.current = true;
    setIsUpdating(false);
    setIsReady(true);
  }, [reportFailure]);

  const toggle = useCallback(async () => {
    if (!isReadyRef.current || isUpdatingRef.current) {
      return;
    }

    const currentValue = currentValueRef.current;
    const desiredValue = !currentValue;
    isUpdatingRef.current = true;
    setIsUpdating(true);

    const result = await applyAlwaysOnTopTransition({
      currentValue,
      desiredValue,
      isUpdating: false,
      setNativeAlwaysOnTop: (value) =>
        getCurrentWindow().setAlwaysOnTop(value),
    });

    if (result.status === "applied") {
      currentValueRef.current = result.value;
      setIsAlwaysOnTop(result.value);
    } else if (result.status === "failed") {
      reportFailure(desiredValue, result.error);
    }

    isUpdatingRef.current = false;
    setIsUpdating(false);
  }, [reportFailure]);

  return {
    applyPersistedPreference,
    initializeNativeState,
    isAlwaysOnTop,
    isReady,
    isUpdating,
    toggle,
  };
}
