import { describe, expect, it } from "vitest";
import {
  createManualPlaybackHandoffBarrier,
  isManualPlaybackHandoffOwnershipCurrent,
} from "./manualPlaybackHandoff";

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
    const operation = barrier.beginHandoff();
    expect(operation).not.toBeNull();
    if (operation === null) throw new Error("Expected handoff operation");

    const handoff = barrier.waitForPendingSteps(operation).then((isCurrent) => {
      handoffSettled = true;
      return isCurrent && hasNextGroup ? groupIndex + 1 : null;
    });

    expect(handoffSettled).toBe(false);
    expect(await barrier.enqueueStep(async () => {})).toBe(false);

    pendingStep.resolve();

    await expect(step).resolves.toBe(true);
    await expect(handoff).resolves.toBe(2);
    expect(barrier.finishHandoff(operation.token)).toBe(true);
  });

  it("cancels an awaiting handoff before it can read replacement ownership", async () => {
    const barrier = createManualPlaybackHandoffBarrier();
    const pendingStep = deferred();
    let ownership = "session-a";
    let replacementRead = false;

    void barrier.enqueueStep(() => pendingStep.promise);
    const operation = barrier.beginHandoff();
    if (operation === null) throw new Error("Expected handoff operation");
    const handoff = barrier.waitForPendingSteps(operation).then((isCurrent) => {
      if (!isCurrent) return "cancelled";
      replacementRead = ownership === "session-b";
      return ownership;
    });

    barrier.invalidate();
    ownership = "session-b";
    pendingStep.resolve();

    await expect(handoff).resolves.toBe("cancelled");
    expect(replacementRead).toBe(false);
    expect(barrier.finishHandoff(operation.token)).toBe(false);
  });

  it("does not let stale completion clear a newer handoff", async () => {
    const barrier = createManualPlaybackHandoffBarrier();
    const pendingStepA = deferred();
    const pendingStepB = deferred();

    void barrier.enqueueStep(() => pendingStepA.promise);
    const operationA = barrier.beginHandoff();
    if (operationA === null) throw new Error("Expected handoff A");

    barrier.invalidate();
    void barrier.enqueueStep(() => pendingStepB.promise);
    const operationB = barrier.beginHandoff();
    if (operationB === null) throw new Error("Expected handoff B");

    pendingStepA.resolve();
    await expect(barrier.waitForPendingSteps(operationA)).resolves.toBe(false);
    expect(barrier.finishHandoff(operationA.token)).toBe(false);
    expect(barrier.isCurrent(operationB.token)).toBe(true);
    expect(barrier.isHandoffPending()).toBe(true);
    expect(await barrier.enqueueStep(async () => {})).toBe(false);

    pendingStepB.resolve();
    await expect(barrier.waitForPendingSteps(operationB)).resolves.toBe(true);
    expect(barrier.finishHandoff(operationB.token)).toBe(true);
  });

  it("leaves a replacement session untouched when the old operation settles", async () => {
    const barrier = createManualPlaybackHandoffBarrier();
    const pendingStep = deferred();
    const expectedOwnership = { requestToken: 4, sessionId: 1 };
    const replacement = { requestToken: 6, sessionId: 2, state: "active" };

    void barrier.enqueueStep(() => pendingStep.promise);
    const operation = barrier.beginHandoff();
    if (operation === null) throw new Error("Expected handoff operation");
    const oldCleanup = barrier.waitForPendingSteps(operation).then((isCurrent) => {
      const ownsExpectedSession = isManualPlaybackHandoffOwnershipCurrent({
        currentRequestToken: replacement.requestToken,
        currentSessionId: replacement.sessionId,
        expectedRequestToken: expectedOwnership.requestToken,
        expectedSessionId: expectedOwnership.sessionId,
      });
      if (!isCurrent || !ownsExpectedSession) return false;
      replacement.sessionId = 0;
      replacement.state = "idle";
      return true;
    });

    barrier.invalidate();
    pendingStep.resolve();

    await expect(oldCleanup).resolves.toBe(false);
    expect(replacement).toEqual({
      requestToken: 6,
      sessionId: 2,
      state: "active",
    });
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
    const operation = barrier.beginHandoff();
    if (operation === null) throw new Error("Expected handoff operation");
    const handoff = barrier.waitForPendingSteps(operation).then((isCurrent) =>
      isCurrent && state === "active" ? groupIndex + 1 : null,
    );

    pendingStep.reject(new Error("Step failed"));

    await expect(step).resolves.toBe(true);
    await expect(handoff).resolves.toBeNull();
    expect(barrier.finishHandoff(operation.token)).toBe(true);
    await expect(barrier.enqueueStep(async () => {})).resolves.toBe(true);
  });
});
