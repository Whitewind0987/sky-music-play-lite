import { useCallback, useEffect, useState } from "react";
import {
  appendAppLog,
  getAppRuntimeInfo,
  openLogDirectory,
  type AppLogLevel,
  type AppRuntimeInfo,
} from "../lib/tauriApi";

type DetailedLogInput = {
  details?: unknown;
  level?: AppLogLevel;
  message: string;
  source?: string;
};

export function useAppFileLogger(language: string) {
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [runtimeInfoError, setRuntimeInfoError] = useState<string | null>(null);

  const appendDetailedLog = useCallback(
    ({
      details,
      level = "info",
      message,
      source = "app",
    }: DetailedLogInput) => {
      void appendAppLog({
        details,
        level,
        message,
        source,
      }).catch((error) => {
        console.warn("Failed to append app log.", error);
      });
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    void getAppRuntimeInfo()
      .then((info) => {
        if (isCancelled) {
          return;
        }

        setRuntimeInfo(info);
        setRuntimeInfoError(null);
        appendDetailedLog({
          details: {
            language,
            logDirectory: info.logDirectory,
            logDirectoryFallbackUsed: info.logDirectoryFallbackUsed,
            logFile: info.logFile,
            productName: info.productName,
            userAgent: navigator.userAgent,
            version: info.version,
          },
          message: "App startup",
          source: "startup",
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        const errorMessage = String(error instanceof Error ? error.message : error);

        setRuntimeInfoError(errorMessage);
        console.warn("Failed to load app runtime info.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [appendDetailedLog]);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      appendDetailedLog({
        details: {
          colno: event.colno,
          error: event.error ? String(event.error) : undefined,
          filename: event.filename,
          lineno: event.lineno,
        },
        level: "error",
        message: event.message,
        source: "window-error",
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      appendDetailedLog({
        details: {
          reason: String(event.reason),
        },
        level: "error",
        message: "Unhandled promise rejection",
        source: "unhandled-rejection",
      });
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, [appendDetailedLog]);

  const handleOpenLogDirectory = useCallback(() => {
    void openLogDirectory().catch((error) => {
      console.warn("Failed to open log directory.", error);
      appendDetailedLog({
        details: { error: String(error instanceof Error ? error.message : error) },
        level: "warn",
        message: "Failed to open log directory",
        source: "settings",
      });
    });
  }, [appendDetailedLog]);

  return {
    appendDetailedLog,
    openLogDirectory: handleOpenLogDirectory,
    runtimeInfo,
    runtimeInfoError,
  };
}
