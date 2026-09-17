import { describe, expect, it } from "vitest";
import { createManualPlaybackHandoffBarrier } from "./manualPlaybackHandoff";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("Manual playback handoff barrier", () => {
  it("drains an in-flight Step before reading the Automatic cursor", async () => {
    const barrier = createManualPlaybackHandoffBarrier();
    const pendingStep = deferred();
    let groupIndex = 0;
    let hasNextGroup = true;
    let handoffSettled = false;

    const step = barrier.enqueueStep(async () => {
      await pendingStep.promise;
      groupIndex = 1;
      hasNextGroup = true;
    });
    const handoff = barrier
      .beginHandoff(() => (hasNextGroup ? groupIndex + 1 : null))
      .then((cursor) => {
        handoffSettled = true;
        return cursor;
      });

    expect(handoffSettled).toBe(false);
    expect(await barrier.enqueueStep(async () => {})).toBe(false);

    pendingStep.resolve();

    await expect(step).resolves.toBe(true);
    await expect(handoff).resolves.toBe(2);
    barrier.finishHandoff();
  });

  it("does not return a stale cursor after a queued Step failure", async () => {
    const barrier = createManualPlaybackHandoffBarrier();
    const pendingStep = deferred();
    let state: "active" | "error" = "active";
    let groupIndex = 0;

    const step = barrier.enqueueStep(async () => {
      try {
        await pendingStep.promise;
      } catch {
        state = "error";
      }
    });
    const handoff = barrier.beginHandoff(() =>
      state === "active" ? groupIndex + 1 : null,
    );

    pendingStep.reject(new Error("Step failed"));

    await expect(step).resolves.toBe(true);
    await expect(handoff).resolves.toBeNull();
    barrier.finishHandoff();
    await expect(barrier.enqueueStep(async () => {})).resolves.toBe(true);
  });
});
