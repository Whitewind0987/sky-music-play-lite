import { describe, expect, it, vi } from "vitest";
import {
  getIsScoreUpgradeInProgress,
  runWithScoreUpgradeInProgress,
} from "./scoreUpgradeOperation";
import { runScoreUpgradePlaybackStartGuard } from "./scoreUpgradePlaybackGuard";

describe("score upgrade in-progress tracking", () => {
  it("is synchronously true during an operation and false afterward", async () => {
    const inProgressRef = { current: false };
    let resolveOperation: () => void = () => {};
    const operation = runWithScoreUpgradeInProgress(
      inProgressRef,
      () =>
        new Promise<void>((resolve) => {
          resolveOperation = resolve;
        }),
    );

    expect(getIsScoreUpgradeInProgress(inProgressRef)).toBe(true);
    resolveOperation();
    await operation;
    expect(getIsScoreUpgradeInProgress(inProgressRef)).toBe(false);
  });

  it("resets the synchronous state when the operation fails", async () => {
    const inProgressRef = { current: false };

    await expect(
      runWithScoreUpgradeInProgress(inProgressRef, async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    expect(getIsScoreUpgradeInProgress(inProgressRef)).toBe(false);
  });

  it("playback guard reads the current ref instead of captured render state", () => {
    const inProgressRef = { current: false };
    const onBlocked = vi.fn();
    const onStart = vi.fn();
    const runGuard = () =>
      runScoreUpgradePlaybackStartGuard({
        getIsScoreUpgradeInProgress: () =>
          getIsScoreUpgradeInProgress(inProgressRef),
        onBlocked,
        onStart,
      });

    inProgressRef.current = true;
    expect(runGuard()).toBe("blocked");
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();

    inProgressRef.current = false;
    expect(runGuard()).toBe("started");
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
