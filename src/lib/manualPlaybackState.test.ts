import { describe, expect, it } from "vitest";
import {
  canApplyManualStepResponse,
  emptyManualPlaybackProgress,
  getManualEventRoute,
  isManualPlaybackEngaged,
  manualProgressFromFinishedEvent,
  manualProgressFromStep,
  resolveManualPlaybackOutputPolicy,
  shouldResetManualForSongChange,
  shouldRetryManualPreparedPlanStart,
  shouldShowManualProgress,
} from "./manualPlaybackState";
import type { ManualPlaybackStepResponse } from "./tauriApi";

function step(
  overrides: Partial<ManualPlaybackStepResponse> = {},
): ManualPlaybackStepResponse {
  return {
    didAdvance: true,
    groupCount: 3,
    groupIndex: 1,
    hasNextGroup: true,
    sessionId: 7,
    sourceTimeMs: 1_000,
    state: "active",
    totalMs: 4_000,
    ...overrides,
  };
}

describe("manual playback state helpers", () => {
  it("converts backend source progress without automatic timing", () => {
    expect(manualProgressFromStep(step())).toEqual({
      currentMs: 1_000,
      groupCount: 3,
      groupIndex: 1,
      hasNextGroup: true,
      percent: 25,
      totalMs: 4_000,
    });
  });

  it("preserves active and tail Step states from the backend", () => {
    expect(step().state).toBe("active");
    expect(step({ hasNextGroup: false, state: "tail" }).state).toBe("tail");
  });

  it("moves finished progress to the backend total", () => {
    expect(
      manualProgressFromFinishedEvent(
        {
          currentMs: 1_000,
          groupCount: 3,
          groupIndex: 2,
          hasNextGroup: false,
          totalMs: 4_000,
        },
        emptyManualPlaybackProgress,
      ),
    ).toMatchObject({ currentMs: 4_000, percent: 100, totalMs: 4_000 });
  });

  it("does not let a late Step response regress a terminal session", () => {
    expect(canApplyManualStepResponse(step(), new Set([7]))).toBe(false);
    expect(canApplyManualStepResponse(step(), new Set())).toBe(true);
  });

  it("retries an evicted prepared plan exactly once", () => {
    const unavailable =
      "Prepared background playback plan is no longer available. id: 7";

    expect(shouldRetryManualPreparedPlanStart(0, unavailable)).toBe(true);
    expect(shouldRetryManualPreparedPlanStart(1, unavailable)).toBe(false);
    expect(shouldRetryManualPreparedPlanStart(0, "another failure")).toBe(false);
  });

  it("buffers only early events and ignores stale session events", () => {
    expect(
      getManualEventRoute({
        currentSessionId: null,
        eventSessionId: 7,
        isStarting: true,
      }),
    ).toBe("buffer");
    expect(
      getManualEventRoute({
        currentSessionId: 8,
        eventSessionId: 7,
        isStarting: false,
      }),
    ).toBe("ignore");
    expect(
      getManualEventRoute({
        currentSessionId: 7,
        eventSessionId: 7,
        isStarting: false,
      }),
    ).toBe("apply");
  });

  it("resets ownership on song identity change", () => {
    expect(
      shouldResetManualForSongChange({
        currentSongId: "b",
        isManualSongAvailable: true,
        manualSongId: "a",
      }),
    ).toBe(true);
    expect(
      shouldResetManualForSongChange({
        currentSongId: "a",
        isManualSongAvailable: true,
        manualSongId: "a",
      }),
    ).toBe(false);
    expect(
      shouldResetManualForSongChange({
        currentSongId: null,
        isManualSongAvailable: true,
        manualSongId: "a",
      }),
    ).toBe(false);
    expect(
      shouldResetManualForSongChange({
        currentSongId: null,
        isManualSongAvailable: false,
        manualSongId: "a",
      }),
    ).toBe(true);
  });

  it("distinguishes engagement from retained finished progress", () => {
    expect(isManualPlaybackEngaged("starting")).toBe(true);
    expect(isManualPlaybackEngaged("active")).toBe(true);
    expect(isManualPlaybackEngaged("tail")).toBe(true);
    expect(isManualPlaybackEngaged("finished")).toBe(false);
    expect(
      shouldShowManualProgress({
        currentSongId: "a",
        manualSongId: "a",
        state: "finished",
      }),
    ).toBe(true);
  });

  it("arbitrates Automatic controls and retained Manual progress", () => {
    const active = resolveManualPlaybackOutputPolicy({
      automaticCanPlay: true,
      automaticCanSeek: true,
      automaticCanStop: false,
      canStepManual: true,
      isRealInputOutput: true,
      state: "active",
    });
    expect(active).toMatchObject({
      canManualStep: true,
      canPlay: true,
      canSeek: false,
      canStop: true,
      showsManualProgress: true,
    });

    const tail = resolveManualPlaybackOutputPolicy({
      automaticCanPlay: true,
      automaticCanSeek: true,
      automaticCanStop: false,
      canStepManual: false,
      isRealInputOutput: true,
      state: "tail",
    });
    expect(tail).toMatchObject({
      canManualStep: false,
      canPlay: true,
      canStop: true,
    });

    const starting = resolveManualPlaybackOutputPolicy({
      automaticCanPlay: true,
      automaticCanSeek: true,
      automaticCanStop: false,
      canStepManual: false,
      isRealInputOutput: true,
      state: "starting",
    });
    expect(starting).toMatchObject({ canManualStep: false, canPlay: false });

    const finished = resolveManualPlaybackOutputPolicy({
      automaticCanPlay: true,
      automaticCanSeek: true,
      automaticCanStop: false,
      canStepManual: true,
      isRealInputOutput: true,
      state: "finished",
    });
    expect(finished).toMatchObject({
      canManualStep: true,
      canPlay: true,
      canSeek: true,
      canStop: false,
      showsManualProgress: true,
    });

    expect(
      resolveManualPlaybackOutputPolicy({
        automaticCanPlay: true,
        automaticCanSeek: true,
        automaticCanStop: false,
        canStepManual: true,
        isRealInputOutput: false,
        state: "idle",
      }).canManualStep,
    ).toBe(false);
  });

  it.each(["playing", "paused"])(
    "keeps Manual Step available while Automatic is %s for handoff",
    () => {
      expect(
        resolveManualPlaybackOutputPolicy({
          automaticCanPlay: false,
          automaticCanSeek: true,
          automaticCanStop: true,
          canStepManual: true,
          isRealInputOutput: true,
          state: "idle",
        }).canManualStep,
      ).toBe(true);
    },
  );
});
