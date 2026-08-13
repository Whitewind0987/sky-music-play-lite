import { describe, expect, it } from "vitest";
import type {
  SkyWindowLifecycleEventPayload,
  SkyWindowMonitorSnapshot,
} from "./tauriApi";
import {
  isScoreRecordingTargetCurrent,
  shouldCancelRecordingForSkyLifecycle,
} from "./scoreRecordingFlow";

const targetWindow = {
  hwnd: "100",
  title: "Sky",
  class_name: "TgcMainWindow",
  process_name: "Sky.exe",
  process_id: 1,
};

const otherWindow = {
  ...targetWindow,
  hwnd: "200",
  process_id: 2,
};

function lifecycleEvent(
  overrides: Partial<SkyWindowLifecycleEventPayload>,
): SkyWindowLifecycleEventPayload {
  return {
    kind: "available",
    previousWindow: null,
    revision: 1,
    window: targetWindow,
    ...overrides,
  };
}

describe("score recording Sky lifecycle decisions", () => {
  it("cancels when the active target becomes unavailable", () => {
    expect(
      shouldCancelRecordingForSkyLifecycle(
        "100",
        lifecycleEvent({
          kind: "unavailable",
          previousWindow: targetWindow,
          window: null,
        }),
      ),
    ).toBe(true);
  });

  it("cancels when the active target is replaced", () => {
    expect(
      shouldCancelRecordingForSkyLifecycle(
        "100",
        lifecycleEvent({
          kind: "replaced",
          previousWindow: targetWindow,
          window: otherWindow,
        }),
      ),
    ).toBe(true);
  });

  it("does not cancel for an unrelated previous HWND", () => {
    expect(
      shouldCancelRecordingForSkyLifecycle(
        "100",
        lifecycleEvent({
          kind: "unavailable",
          previousWindow: otherWindow,
          window: null,
        }),
      ),
    ).toBe(false);
  });

  it("does not cancel for a normal available event", () => {
    expect(
      shouldCancelRecordingForSkyLifecycle(
        "100",
        lifecycleEvent({ previousWindow: null, window: targetWindow }),
      ),
    ).toBe(false);
  });

  it("does not cancel when another target is replaced", () => {
    expect(
      shouldCancelRecordingForSkyLifecycle(
        "100",
        lifecycleEvent({
          kind: "replaced",
          previousWindow: otherWindow,
          window: { ...otherWindow, hwnd: "300" },
        }),
      ),
    ).toBe(false);
  });
});

describe("score recording post-subscription target verification", () => {
  function snapshot(
    window: SkyWindowMonitorSnapshot["window"],
  ): SkyWindowMonitorSnapshot {
    return { revision: 2, window };
  }

  it("continues when the monitored target still matches", () => {
    expect(isScoreRecordingTargetCurrent("100", snapshot(targetWindow))).toBe(
      true,
    );
  });

  it("cancels when no Sky window remains", () => {
    expect(isScoreRecordingTargetCurrent("100", snapshot(null))).toBe(false);
  });

  it("cancels when the monitor points to another HWND", () => {
    expect(isScoreRecordingTargetCurrent("100", snapshot(otherWindow))).toBe(
      false,
    );
  });
});
