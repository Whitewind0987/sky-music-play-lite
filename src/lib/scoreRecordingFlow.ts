import type {
  SkyWindowLifecycleEventPayload,
  SkyWindowMonitorSnapshot,
} from "./tauriApi";

export function shouldCancelRecordingForSkyLifecycle(
  targetHwnd: string,
  event: SkyWindowLifecycleEventPayload,
): boolean {
  if (event.kind !== "unavailable" && event.kind !== "replaced") {
    return false;
  }

  return event.previousWindow?.hwnd === targetHwnd;
}

export function isScoreRecordingTargetCurrent(
  targetHwnd: string,
  snapshot: SkyWindowMonitorSnapshot,
): boolean {
  return snapshot.window?.hwnd === targetHwnd;
}
