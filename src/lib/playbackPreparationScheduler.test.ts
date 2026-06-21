import { describe, expect, it } from "vitest";
import {
  PlaybackPreparationScheduler,
  PreparationCancelledError,
} from "./playbackPreparationScheduler";

describe("PlaybackPreparationScheduler", () => {
  it("limits concurrent preparations", async () => {
    const scheduler = new PlaybackPreparationScheduler({ concurrency: 1 });
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = scheduler.schedule("a", "warm", async () => {
      order.push("a:start");
      await firstGate;
      order.push("a:end");
      return 1;
    });
    const second = scheduler.schedule("b", "warm", async () => {
      order.push("b:start");
      return 2;
    });

    expect(order).toEqual(["a:start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("promotes a queued direct request ahead of warm work", async () => {
    const scheduler = new PlaybackPreparationScheduler({ concurrency: 1 });
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const active = scheduler.schedule("active", "warm", async () => {
      await firstGate;
      order.push("active");
      return 0;
    });
    const warm = scheduler.schedule("warm", "warm", async () => {
      order.push("warm");
      return 1;
    });
    const direct = scheduler.schedule("direct", "direct", async () => {
      order.push("direct");
      return 2;
    });

    releaseFirst();
    await expect(Promise.all([active, warm, direct])).resolves.toEqual([0, 1, 2]);
    expect(order).toEqual(["active", "direct", "warm"]);
  });

  it("deduplicates and promotes the same queued song preparation", async () => {
    const scheduler = new PlaybackPreparationScheduler({ concurrency: 1 });
    let calls = 0;
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const active = scheduler.schedule("active", "warm", async () => {
      await gate;
      return 0;
    });
    const warm = scheduler.schedule("song", "warm", async () => {
      calls += 1;
      return 7;
    });
    const direct = scheduler.schedule("song", "direct", async () => {
      calls += 1;
      return 8;
    });

    releaseFirst();
    await expect(Promise.all([active, warm, direct])).resolves.toEqual([0, 7, 7]);
    expect(calls).toBe(1);
  });

  it("bounds the queued warm tasks and discards the oldest one", async () => {
    const scheduler = new PlaybackPreparationScheduler({
      concurrency: 1,
      maxQueuedWarmTasks: 2,
    });
    let releaseActive: () => void = () => {};
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const active = scheduler.schedule("active", "direct", async () => {
      await activeGate;
      return 0;
    });
    const oldestWarm = scheduler.schedule("warm-1", "warm", async () => 1);
    const secondWarm = scheduler.schedule("warm-2", "warm", async () => 2);
    const newestWarm = scheduler.schedule("warm-3", "warm", async () => 3);

    await expect(oldestWarm).rejects.toBeInstanceOf(PreparationCancelledError);
    releaseActive();
    await expect(Promise.all([active, secondWarm, newestWarm])).resolves.toEqual([
      0,
      2,
      3,
    ]);
  });

  it("does not discard an active warm task or queued direct task", async () => {
    const scheduler = new PlaybackPreparationScheduler({
      concurrency: 1,
      maxQueuedWarmTasks: 1,
    });
    let releaseActive: () => void = () => {};
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const activeWarm = scheduler.schedule("active-warm", "warm", async () => {
      await activeGate;
      return 1;
    });
    const queuedDirect = scheduler.schedule("direct", "direct", async () => 2);
    const firstWarm = scheduler.schedule("warm-1", "warm", async () => 3);
    const secondWarm = scheduler.schedule("warm-2", "warm", async () => 4);

    await expect(firstWarm).rejects.toBeInstanceOf(PreparationCancelledError);
    releaseActive();
    await expect(Promise.all([activeWarm, queuedDirect, secondWarm])).resolves.toEqual([
      1,
      2,
      4,
    ]);
  });

  it("protects a promoted warm task and allows a discarded song to run directly later", async () => {
    const scheduler = new PlaybackPreparationScheduler({
      concurrency: 1,
      maxQueuedWarmTasks: 1,
    });
    let releaseActive: () => void = () => {};
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const active = scheduler.schedule("active", "direct", async () => {
      await activeGate;
      return 0;
    });
    const promotedWarm = scheduler.schedule("promoted", "warm", async () => 1);
    const promotedDirect = scheduler.schedule("promoted", "direct", async () => 2);
    const discardedWarm = scheduler.schedule("discarded", "warm", async () => 3);
    const replacementWarm = scheduler.schedule("replacement", "warm", async () => 4);

    await expect(discardedWarm).rejects.toBeInstanceOf(PreparationCancelledError);
    const retriedDirect = scheduler.schedule("discarded", "direct", async () => 5);

    releaseActive();
    await expect(
      Promise.all([active, promotedWarm, promotedDirect, replacementWarm, retriedDirect]),
    ).resolves.toEqual([0, 1, 1, 4, 5]);
  });
});
