import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
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

export type BackgroundPlaybackPlanEvent = {
  keys: string[];
  timeMs: number;
};

export type BackgroundPlaybackStartRequest = {
  compatibilityProfile: TargetWindowCompatibilityProfile;
  hwnd: string;
  initialProgressMs?: number;
  keyHoldMs: number;
  noteIntervalDelayMs: number;
  playbackSpeed: number;
  plan: BackgroundPlaybackPlanEvent[];
};

export type BackgroundPlaybackPreparePlanRequest = {
  plan: BackgroundPlaybackPlanEvent[];
};

export type BackgroundPlaybackPreparedStartRequest = {
  compatibilityProfile: TargetWindowCompatibilityProfile;
  hwnd: string;
  initialProgressMs?: number;
  keyHoldMs: number;
  noteIntervalDelayMs: number;
  playbackSpeed: number;
  preparedPlanId: number;
};

export type BackgroundPlaybackStartResponse = {
  sessionId: number;
  totalMs: number;
};

export type BackgroundPlaybackPreparePlanResponse = {
  preparedPlanId: number;
};

export type BackgroundPlaybackProgress = {
  currentMs: number;
  percent: number;
  totalMs: number;
};

export type BackgroundPlaybackEventPayload = {
  error?: string;
  progress?: BackgroundPlaybackProgress;
  sessionId: number;
  state?: string;
  type: "error" | "finished" | "progress" | "state";
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

export function startBackgroundPlayback(
  request: BackgroundPlaybackStartRequest,
): Promise<BackgroundPlaybackStartResponse> {
  return invoke<BackgroundPlaybackStartResponse>("start_background_playback", {
    request,
  });
}

export function prepareBackgroundPlaybackPlan(
  request: BackgroundPlaybackPreparePlanRequest,
): Promise<BackgroundPlaybackPreparePlanResponse> {
  return invoke<BackgroundPlaybackPreparePlanResponse>(
    "prepare_background_playback_plan",
    { request },
  );
}

export function startPreparedBackgroundPlayback(
  request: BackgroundPlaybackPreparedStartRequest,
): Promise<BackgroundPlaybackStartResponse> {
  return invoke<BackgroundPlaybackStartResponse>(
    "start_prepared_background_playback",
    { request },
  );
}

export function pauseBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("pause_background_playback", { sessionId });
}

export function resumeBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("resume_background_playback", { sessionId });
}

export function stopBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("stop_background_playback", { sessionId });
}

export function seekBackgroundPlayback(
  sessionId: number,
  timeMs: number,
): Promise<void> {
  return invoke<void>("seek_background_playback", { sessionId, timeMs });
}

export function updateBackgroundPlaybackOptions({
  noteIntervalDelayMs,
  playbackSpeed,
  sessionId,
}: {
  noteIntervalDelayMs: number;
  playbackSpeed: number;
  sessionId: number;
}): Promise<void> {
  return invoke<void>("update_background_playback_options", {
    request: { noteIntervalDelayMs, playbackSpeed, sessionId },
  });
}

export function listenBackgroundPlaybackEvents(
  handler: (event: Event<BackgroundPlaybackEventPayload>) => void,
): Promise<UnlistenFn> {
  return listen<BackgroundPlaybackEventPayload>(
    "background-playback-event",
    handler,
  );
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

export function forceCloseApp(): Promise<void> {
  return invoke<void>("force_close_app");
}
