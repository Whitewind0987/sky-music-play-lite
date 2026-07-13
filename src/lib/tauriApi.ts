import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import type { PersistedAppData } from "../types/appData";
import type {
  CandidateWindow,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";
import type { LibrarySongId } from "../types/library";
import type { Song } from "../types/score";

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

export type ImportedScoreFileMetadata = {
  fileName: string;
  id: LibrarySongId;
  modifiedMs: number | null;
  path: string;
  sizeBytes: number;
};

export type ImportedScoreReconcileEntry = {
  songId: LibrarySongId;
  song: Song;
};

export type ImportedScoreReconcileFailure = {
  songId: LibrarySongId;
  songName: string;
  error: string;
};

export type ImportedScoreReconcileReport = {
  createdCount: number;
  renamedCount: number;
  unchangedCount: number;
  verifiedSongIds: LibrarySongId[];
  failed: ImportedScoreReconcileFailure[];
};

export type PlannedPlaybackKey = {
  holdMs?: number;
  key: string;
};

export type BackgroundPlaybackPlanEvent = {
  keys: PlannedPlaybackKey[];
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

export type ForegroundPlaybackPreparedStartRequest = {
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

export function resolveImportedScoresDirectory(): Promise<string> {
  return invoke<string>("resolve_imported_scores_directory");
}

export function ensureImportedScoresDirectory(): Promise<string> {
  return invoke<string>("ensure_imported_scores_directory");
}

export function saveImportedScoreSong(
  songId: LibrarySongId,
  song: Song,
): Promise<string> {
  return invoke<string>("save_imported_score_song", { songId, song });
}

export function readImportedScoreSong(songId: LibrarySongId): Promise<Song> {
  return invoke<Song>("read_imported_score_song", { songId });
}

export function importedScoreFileExists(
  songId: LibrarySongId,
): Promise<boolean> {
  return invoke<boolean>("imported_score_file_exists", { songId });
}

export function deleteImportedScoreFile(
  songId: LibrarySongId,
): Promise<boolean> {
  return invoke<boolean>("delete_imported_score_file", { songId });
}

export function listImportedScoreFiles(): Promise<ImportedScoreFileMetadata[]> {
  return invoke<ImportedScoreFileMetadata[]>("list_imported_score_files");
}

export function reconcileImportedScoreFiles(
  entries: ImportedScoreReconcileEntry[],
): Promise<ImportedScoreReconcileReport> {
  return invoke<ImportedScoreReconcileReport>("reconcile_imported_score_files", {
    entries,
  });
}

export function clearImportedScoreFiles(): Promise<number> {
  return invoke<number>("clear_imported_score_files");
}

export function openImportedScoresDirectory(): Promise<void> {
  return invoke<void>("open_imported_scores_directory");
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

// Stage 1 exposes the Rust foreground engine without migrating the current
// foreground React controller. A later stage will opt into these wrappers.
export function startPreparedForegroundPlayback(
  request: ForegroundPlaybackPreparedStartRequest,
): Promise<BackgroundPlaybackStartResponse> {
  return invoke<BackgroundPlaybackStartResponse>(
    "start_prepared_foreground_playback",
    { request },
  );
}

export function pauseBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("pause_background_playback", { sessionId });
}

export function pauseForegroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("pause_foreground_playback", { sessionId });
}

export function resumeBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("resume_background_playback", { sessionId });
}

export function resumeForegroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("resume_foreground_playback", { sessionId });
}

export function stopBackgroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("stop_background_playback", { sessionId });
}

export function stopForegroundPlayback(sessionId: number): Promise<void> {
  return invoke<void>("stop_foreground_playback", { sessionId });
}

export function seekBackgroundPlayback(
  sessionId: number,
  timeMs: number,
): Promise<void> {
  return invoke<void>("seek_background_playback", { sessionId, timeMs });
}

export function seekForegroundPlayback(
  sessionId: number,
  timeMs: number,
): Promise<void> {
  return invoke<void>("seek_foreground_playback", { sessionId, timeMs });
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

export function updateForegroundPlaybackOptions({
  noteIntervalDelayMs,
  playbackSpeed,
  sessionId,
}: {
  noteIntervalDelayMs: number;
  playbackSpeed: number;
  sessionId: number;
}): Promise<void> {
  return invoke<void>("update_foreground_playback_options", {
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

export function listenForegroundPlaybackEvents(
  handler: (event: Event<BackgroundPlaybackEventPayload>) => void,
): Promise<UnlistenFn> {
  return listen<BackgroundPlaybackEventPayload>(
    "foreground-playback-event",
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
