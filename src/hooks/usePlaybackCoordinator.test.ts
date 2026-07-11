import { describe, expect, it } from "vitest";
import {
  PlaybackContextTransactionStore,
  runPlaybackContextTransaction,
} from "../lib/playbackContextTransaction";
import { resolveNextQueueItemForCurrent } from "../lib/playbackQueueDecision";
import type { PlaybackQueueItem } from "../types/playbackQueue";
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

  it("continues B to C to D from queue without playback-order context", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    let queueItems: PlaybackQueueItem[] = [
      { addedAt: 1, id: "B", songIndex: 1 },
      { addedAt: 2, id: "C", songIndex: 2 },
      { addedAt: 3, id: "D", songIndex: 3 },
    ];
    let stopCalls = 0;
    let unavailableLogs = 0;

    for (const currentSongIndex of [1, 2]) {
      const decision = resolveNextQueueItemForCurrent({
        currentSongIndex,
        queueItems,
        songCount: 4,
      });
      expect(decision.status).toBe("next");
      if (decision.status !== "next") {
        stopCalls += 1;
        unavailableLogs += 1;
        continue;
      }

      const nextSongId = decision.nextItem.id;
      const transaction = contextStore.begin({
        currentSongId: nextSongId,
        songIds: decision.remainingItems.map((item) => item.id),
        source: "queue",
      });
      await expect(
        runPlaybackContextTransaction({
          commit: (value) => contextStore.commit(value),
          rollback: (value) => contextStore.rollback(value),
          start: async () => true,
          transaction,
        }),
      ).resolves.toBe("started");
      queueItems = [decision.nextItem, ...decision.remainingItems.slice(1)];
    }

    expect(contextStore.getContext()).toEqual({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });
    expect(queueItems.map((item) => item.id)).toEqual(["D"]);
    expect(stopCalls).toBe(0);
    expect(unavailableLogs).toBe(0);
  });

  it("rolls back failed queued C and leaves the queue unchanged", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    const queueItems: PlaybackQueueItem[] = [
      { addedAt: 1, id: "B", songIndex: 1 },
      { addedAt: 2, id: "C", songIndex: 2 },
      { addedAt: 3, id: "D", songIndex: 3 },
    ];
    const transaction = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });

    await expect(
      runPlaybackContextTransaction({
        commit: (value) => contextStore.commit(value),
        rollback: (value) => contextStore.rollback(value),
        start: async () => false,
        transaction,
      }),
    ).resolves.toBe("failed");
    expect(contextStore.getCurrentSongId()).toBe("B");
    expect(queueItems.map((item) => item.id)).toEqual(["B", "C", "D"]);
  });

  it("does not let stale queued C consume or restore over pending D", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["B", "C", "D"],
      source: "queue",
    });
    let resolveC!: (didStart: boolean) => void;
    const pendingC = new Promise<boolean>((resolve) => {
      resolveC = resolve;
    });
    let consumedC = 0;
    const transactionC = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });
    const resultC = runPlaybackContextTransaction({
      commit: (value) => contextStore.commit(value),
      rollback: (value) => contextStore.rollback(value),
      start: () => pendingC,
      transaction: transactionC,
    });

    const transactionD = contextStore.begin({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });
    await runPlaybackContextTransaction({
      commit: (value) => contextStore.commit(value),
      rollback: (value) => contextStore.rollback(value),
      start: async () => true,
      transaction: transactionD,
    });
    resolveC(true);
    if ((await resultC) === "started") {
      consumedC += 1;
    }

    expect(consumedC).toBe(0);
    expect(contextStore.getCurrentSongId()).toBe("D");
  });
});
