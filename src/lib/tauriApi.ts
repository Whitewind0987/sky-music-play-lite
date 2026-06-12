import { invoke } from "@tauri-apps/api/core";
import type { PersistedAppData } from "../types/appData";
import type {
  CandidateWindow,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";

export type AppRuntimeInfo = {
  productName: string;
  version: string;
  logDirectory: string;
  logFile: string;
  logDirectoryFallbackUsed: boolean;
};

export type AppLogLevel = "debug" | "info" | "warn" | "error";

export type AppLogEntry = {
  details?: unknown;
  level: AppLogLevel;
  message: string;
  source: string;
};

export function loadAppData(): Promise<unknown | null> {
  return invoke<unknown | null>("load_app_data");
}

export function saveAppData(appData: PersistedAppData): Promise<string> {
  return invoke<string>("save_app_data", { appData });
}

export function listCandidateWindows(): Promise<CandidateWindow[]> {
  return invoke<CandidateWindow[]>("list_candidate_windows");
}

export function findSkyWindow(): Promise<CandidateWindow | null> {
  return invoke<CandidateWindow | null>("find_sky_window");
}

export function sendKeyGroupToWindowMessage({
  compatibilityProfile,
  hwnd,
  keyHoldMs,
  keys,
  method,
}: {
  compatibilityProfile: TargetWindowCompatibilityProfile;
  hwnd: string;
  keyHoldMs: number;
  keys: string[];
  method: TargetWindowMessageMethod;
}): Promise<string> {
  return invoke<string>("send_key_group_to_window_message", {
    compatibilityProfile,
    hwnd,
    keyHoldMs,
    keys,
    method,
  });
}

export function sendForegroundKeyGroup(keys: string[]): Promise<string> {
  return invoke<string>("send_foreground_key_group", { keys });
}

export function getAppRuntimeInfo(): Promise<AppRuntimeInfo> {
  return invoke<AppRuntimeInfo>("get_app_runtime_info");
}

export function appendAppLog(entry: AppLogEntry): Promise<void> {
  return invoke<void>("append_app_log", { entry });
}

export function openLogDirectory(): Promise<void> {
  return invoke<void>("open_log_directory");
}
