import { describe, expect, it } from "vitest";
import { PreparedPlaybackPlanCache } from "./backgroundPlaybackPlanCache";

describe("PreparedPlaybackPlanCache", () => {
  it("returns cached prepared plans without rebuilding", async () => {
    const cache = new PreparedPlaybackPlanCache();
    let prepareCount = 0;
    const key = { keyMappingSignature: "keys-a", songIdentity: "song-a" };

    const first = await cache.getOrPrepare(key, async () => {
      prepareCount += 1;
      return 7;
    });
    const second = await cache.getOrPrepare(key, async () => {
      prepareCount += 1;
      return 8;
    });

    expect(first).toEqual({ preparedPlanId: 7, source: "prepared" });
    expect(second).toEqual({ preparedPlanId: 7, source: "cache" });
    expect(prepareCount).toBe(1);
  });

  it("deduplicates simultaneous preparations for the same song and mapping", async () => {
    const cache = new PreparedPlaybackPlanCache();
    let prepareCount = 0;
    let resolvePrepare: (preparedPlanId: number) => void = () => {};
    const key = { keyMappingSignature: "keys-a", songIdentity: "song-a" };
    const preparePromise = new Promise<number>((resolve) => {
      resolvePrepare = resolve;
    });

    const first = cache.getOrPrepare(key, async () => {
      prepareCount += 1;
      return preparePromise;
    });
    const second = cache.getOrPrepare(key, async () => {
      prepareCount += 1;
      return 8;
    });

    resolvePrepare(7);

    await expect(first).resolves.toEqual({
      preparedPlanId: 7,
      source: "prepared",
    });
    await expect(second).resolves.toEqual({
      preparedPlanId: 7,
      source: "prepared",
    });
    expect(prepareCount).toBe(1);
  });

  it("uses a different cache entry after key mapping changes", async () => {
    const cache = new PreparedPlaybackPlanCache();
    const songIdentity = "song-a";

    await cache.getOrPrepare(
      { keyMappingSignature: "keys-a", songIdentity },
      async () => 7,
    );
    const second = await cache.getOrPrepare(
      { keyMappingSignature: "keys-b", songIdentity },
      async () => 8,
    );

    expect(second).toEqual({ preparedPlanId: 8, source: "prepared" });
  });

  it("does not reuse a prepared plan for a different song identity", async () => {
    const cache = new PreparedPlaybackPlanCache();
    const keyMappingSignature = "keys-a";

    await cache.getOrPrepare(
      { keyMappingSignature, songIdentity: "song-a" },
      async () => 7,
    );
    const second = await cache.getOrPrepare(
      { keyMappingSignature, songIdentity: "song-b" },
      async () => 8,
    );

    expect(second).toEqual({ preparedPlanId: 8, source: "prepared" });
  });

  it("evicts the oldest prepared plan when the cache is full", async () => {
    const cache = new PreparedPlaybackPlanCache({ maxEntries: 2 });

    await cache.getOrPrepare(
      { keyMappingSignature: "keys", songIdentity: "song-a" },
      async () => 1,
    );
    await cache.getOrPrepare(
      { keyMappingSignature: "keys", songIdentity: "song-b" },
      async () => 2,
    );
    await cache.getOrPrepare(
      { keyMappingSignature: "keys", songIdentity: "song-c" },
      async () => 3,
    );

    const rebuilt = await cache.getOrPrepare(
      { keyMappingSignature: "keys", songIdentity: "song-a" },
      async () => 4,
    );

    expect(cache.size).toBe(2);
    expect(rebuilt).toEqual({ preparedPlanId: 4, source: "prepared" });
  });

  it("keeps LRU access order aligned with a matching bounded backend cache", async () => {
    const cache = new PreparedPlaybackPlanCache({ maxEntries: 2 });
    const keyA = { keyMappingSignature: "keys", songIdentity: "song-a" };
    const keyB = { keyMappingSignature: "keys", songIdentity: "song-b" };
    const keyC = { keyMappingSignature: "keys", songIdentity: "song-c" };

    await cache.getOrPrepare(keyA, async () => 1);
    await cache.getOrPrepare(keyB, async () => 2);
    await cache.getOrPrepare(keyA, async () => 1);
    await cache.getOrPrepare(keyC, async () => 3);

    expect(
      await cache.getOrPrepare(keyA, async () => 4),
    ).toEqual({ preparedPlanId: 1, source: "cache" });
    expect(
      await cache.getOrPrepare(keyB, async () => 5),
    ).toEqual({ preparedPlanId: 5, source: "prepared" });
  });

  it("invalidates only the exact prepared plan entry after a backend eviction", async () => {
    const cache = new PreparedPlaybackPlanCache();
    const key = { keyMappingSignature: "keys-a", songIdentity: "song-a" };

    await cache.getOrPrepare(key, async () => 7);
    cache.invalidate(key);

    expect(await cache.getOrPrepare(key, async () => 8)).toEqual({
      preparedPlanId: 8,
      source: "prepared",
    });
  });
});
