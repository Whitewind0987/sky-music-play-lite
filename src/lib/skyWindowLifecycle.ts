import type { ExperimentalInputMode, CandidateWindow } from "../types/experimentalInput";
import type { SkyWindowMonitorSnapshot } from "./tauriApi";

export type WindowSnapshot = { title?: string; className?: string; processName?: string } | undefined;
export type SkyReconcileInput = {
  appliedRevision: number;
  candidateWindows: CandidateWindow[];
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  monitor: SkyWindowMonitorSnapshot;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot: WindowSnapshot;
};
export type SkyReconcileDecision = {
  candidateWindows: CandidateWindow[];
  clear: boolean;
  bindWindow: CandidateWindow | null;
  ignored: boolean;
  stopTargetPlayback: boolean;
};

export type TargetSelectionRefs = {
  hwnd: { current: string | null };
  snapshot: { current: WindowSnapshot };
};

export function syncTargetSelectionRefs(
  refs: TargetSelectionRefs,
  hwnd: string | null,
  snapshot: WindowSnapshot,
): void {
  refs.hwnd.current = hwnd;
  refs.snapshot.current = snapshot;
}

export function shouldLogLifecycleTransition(
  revision: number,
  previousRevision: number,
): boolean {
  return revision > previousRevision;
}

export function connectionLifecycleKind(
  awaitingReconnect: boolean,
): "connected" | "reconnected" {
  return awaitingReconnect ? "reconnected" : "connected";
}

export function shouldApplyRestoredTargetSnapshot(
  currentHwnd: string | null,
  restoredHwnd: string,
): boolean {
  return currentHwnd === restoredHwnd;
}

export function isSelectedSkyTarget({
  candidateWindows,
  selectedWindowHwnd,
  selectedWindowSnapshot,
}: {
  candidateWindows: CandidateWindow[];
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot: WindowSnapshot;
}): boolean {
  if (selectedWindowHwnd === null) return false;
  return (
    isSkySnapshot(selectedWindowSnapshot) ||
    isSkyWindow(
      candidateWindows.find((window) => window.hwnd === selectedWindowHwnd),
    )
  );
}

export function shouldPreserveManuallyDetectedSky({
  manualDetectionRevision,
  monitor,
}: {
  manualDetectionRevision: number | null;
  monitor: SkyWindowMonitorSnapshot;
}): boolean {
  return (
    manualDetectionRevision !== null &&
    monitor.revision <= manualDetectionRevision
  );
}

export function shouldPreserveReconnectOwnership({
  awaitingReconnect,
  reconnectRevision,
  snapshotRevision,
}: {
  awaitingReconnect: boolean;
  reconnectRevision: number | null;
  snapshotRevision: number;
}): boolean {
  return (
    awaitingReconnect &&
    reconnectRevision !== null &&
    snapshotRevision <= reconnectRevision
  );
}

export function getInvalidTargetLifecycleDecision({
  candidateWindows,
  disconnectAlreadyLogged,
  hadTargetPlayback,
  playbackStopAlreadyLogged,
  selectedWindowHwnd,
  selectedWindowSnapshot,
}: {
  candidateWindows: CandidateWindow[];
  disconnectAlreadyLogged: boolean;
  hadTargetPlayback: boolean;
  playbackStopAlreadyLogged: boolean;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot: WindowSnapshot;
}) {
  const skyTarget = isSelectedSkyTarget({
    candidateWindows,
    selectedWindowHwnd,
    selectedWindowSnapshot,
  });
  return {
    enterReconnecting: skyTarget,
    logDisconnect: skyTarget && !disconnectAlreadyLogged,
    logPlaybackStop:
      skyTarget && hadTargetPlayback && !playbackStopAlreadyLogged,
  };
}

export function shouldLogReplacementPlaybackStop({
  hadTargetPlayback,
  playbackStopAlreadyLogged,
  stopTargetPlayback,
}: {
  hadTargetPlayback: boolean;
  playbackStopAlreadyLogged: boolean;
  stopTargetPlayback: boolean;
}): boolean {
  return (
    stopTargetPlayback && hadTargetPlayback && !playbackStopAlreadyLogged
  );
}

export function resolveUnboundSkyMonitorStatus({
  awaitingReconnect,
  experimentalInputEnabled,
  experimentalInputMode,
}: {
  awaitingReconnect: boolean;
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
}): "inactive" | "waiting" | "reconnecting" {
  if (awaitingReconnect) return "reconnecting";
  return experimentalInputEnabled && experimentalInputMode === "target-window-message"
    ? "waiting"
    : "inactive";
}

export function isManualTargetSelectionLocked({
  activeSessionId,
  isHandoffPending,
}: {
  activeSessionId: number | null;
  isHandoffPending: boolean;
}): boolean {
  return activeSessionId !== null || isHandoffPending;
}

export function getInvalidStartFailureDecision({
  activeSessionExists,
  invalidTargetIsSky,
}: {
  activeSessionExists: boolean;
  invalidTargetIsSky: boolean;
}) {
  return {
    replayActiveSession: !invalidTargetIsSky,
    stopActiveSession: invalidTargetIsSky && activeSessionExists,
  };
}

export function isSkyWindow(window: Pick<CandidateWindow, "class_name" | "process_name"> | null | undefined): boolean {
  return window?.class_name === "TgcMainWindow" && window.process_name?.toLowerCase() === "sky.exe";
}
export function isSkySnapshot(snapshot: WindowSnapshot): boolean {
  return snapshot?.className === "TgcMainWindow" && snapshot.processName?.toLowerCase() === "sky.exe";
}
export function upsertMonitoredSky(windows: CandidateWindow[], sky: CandidateWindow | null): CandidateWindow[] {
  const nonSky = windows.filter((item) => !isSkyWindow(item));
  return sky ? [sky, ...nonSky] : nonSky;
}
export function reconcileSkyWindow(input: SkyReconcileInput): SkyReconcileDecision {
  if (input.monitor.revision < input.appliedRevision) return { candidateWindows: input.candidateWindows, clear: false, bindWindow: null, ignored: true, stopTargetPlayback: false };
  const candidateWindows = upsertMonitoredSky(input.candidateWindows, input.monitor.window);
  const selectedCandidate = input.candidateWindows.find((item) => item.hwnd === input.selectedWindowHwnd);
  const selectedIsSky = isSkyWindow(selectedCandidate) || isSkySnapshot(input.selectedWindowSnapshot);
  const manualTarget = input.selectedWindowHwnd !== null && !selectedIsSky;
  if (manualTarget) return { candidateWindows, clear: false, bindWindow: null, ignored: false, stopTargetPlayback: false };
  if (!input.monitor.window) return { candidateWindows, clear: selectedIsSky, bindWindow: null, ignored: false, stopTargetPlayback: selectedIsSky };
  const active = input.experimentalInputEnabled && input.experimentalInputMode === "target-window-message";
  const shouldBind = active && (input.selectedWindowHwnd === null || selectedIsSky);
  const replaced = selectedIsSky && input.selectedWindowHwnd !== null && input.selectedWindowHwnd !== input.monitor.window.hwnd;
  return { candidateWindows, clear: false, bindWindow: shouldBind ? input.monitor.window : null, ignored: false, stopTargetPlayback: replaced };
}
