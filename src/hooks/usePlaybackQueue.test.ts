import { describe, expect, it } from "vitest";
import { removeSongIndicesFromPlaybackQueue } from "./usePlaybackQueue";
import type { PlaybackQueueItem } from "../types/playbackQueue";

function createQueueItem(
  songIndex: number,
  id = `queue-${songIndex}`,
): PlaybackQueueItem {
  return {
    addedAt: songIndex * 100,
    id,
    songIndex,
  };
}

describe("removeSongIndicesFromPlaybackQueue", () => {
  it("removes queue items whose indices match a removed song", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(1), createQueueItem(3), createQueueItem(5)],
      [3],
    );

    expect(result.map((item) => item.songIndex)).toEqual([1, 4]);
  });

  it("decrements indices after one removed song", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(0), createQueueItem(4), createQueueItem(6)],
      [2],
    );

    expect(result.map((item) => item.songIndex)).toEqual([0, 3, 5]);
  });

  it("reindexes multiple removed indices in one pass", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(1), createQueueItem(3), createQueueItem(5), createQueueItem(7)],
      [3, 6],
    );

    expect(result.map((item) => item.songIndex)).toEqual([1, 4, 5]);
  });

  it("preserves retained item order, IDs, and timestamps", () => {
    const first = createQueueItem(1, "first");
    const removed = createQueueItem(2, "removed");
    const last = createQueueItem(5, "last");

    const result = removeSongIndicesFromPlaybackQueue(
      [first, removed, last],
      [2],
    );

    expect(result).toEqual([
      first,
      { ...last, songIndex: 4 },
    ]);
  });

  it("deduplicates repeated removed indices", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(2), createQueueItem(5)],
      [2, 2],
    );

    expect(result.map((item) => item.songIndex)).toEqual([4]);
  });

  it("handles unsorted removed indices", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(2), createQueueItem(4), createQueueItem(6)],
      [5, 2],
    );

    expect(result.map((item) => item.songIndex)).toEqual([3, 4]);
  });

  it("ignores invalid removed indices", () => {
    const queueItems = [createQueueItem(3)];

    const result = removeSongIndicesFromPlaybackQueue(queueItems, [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]);

    expect(result).toBe(queueItems);
  });

  it("leaves the queue unchanged when no valid indices are supplied", () => {
    const queueItems = [createQueueItem(3)];

    expect(removeSongIndicesFromPlaybackQueue(queueItems, [])).toBe(
      queueItems,
    );
  });

  it("keeps unrelated entries when removed songs are before them", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(4), createQueueItem(8)],
      [2, 5],
    );

    expect(result.map((item) => item.songIndex)).toEqual([3, 6]);
  });

  it("clears the queue when every queued song was removed", () => {
    const result = removeSongIndicesFromPlaybackQueue(
      [createQueueItem(1), createQueueItem(3)],
      [1, 3],
    );

    expect(result).toEqual([]);
  });
});
