import type { LibrarySong, LibrarySongId } from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";

export type QueueNextDecision =
  | {
      status: "next";
      currentItem: PlaybackQueueItem;
      nextItem: PlaybackQueueItem;
      remainingItems: PlaybackQueueItem[];
    }
  | { status: "no-next"; currentItem: PlaybackQueueItem }
  | { status: "current-not-in-queue" }
  | { status: "empty" };

function isValidQueueItem(item: PlaybackQueueItem, songCount: number) {
  return item.songIndex >= 0 && item.songIndex < songCount;
}

export function resolveNextQueueItemForCurrent({
  currentSongIndex,
  queueItems,
  songCount,
}: {
  currentSongIndex: number;
  queueItems: PlaybackQueueItem[];
  songCount: number;
}): QueueNextDecision {
  if (queueItems.length === 0) {
    return { status: "empty" };
  }

  const currentItemIndex = queueItems.findIndex(
    (item) =>
      isValidQueueItem(item, songCount) &&
      item.songIndex === currentSongIndex,
  );
  if (currentItemIndex === -1) {
    return { status: "current-not-in-queue" };
  }

  const currentItem = queueItems[currentItemIndex];
  const remainingItems = queueItems
    .slice(currentItemIndex + 1)
    .filter((item) => isValidQueueItem(item, songCount));
  const nextItem = remainingItems[0];

  return nextItem
    ? { status: "next", currentItem, nextItem, remainingItems }
    : { status: "no-next", currentItem };
}

export function getValidQueueItemsFrom({
  currentItemId,
  queueItems,
  songCount,
}: {
  currentItemId: string;
  queueItems: PlaybackQueueItem[];
  songCount: number;
}) {
  const currentItemIndex = queueItems.findIndex(
    (item) =>
      item.id === currentItemId && isValidQueueItem(item, songCount),
  );
  return currentItemIndex === -1
    ? []
    : queueItems
        .slice(currentItemIndex)
        .filter((item) => isValidQueueItem(item, songCount));
}

export function getQueueSongIds(
  queueItems: PlaybackQueueItem[],
  librarySongs: LibrarySong[],
): LibrarySongId[] {
  return queueItems.flatMap((item) => {
    const songId = librarySongs[item.songIndex]?.id;
    return songId ? [songId] : [];
  });
}
