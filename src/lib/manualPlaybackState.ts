import type {
  ManualPlaybackProgress,
  ManualPlaybackStepResponse,
} from "./tauriApi";
import type { LibrarySongId } from "../types/library";
import { isPreparedPlaybackPlanUnavailableError } from "./preparedPlaybackPlanErrors";

export type ManualPlaybackUiState =
  | "idle"
  | "starting"
  | "active"
  | "tail"
  | "finished"
  | "error";

export type ManualPlaybackOutputMode = "foreground" | "target-window";

export type ManualPlaybackUiProgress = {
  currentMs: number;
  groupCount: number;
  groupIndex: number | null;
  hasNextGroup: boolean;
  percent: number;
  totalMs: number;
};

export const emptyManualPlaybackProgress: ManualPlaybackUiProgress = {
  currentMs: 0,
  groupCount: 0,
  groupIndex: null,
  hasNextGroup: false,
  percent: 0,
  totalMs: 0,
};

export function manualProgressFromStep(
  response: ManualPlaybackStepResponse,
): ManualPlaybackUiProgress {
  return buildManualProgress({
    currentMs: response.sourceTimeMs,
    groupCount: response.groupCount,
    groupIndex: response.groupIndex,
    hasNextGroup: response.hasNextGroup,
    totalMs: response.totalMs,
  });
}

export function manualProgressFromFinishedEvent(
  progress: ManualPlaybackProgress | undefined,
  fallback: ManualPlaybackUiProgress,
): ManualPlaybackUiProgress {
  if (!progress) {
    return { ...fallback, currentMs: fallback.totalMs, percent: fallback.totalMs > 0 ? 100 : 0 };
  }

  return buildManualProgress({
    ...progress,
    currentMs: progress.totalMs,
  });
}

export function isManualPlaybackEngaged(state: ManualPlaybackUiState) {
  return state === "starting" || state === "active" || state === "tail";
}

export function shouldShowManualProgress({
  currentSongId,
  manualSongId,
  state,
}: {
  currentSongId: LibrarySongId | null;
  manualSongId: LibrarySongId | null;
  state: ManualPlaybackUiState;
}) {
  return (
    currentSongId !== null &&
    currentSongId === manualSongId &&
    (state === "active" || state === "tail" || state === "finished")
  );
}

export function resolveManualPlaybackOutputPolicy({
  automaticCanPlay,
  automaticCanSeek,
  automaticCanStop,
  canStepManual,
  isRealInputOutput,
  state,
}: {
  automaticCanPlay: boolean;
  automaticCanSeek: boolean;
  automaticCanStop: boolean;
  canStepManual: boolean;
  isRealInputOutput: boolean;
  state: ManualPlaybackUiState;
}) {
  const isEngaged = isManualPlaybackEngaged(state);

  return {
    canManualStep: isRealInputOutput && canStepManual,
    canPlay: automaticCanPlay && state !== "starting",
    canSeek: automaticCanSeek && !isEngaged,
    canStop: automaticCanStop || isEngaged,
    isEngaged,
    showsManualProgress:
      state === "active" || state === "tail" || state === "finished",
  };
}

export function shouldResetManualForSongChange({
  currentSongId,
  isManualSongAvailable,
  manualSongId,
}: {
  currentSongId: LibrarySongId | null;
  isManualSongAvailable: boolean;
  manualSongId: LibrarySongId | null;
}) {
  if (manualSongId === null) return false;
  if (currentSongId === null) return !isManualSongAvailable;
  return manualSongId !== currentSongId;
}

export function getManualEventRoute({
  currentSessionId,
  eventSessionId,
  isStarting,
}: {
  currentSessionId: number | null;
  eventSessionId: number;
  isStarting: boolean;
}): "apply" | "buffer" | "ignore" {
  if (currentSessionId === eventSessionId) {
    return "apply";
  }

  return isStarting ? "buffer" : "ignore";
}

export function canApplyManualStepResponse(
  response: ManualPlaybackStepResponse,
  terminalSessionIds: ReadonlySet<number>,
) {
  return !terminalSessionIds.has(response.sessionId);
}

export function shouldRetryManualPreparedPlanStart(
  attempt: number,
  error: unknown,
) {
  return attempt === 0 && isPreparedPlaybackPlanUnavailableError(error);
}

function buildManualProgress({
  currentMs,
  groupCount,
  groupIndex,
  hasNextGroup,
  totalMs,
}: {
  currentMs: number;
  groupCount: number;
  groupIndex: number;
  hasNextGroup: boolean;
  totalMs: number;
}): ManualPlaybackUiProgress {
  const normalizedTotalMs = Number.isFinite(totalMs) ? Math.max(totalMs, 0) : 0;
  const normalizedCurrentMs = Number.isFinite(currentMs)
    ? Math.min(Math.max(currentMs, 0), normalizedTotalMs)
    : 0;

  return {
    currentMs: normalizedCurrentMs,
    groupCount,
    groupIndex,
    hasNextGroup,
    percent:
      normalizedTotalMs > 0
        ? Math.min(Math.max((normalizedCurrentMs / normalizedTotalMs) * 100, 0), 100)
        : 0,
    totalMs: normalizedTotalMs,
  };
}
