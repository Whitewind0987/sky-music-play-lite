import { describe, expect, it } from "vitest";
import { PlaybackPreparationScheduler } from "./playbackPreparationScheduler";

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
});
