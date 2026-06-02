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

  function playNext(songIndex: number) {
    if (queueItemsRef.current.some((item) => item.songIndex === songIndex)) {
      appendLog(
        formatText(text.queueItemAlreadyExists, {
          songName: getSongName(songIndex),
        }),
      );
      return;
    }

    const item = createQueueItem(songIndex);

    setQueueItemsAndRef([item, ...queueItemsRef.current]);
    appendLog(
      formatText(text.queuePlayNextAdded, {
        songName: getSongName(songIndex),
      }),
    );
  }

  function addToQueue(songIndex: number) {
    if (queueItemsRef.current.some((item) => item.songIndex === songIndex)) {
      appendLog(
        formatText(text.queueItemAlreadyExists, {
          songName: getSongName(songIndex),
        }),
      );
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

  function consumeNextQueueItem(songCount: number) {
    const currentItems = queueItemsRef.current;
    const nextItemIndex = currentItems.findIndex(
      (item) => item.songIndex >= 0 && item.songIndex < songCount,
    );

    if (nextItemIndex === -1) {
      if (currentItems.length > 0) {
        setQueueItemsAndRef([]);
      }

      return null;
    }

    const nextItem = currentItems[nextItemIndex];

    setQueueItemsAndRef(currentItems.slice(nextItemIndex + 1));

    return nextItem;
  }

  return {
    addToQueue,
    clearQueue,
    consumeNextQueueItem,
    playNext,
    queueItems,
    removeQueueItem,
  };
}
