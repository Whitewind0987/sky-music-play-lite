import { describe, expect, it } from "vitest";
import type { CandidateWindow } from "../types/experimentalInput";
import {
  connectionLifecycleKind,
  getInvalidTargetLifecycleDecision,
  getInvalidStartFailureDecision,
  isManualTargetSelectionLocked,
  isSkySnapshot,
  reconcileSkyWindow,
  resolveUnboundSkyMonitorStatus,
  shouldLogLifecycleTransition,
  shouldApplyRestoredTargetSnapshot,
  shouldLogReplacementPlaybackStop,
  shouldPreserveManuallyDetectedSky,
  shouldPreserveReconnectOwnership,
  syncTargetSelectionRefs,
  upsertMonitoredSky,
} from "./skyWindowLifecycle";

const sky = (hwnd = "1"): CandidateWindow => ({
  hwnd,
  title: "Sky",
  class_name: "TgcMainWindow",
  process_name: "Sky.exe",
  process_id: 7,
});
const other: CandidateWindow = {
  hwnd: "9",
  title: "Other",
  class_name: "Other",
  process_name: "Other.exe",
  process_id: 9,
};
const base = {
  appliedRevision: 0,
  candidateWindows: [] as CandidateWindow[],
  experimentalInputEnabled: true,
  experimentalInputMode: "target-window-message" as const,
  selectedWindowHwnd: null,
  selectedWindowSnapshot: undefined,
};

describe("reconcileSkyWindow", () => {
  it("binds available Sky when no target exists", () => {
    expect(reconcileSkyWindow({ ...base, monitor: { revision: 1, window: sky() } }).bindWindow).toEqual(sky());
  });

  it("binds the current HWND for a stale saved Sky", () => {
    const decision = reconcileSkyWindow({
      ...base,
      selectedWindowHwnd: "old",
      selectedWindowSnapshot: { className: "TgcMainWindow", processName: "SKY.EXE" },
      monitor: { revision: 1, window: sky("new") },
    });
    expect(decision.bindWindow?.hwnd).toBe("new");
  });

  it("preserves a manually selected non-Sky target", () => {
    const decision = reconcileSkyWindow({
      ...base,
      candidateWindows: [other],
      selectedWindowHwnd: other.hwnd,
      monitor: { revision: 1, window: sky() },
    });
    expect(decision).toMatchObject({ bindWindow: null, clear: false, stopTargetPlayback: false });
  });

  it("clears only a selected Sky when Sky disappears", () => {
    expect(reconcileSkyWindow({
      ...base,
      candidateWindows: [sky()],
      selectedWindowHwnd: "1",
      monitor: { revision: 2, window: null },
    })).toMatchObject({ clear: true, stopTargetPlayback: true, candidateWindows: [] });
  });

  it("does not clear a manual target when Sky disappears", () => {
    expect(reconcileSkyWindow({
      ...base,
      candidateWindows: [other, sky()],
      selectedWindowHwnd: other.hwnd,
      monitor: { revision: 2, window: null },
    })).toMatchObject({ clear: false, stopTargetPlayback: false, candidateWindows: [other] });
  });

  it("stops the old target and atomically binds replacement Sky", () => {
    expect(reconcileSkyWindow({
      ...base,
      candidateWindows: [sky("old")],
      selectedWindowHwnd: "old",
      monitor: { revision: 2, window: sky("new") },
    })).toMatchObject({ stopTargetPlayback: true, bindWindow: sky("new") });
  });

  it("ignores stale revisions", () => {
    expect(reconcileSkyWindow({ ...base, appliedRevision: 3, monitor: { revision: 2, window: sky() } }).ignored).toBe(true);
  });

  it("intentionally reapplies an equal revision after enabling or mode switching", () => {
    const disabled = reconcileSkyWindow({ ...base, appliedRevision: 4, experimentalInputEnabled: false, monitor: { revision: 4, window: sky() } });
    const enabled = reconcileSkyWindow({ ...base, appliedRevision: 4, monitor: { revision: 4, window: sky() } });
    expect(disabled.bindWindow).toBeNull();
    expect(enabled.bindWindow?.hwnd).toBe("1");
  });

  it("does not force binding in foreground mode", () => {
    expect(reconcileSkyWindow({ ...base, experimentalInputMode: "foreground", monitor: { revision: 1, window: sky() } }).bindWindow).toBeNull();
  });

  it("lets app-data restoration of a manual target win", () => {
    const decision = reconcileSkyWindow({
      ...base,
      candidateWindows: [other],
      selectedWindowHwnd: other.hwnd,
      selectedWindowSnapshot: { className: other.class_name, processName: other.process_name ?? undefined },
      monitor: { revision: 5, window: sky() },
    });
    expect(decision.bindWindow).toBeNull();
  });

  it("reconciles app-data restoration of stale Sky to current Sky", () => {
    const decision = reconcileSkyWindow({
      ...base,
      selectedWindowHwnd: "stale",
      selectedWindowSnapshot: { className: "TgcMainWindow", processName: "Sky.exe" },
      monitor: { revision: 5, window: sky("current") },
    });
    expect(decision.bindWindow?.hwnd).toBe("current");
  });
});

