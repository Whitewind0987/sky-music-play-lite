import { describe, expect, it } from "vitest";
import {
  addSongToPlaybackQueue,
  createReplacementPlaybackQueue,
  playSongNextInPlaybackQueue,
  removeSongIndicesFromPlaybackQueue,
  replacePlaybackQueueWithCurrent,
} from "./usePlaybackQueue";
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

describe("createReplacementPlaybackQueue", () => {
  it("creates every playlist item in order with independent IDs", () => {
    let id = 0;
    const result = createReplacementPlaybackQueue([2, 0, 1], 3, (songIndex) =>
      createQueueItem(songIndex, `new-${++id}`),
    );

    expect(result.map((item) => item.songIndex)).toEqual([2, 0, 1]);
    expect(result.map((item) => item.id)).toEqual(["new-1", "new-2", "new-3"]);
  });

  it("replaces an existing queue instead of depending on it", () => {
    const existing = [createQueueItem(9, "old")];
    const result = createReplacementPlaybackQueue([1, 2], 3, createQueueItem);

    expect(existing.map((item) => item.id)).toEqual(["old"]);
    expect(result.map((item) => item.songIndex)).toEqual([1, 2]);
  });

  it("creates a one-item queue for a one-song playlist", () => {
    expect(
      createReplacementPlaybackQueue([0], 1, createQueueItem).map(
        (item) => item.songIndex,
      ),
    ).toEqual([0]);
  });

  it("skips invalid song indices safely", () => {
    expect(
      createReplacementPlaybackQueue(
        [-1, 0, 1.5, 2, 3, Number.NaN],
        3,
        createQueueItem,
      ).map((item) => item.songIndex),
    ).toEqual([0, 2]);
  });
});

describe("individual queue operations", () => {
  it("keeps individual Play replacing the queue with the current song", () => {
    expect(
      replacePlaybackQueueWithCurrent(2, createQueueItem).map(
        (item) => item.songIndex,
      ),
    ).toEqual([2]);
  });

  it("keeps Add to Queue appending without replacing existing items", () => {
    const result = addSongToPlaybackQueue(
      [createQueueItem(0)],
      2,
      createQueueItem,
    );

    expect(result.map((item) => item.songIndex)).toEqual([0, 2]);
  });

  it("keeps Play Next inserting after the current item", () => {
    const result = playSongNextInPlaybackQueue(
      [createQueueItem(0), createQueueItem(2)],
      1,
      createQueueItem,
    );

    expect(result.map((item) => item.songIndex)).toEqual([0, 1, 2]);
  });
});
