import { describe, expect, it } from "vitest";
import {
  PlaybackContextTransactionStore,
  runPlaybackContextTransaction,
} from "../lib/playbackContextTransaction";
import { shouldSkipTargetWindowEnumerationBeforePlayback } from "./usePlaybackCoordinator";

describe("shouldSkipTargetWindowEnumerationBeforePlayback", () => {
  it("skips full window enumeration for ordinary target-window song switches", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: "1234",
      }),
    ).toBe(true);
  });

  it("still requires the existing missing-target handling when no target is selected", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: null,
      }),
    ).toBe(false);
  });

  it("does not enumerate windows for non-target playback modes", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "preview",
        selectedWindowHwnd: null,
      }),
    ).toBe(true);
  });
});

describe("pending playback coordination", () => {
  it("keeps the newer next request and applies its queue update exactly once", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "A",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    let resolvePendingB!: (didStart: boolean) => void;
    const pendingB = new Promise<boolean>((resolve) => {
      resolvePendingB = resolve;
    });
    const transactionB = contextStore.begin({
      currentSongId: "B",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    const resultB = runPlaybackContextTransaction({
      commit: (transaction) => contextStore.commit(transaction),
      rollback: (transaction) => contextStore.rollback(transaction),
      start: () => pendingB,
      transaction: transactionB,
    });

    let queueUpdates = 0;
    let unavailableStops = 0;
    const transactionC = contextStore.beginCurrentSong("C")!;
    const resultC = await runPlaybackContextTransaction({
      commit: (transaction) => contextStore.commit(transaction),
      rollback: (transaction) => contextStore.rollback(transaction),
      start: async () => true,
      transaction: transactionC,
    });
    if (resultC === "started") {
      queueUpdates += 1;
    } else {
      unavailableStops += 1;
    }

    resolvePendingB(false);
    await expect(resultB).resolves.toBe("stale");
    expect(contextStore.getCurrentSongId()).toBe("C");
    expect(queueUpdates).toBe(1);
    expect(unavailableStops).toBe(0);
  });
});