describe("lifecycle support helpers", () => {
  it("removes stale Sky rows, preserves non-Sky rows, and upserts one current Sky", () => {
    expect(upsertMonitoredSky([sky("old"), other, sky("duplicate")], sky("new"))).toEqual([sky("new"), other]);
  });

  it("manual detection upserts the verified Sky without duplicates", () => {
    expect(upsertMonitoredSky([other, sky("old")], sky("detected"))).toEqual([sky("detected"), other]);
  });

  it("restored snapshot metadata updates Sky classification", () => {
    expect(isSkySnapshot({ className: "Other", processName: "Sky.exe" })).toBe(false);
    expect(isSkySnapshot({ className: "TgcMainWindow", processName: "SKY.EXE" })).toBe(true);
  });

  it("clearing an invalid HWND synchronously clears both refs", () => {
    const refs = {
      hwnd: { current: "old" as string | null },
      snapshot: { current: { className: "TgcMainWindow", processName: "Sky.exe" } },
    };
    syncTargetSelectionRefs(refs, null, undefined);
    expect(refs).toEqual({ hwnd: { current: null }, snapshot: { current: undefined } });
  });

  it("automatic preflight binding synchronously exposes a usable HWND", () => {
    const decision = reconcileSkyWindow({ ...base, monitor: { revision: 1, window: sky("ready") } });
    const refs = { hwnd: { current: null as string | null }, snapshot: { current: undefined } };
    if (decision.bindWindow) {
      syncTargetSelectionRefs(refs, decision.bindWindow.hwnd, { className: decision.bindWindow.class_name, processName: decision.bindWindow.process_name ?? undefined });
    }
    expect(refs.hwnd.current).toBe("ready");
  });

  it("distinguishes reconnect from first connection", () => {
    expect(connectionLifecycleKind(false)).toBe("connected");
    expect(connectionLifecycleKind(true)).toBe("reconnected");
  });

  it("does not duplicate logs for an identical lifecycle revision", () => {
    expect(shouldLogLifecycleTransition(7, 7)).toBe(false);
    expect(shouldLogLifecycleTransition(8, 7)).toBe(true);
  });

  it("rejects a stale restored-target result after manual selection or lifecycle rebind", () => {
    expect(shouldApplyRestoredTargetSnapshot("manual-B", "restored-A")).toBe(false);
    expect(shouldApplyRestoredTargetSnapshot("rebound-Sky", "restored-A")).toBe(false);
    expect(shouldApplyRestoredTargetSnapshot("restored-A", "restored-A")).toBe(true);
  });

  it("invalid selected Sky enters reconnecting and emits each transition log once", () => {
    const first = getInvalidTargetLifecycleDecision({
      candidateWindows: [sky("old")],
      disconnectAlreadyLogged: false,
      hadTargetPlayback: true,
      playbackStopAlreadyLogged: false,
      selectedWindowHwnd: "old",
      selectedWindowSnapshot: undefined,
    });
    const repeated = getInvalidTargetLifecycleDecision({
      candidateWindows: [sky("old")],
      disconnectAlreadyLogged: true,
      hadTargetPlayback: true,
      playbackStopAlreadyLogged: true,
      selectedWindowHwnd: "old",
      selectedWindowSnapshot: undefined,
    });
    expect(first).toEqual({ enterReconnecting: true, logDisconnect: true, logPlaybackStop: true });
    expect(repeated).toEqual({ enterReconnecting: true, logDisconnect: false, logPlaybackStop: false });
  });

  it("invalid manual non-Sky target does not enter Sky reconnect mode", () => {
    expect(getInvalidTargetLifecycleDecision({
      candidateWindows: [other],
      disconnectAlreadyLogged: false,
      hadTargetPlayback: true,
      playbackStopAlreadyLogged: false,
      selectedWindowHwnd: other.hwnd,
      selectedWindowSnapshot: undefined,
    })).toEqual({ enterReconnecting: false, logDisconnect: false, logPlaybackStop: false });
  });

  it("direct replacement logs playback stop only while playback is active", () => {
    expect(shouldLogReplacementPlaybackStop({ hadTargetPlayback: true, playbackStopAlreadyLogged: false, stopTargetPlayback: true })).toBe(true);
    expect(shouldLogReplacementPlaybackStop({ hadTargetPlayback: false, playbackStopAlreadyLogged: false, stopTargetPlayback: true })).toBe(false);
    expect(shouldLogReplacementPlaybackStop({ hadTargetPlayback: true, playbackStopAlreadyLogged: true, stopTargetPlayback: true })).toBe(false);
  });

  it("equal-revision retained null cannot undo manual detection", () => {
    expect(shouldPreserveManuallyDetectedSky({
      manualDetectionRevision: 5,
      monitor: { revision: 5, window: null },
    })).toBe(true);
    expect(shouldPreserveManuallyDetectedSky({
      manualDetectionRevision: 5,
      monitor: { revision: 5, window: sky("older-retained") },
    })).toBe(true);
  });

  it("a newer real unavailable revision clears manually detected Sky", () => {
    const monitor = { revision: 6, window: null };
    expect(shouldPreserveManuallyDetectedSky({ manualDetectionRevision: 5, monitor })).toBe(false);
    expect(reconcileSkyWindow({
      ...base,
      appliedRevision: 5,
      candidateWindows: [sky("manual")],
      selectedWindowHwnd: "manual",
      selectedWindowSnapshot: { className: "TgcMainWindow", processName: "Sky.exe" },
      monitor,
    }).clear).toBe(true);
  });

  it("invalid-HWND reconnect is classified as reconnected when Sky returns", () => {
    expect(connectionLifecycleKind(true)).toBe("reconnected");
  });

  it("later unavailable snapshots preserve reconnecting instead of downgrading to waiting", () => {
    expect(resolveUnboundSkyMonitorStatus({
      awaitingReconnect: true,
      experimentalInputEnabled: true,
      experimentalInputMode: "target-window-message",
    })).toBe("reconnecting");
    expect(shouldPreserveReconnectOwnership({
      awaitingReconnect: true,
      reconnectRevision: 7,
      snapshotRevision: 7,
    })).toBe(true);
    expect(shouldPreserveReconnectOwnership({
      awaitingReconnect: true,
      reconnectRevision: 7,
      snapshotRevision: 8,
    })).toBe(false);
  });

  it("invalid Sky start with an old active session stops it and never replays it", () => {
    expect(getInvalidStartFailureDecision({
      activeSessionExists: true,
      invalidTargetIsSky: true,
    })).toEqual({ replayActiveSession: false, stopActiveSession: true });
  });

  it("invalid Sky start with only a pending handoff avoids a redundant session stop", () => {
    expect(getInvalidStartFailureDecision({
      activeSessionExists: false,
      invalidTargetIsSky: true,
    })).toEqual({ replayActiveSession: false, stopActiveSession: false });
  });

  it("invalid manual non-Sky target preserves generic active-session replay", () => {
    expect(getInvalidStartFailureDecision({
      activeSessionExists: true,
      invalidTargetIsSky: false,
    })).toEqual({ replayActiveSession: true, stopActiveSession: false });
  });

  it("blocks manual candidate selection during active or pending playback", () => {
    expect(isManualTargetSelectionLocked({ activeSessionId: 12, isHandoffPending: false })).toBe(true);
    expect(isManualTargetSelectionLocked({ activeSessionId: null, isHandoffPending: true })).toBe(true);
  });

  it("allows target selection while idle", () => {
    expect(isManualTargetSelectionLocked({ activeSessionId: null, isHandoffPending: false })).toBe(false);
  });

  it("discards an awaited detection result if playback starts before it resolves", () => {
    const lockedBeforeRequest = isManualTargetSelectionLocked({ activeSessionId: null, isHandoffPending: false });
    const lockedAfterResponse = isManualTargetSelectionLocked({ activeSessionId: 13, isHandoffPending: false });
    expect([lockedBeforeRequest, lockedAfterResponse]).toEqual([false, true]);
  });

  it("automatic lifecycle replacement remains independent of the manual-selection guard", () => {
    expect(isManualTargetSelectionLocked({ activeSessionId: 12, isHandoffPending: false })).toBe(true);
    expect(reconcileSkyWindow({
      ...base,
      candidateWindows: [sky("old")],
      selectedWindowHwnd: "old",
      selectedWindowSnapshot: { className: "TgcMainWindow", processName: "Sky.exe" },
      monitor: { revision: 9, window: sky("new") },
    })).toMatchObject({ bindWindow: sky("new"), stopTargetPlayback: true });
  });
});
