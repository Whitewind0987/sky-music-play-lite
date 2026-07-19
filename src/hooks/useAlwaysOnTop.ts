import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { AppLogEntry } from "../lib/tauriApi";
import {
  createAlwaysOnTopController,
  createAlwaysOnTopFailureReport,
  createInitialAlwaysOnTopControllerState,
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
  const [state, setState] = useState(
    createInitialAlwaysOnTopControllerState,
  );

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
  const reportFailureRef = useRef(reportFailure);
  reportFailureRef.current = reportFailure;
  const controllerRef = useRef<
    ReturnType<typeof createAlwaysOnTopController> | undefined
  >(undefined);

  if (controllerRef.current === undefined) {
    controllerRef.current = createAlwaysOnTopController({
      onFailure: (desiredAlwaysOnTop, error) =>
        reportFailureRef.current(desiredAlwaysOnTop, error),
      onStateChange: setState,
      setNativeAlwaysOnTop: (value) =>
        getCurrentWindow().setAlwaysOnTop(value),
    });
  }

  const applyPersistedPreference = useCallback(
    (persistedAlwaysOnTop: boolean) =>
      controllerRef.current?.applyPersistedPreference(
        persistedAlwaysOnTop,
      ),
    [],
  );
  const initializeNativeState = useCallback(
    () => controllerRef.current?.initializeNativeState(),
    [],
  );
  const toggle = useCallback(
    () => controllerRef.current?.toggle(),
    [],
  );

  return {
    applyPersistedPreference,
    initializeNativeState,
    ...state,
    toggle,
  };
}
