import { describe, expect, it } from "vitest";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import {
  getValidQueueItemsFrom,
  resolveNextQueueItemForCurrent,
} from "./playbackQueueDecision";

function item(songIndex: number, id = `queue-${songIndex}`): PlaybackQueueItem {
  return { addedAt: songIndex, id, songIndex };
}

describe("resolveNextQueueItemForCurrent", () => {
  const queueItems = [item(1, "B"), item(2, "C"), item(3, "D")];

  it("resolves C after B and D after C", () => {
    expect(
      resolveNextQueueItemForCurrent({
        currentSongIndex: 1,
        queueItems,
        songCount: 4,
      }),
    ).toMatchObject({ status: "next", currentItem: { id: "B" }, nextItem: { id: "C" } });
    expect(
      resolveNextQueueItemForCurrent({
        currentSongIndex: 2,
        queueItems,
        songCount: 4,
      }),
    ).toMatchObject({ status: "next", currentItem: { id: "C" }, nextItem: { id: "D" } });
  });

  it("returns no-next for the final exact current item", () => {
    expect(
      resolveNextQueueItemForCurrent({
        currentSongIndex: 3,
        queueItems,
        songCount: 4,
      }),
    ).toMatchObject({ status: "no-next", currentItem: { id: "D" } });
  });

  it("does not treat a stale queue as the current playback queue", () => {
    expect(
      resolveNextQueueItemForCurrent({
        currentSongIndex: 1,
        queueItems: [item(0, "A"), item(3, "D")],
        songCount: 4,
      }),
    ).toEqual({ status: "current-not-in-queue" });
  });

  it("ignores invalid entries before and after the current item", () => {
    const decision = resolveNextQueueItemForCurrent({
      currentSongIndex: 1,
      queueItems: [item(-1), item(1, "B"), item(99), item(3, "D")],
      songCount: 4,
    });
    expect(decision).toMatchObject({
      status: "next",
      currentItem: { id: "B" },
      nextItem: { id: "D" },
      remainingItems: [{ id: "D" }],
    });
  });

  it("distinguishes an empty queue", () => {
    expect(
      resolveNextQueueItemForCurrent({
        currentSongIndex: 1,
        queueItems: [],
        songCount: 4,
      }),
    ).toEqual({ status: "empty" });
  });
});

describe("getValidQueueItemsFrom", () => {
  it("builds a valid clicked-item suffix", () => {
    expect(
      getValidQueueItemsFrom({
        currentItemId: "C",
        queueItems: [item(0, "A"), item(1, "B"), item(2, "C"), item(99), item(3, "D")],
        songCount: 4,
      }).map((queueItem) => queueItem.id),
    ).toEqual(["C", "D"]);
  });
});
