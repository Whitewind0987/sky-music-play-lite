import { useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type { Song } from "../types/score";

type UsePlaybackQueueOptions = {
  appendLog: (entry: string) => void;
  importedSongsRef: React.MutableRefObject<Song[]>;
  text: UiText["logs"];
};

export function usePlaybackQueue({
  appendLog,
  importedSongsRef,
  text,
}: UsePlaybackQueueOptions) {
  const idCounterRef = useRef(0);
  const queueItemsRef = useRef<PlaybackQueueItem[]>([]);
  const [queueItems, setQueueItems] = useState<PlaybackQueueItem[]>([]);

  function setQueueItemsAndRef(nextItems: PlaybackQueueItem[]) {
    queueItemsRef.current = nextItems;
    setQueueItems(nextItems);
  }

  function createQueueItem(songIndex: number): PlaybackQueueItem {
    idCounterRef.current += 1;

    return {
      addedAt: Date.now(),
      id: `queue-${Date.now()}-${idCounterRef.current}`,
      songIndex,
    };
  }

  function getSongName(songIndex: number) {
    return importedSongsRef.current[songIndex]?.name ?? text.queueUnknownSong;
  }

  function logAlreadyQueued(songIndex: number) {
    appendLog(
      formatText(text.queueItemAlreadyExists, {
        songName: getSongName(songIndex),
      }),
    );
  }

  function startQueuePlayback(songIndex: number) {
    const item = createQueueItem(songIndex);
    const remainingItems = queueItemsRef.current
      .slice(1)
      .filter((queueItem) => queueItem.songIndex !== songIndex);

    setQueueItemsAndRef([item, ...remainingItems]);
  }

  function replaceQueueWithCurrent(songIndex: number) {
    setQueueItemsAndRef([createQueueItem(songIndex)]);
  }

  function promoteQueueItemToCurrent(songIndex: number) {
    const currentItems = queueItemsRef.current;
    const queueItemIndex = currentItems.findIndex(
      (queueItem) => queueItem.songIndex === songIndex,
    );

    if (queueItemIndex === -1) {
      setQueueItemsAndRef([createQueueItem(songIndex)]);
      return;
    }

    setQueueItemsAndRef(currentItems.slice(queueItemIndex));
  }

  function playNext(songIndex: number) {
    if (queueItemsRef.current.some((item) => item.songIndex === songIndex)) {
      logAlreadyQueued(songIndex);
      return;
    }

    const item = createQueueItem(songIndex);
    const [currentItem, ...futureItems] = queueItemsRef.current;
    const nextItems = currentItem
      ? [currentItem, item, ...futureItems]
      : [item, ...futureItems];

    setQueueItemsAndRef(nextItems);
    appendLog(
      formatText(text.queuePlayNextAdded, {
        songName: getSongName(songIndex),
      }),
    );
  }

  function addToQueue(songIndex: number) {
    if (queueItemsRef.current.some((item) => item.songIndex === songIndex)) {
      logAlreadyQueued(songIndex);
      return;
    }

    const item = createQueueItem(songIndex);

    setQueueItemsAndRef([...queueItemsRef.current, item]);
    appendLog(
      formatText(text.queueItemAdded, {
        songName: getSongName(songIndex),
      }),
    );
  }

  function removeQueueItem(queueItemId: string) {
    const item = queueItemsRef.current.find(
      (queueItem) => queueItem.id === queueItemId,
    );

    setQueueItemsAndRef(
      queueItemsRef.current.filter((queueItem) => queueItem.id !== queueItemId),
    );

    if (item) {
      appendLog(
        formatText(text.queueItemRemoved, {
          songName: getSongName(item.songIndex),
        }),
      );
    }
  }

  function clearQueue() {
    if (queueItemsRef.current.length === 0) {
      return;
    }

    setQueueItemsAndRef([]);
    appendLog(text.queueCleared);
  }

  function removeSongIndex(deletedSongIndex: number) {
    const nextItems = queueItemsRef.current.reduce<PlaybackQueueItem[]>(
      (items, item) => {
        if (item.songIndex === deletedSongIndex) {
          return items;
        }

        items.push({
          ...item,
          songIndex:
            item.songIndex > deletedSongIndex
              ? item.songIndex - 1
              : item.songIndex,
        });

        return items;
      },
      [],
    );

    setQueueItemsAndRef(nextItems);
  }

  function consumeNextQueueItemAfterCurrent(songCount: number) {
    const currentItems = queueItemsRef.current;
    const currentItem = currentItems.find(
      (item) => item.songIndex >= 0 && item.songIndex < songCount,
    );
    const nextItemIndex = currentItems.findIndex(
      (item, index) =>
        index > 0 && item.songIndex >= 0 && item.songIndex < songCount,
    );

    if (!currentItem) {
      if (currentItems.length > 0) {
        setQueueItemsAndRef([]);
      }

      return null;
    }

    if (nextItemIndex === -1) {
      const nextItems =
        currentItems.length === 1 ? currentItems : [currentItem];

      if (nextItems.length !== currentItems.length) {
        setQueueItemsAndRef(nextItems);
      }

      return null;
    }

    const nextItem = currentItems[nextItemIndex];
    const itemsAfterNext = currentItems
      .slice(nextItemIndex + 1)
      .filter(
        (item) => item.songIndex >= 0 && item.songIndex < songCount,
      );

    setQueueItemsAndRef([nextItem, ...itemsAfterNext]);

    return nextItem;
  }

  return {
    addToQueue,
    clearQueue,
    consumeNextQueueItemAfterCurrent,
    playNext,
    promoteQueueItemToCurrent,
    queueItems,
    replaceQueueWithCurrent,
    removeSongIndex,
    removeQueueItem,
    startQueuePlayback,
  };
}
