import { useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import { getLibrarySongName } from "../lib/libraryCollections";
import {
  getValidQueueItemsFrom,
  resolveNextQueueItemForCurrent,
} from "../lib/playbackQueueDecision";
import type { LibrarySong } from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";

type UsePlaybackQueueOptions = {
  appendLog: (entry: string) => void;
  librarySongsRef: React.MutableRefObject<LibrarySong[]>;
  showNotice?: (message: string) => void;
  text: UiText["logs"];
};

export function createReplacementPlaybackQueue(
  songIndices: number[],
  songCount: number,
  createQueueItem: (songIndex: number) => PlaybackQueueItem,
) {
  return songIndices
    .filter(
      (songIndex) =>
        Number.isInteger(songIndex) && songIndex >= 0 && songIndex < songCount,
    )
    .map(createQueueItem);
}

export function setPlaybackQueueCurrent(
  queueItems: PlaybackQueueItem[],
  songIndex: number,
  previousSongIndex: number | null,
  createQueueItem: (songIndex: number) => PlaybackQueueItem,
) {
  const current = queueItems.find((item) => item.songIndex === songIndex);
  const remaining = queueItems.filter(
    (item, index) =>
      item.songIndex !== songIndex &&
      (index !== 0 || item.songIndex !== previousSongIndex),
  );

  if (current && current === queueItems[0] && remaining.length === queueItems.length - 1) {
    return queueItems;
  }
  return [current ?? createQueueItem(songIndex), ...remaining];
}

export function addSongToPlaybackQueue(
  queueItems: PlaybackQueueItem[],
  songIndex: number,
  createQueueItem: (songIndex: number) => PlaybackQueueItem,
) {
  return queueItems.some((item) => item.songIndex === songIndex)
    ? queueItems
    : [...queueItems, createQueueItem(songIndex)];
}

export function playSongNextInPlaybackQueue(
  queueItems: PlaybackQueueItem[],
  songIndex: number,
  createQueueItem: (songIndex: number) => PlaybackQueueItem,
  afterSongIndex: number | null = null,
) {
  if (queueItems.some((item) => item.songIndex === songIndex)) {
    return queueItems;
  }

  const currentIndex = queueItems.findIndex((item) => item.songIndex === afterSongIndex);
  const insertAt = afterSongIndex === null ? 1 : currentIndex + 1;
  return [...queueItems.slice(0, insertAt), createQueueItem(songIndex), ...queueItems.slice(insertAt)];
}

export function removeSongIndicesFromPlaybackQueue(
  queueItems: PlaybackQueueItem[],
  removedSongIndices: number[],
) {
  const normalizedRemovedIndices = Array.from(
    new Set(
      removedSongIndices.filter(
        (songIndex) => Number.isInteger(songIndex) && songIndex >= 0,
      ),
    ),
  ).sort((left, right) => left - right);

  if (normalizedRemovedIndices.length === 0) {
    return queueItems;
  }

  const removedIndexSet = new Set(normalizedRemovedIndices);
  let hasChanged = false;
  const nextItems = queueItems.reduce<PlaybackQueueItem[]>((items, item) => {
    if (removedIndexSet.has(item.songIndex)) {
      hasChanged = true;
      return items;
    }

    const removedBeforeItemCount = normalizedRemovedIndices.findIndex(
      (removedSongIndex) => removedSongIndex >= item.songIndex,
    );
    const songIndexOffset =
      removedBeforeItemCount === -1
        ? normalizedRemovedIndices.length
        : removedBeforeItemCount;

    if (songIndexOffset === 0) {
      items.push(item);
      return items;
    }

    hasChanged = true;
    items.push({ ...item, songIndex: item.songIndex - songIndexOffset });
    return items;
  }, []);

  return hasChanged ? nextItems : queueItems;
}

export function usePlaybackQueue({
  appendLog,
  librarySongsRef,
  showNotice,
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
    const librarySong = librarySongsRef.current[songIndex];

    return librarySong
      ? getLibrarySongName(librarySong)
      : text.queueUnknownSong;
  }

  function logAlreadyQueued(songIndex: number) {
    const message = formatText(text.queueItemAlreadyExists, {
      songName: getSongName(songIndex),
    });

    appendLog(message);
    showNotice?.(message);
  }

  function startQueuePlayback(songIndex: number, previousSongIndex: number | null) {
    setQueueItemsAndRef(
      setPlaybackQueueCurrent(queueItemsRef.current, songIndex, previousSongIndex, createQueueItem),
    );
  }

  function replaceQueueWithSongIndices(songIndices: number[]) {
    setQueueItemsAndRef(
      createReplacementPlaybackQueue(
        songIndices,
        librarySongsRef.current.length,
        createQueueItem,
      ),
    );
  }

  function playNext(songIndex: number, afterSongIndex: number | null, isIdle: boolean) {
    if (!librarySongsRef.current[songIndex]) return;
    const nextItems = isIdle
      ? addSongToPlaybackQueue(queueItemsRef.current, songIndex, createQueueItem)
      : playSongNextInPlaybackQueue(queueItemsRef.current, songIndex, createQueueItem, afterSongIndex);
    if (nextItems === queueItemsRef.current) {
      if (!isIdle) logAlreadyQueued(songIndex);
    } else {
      setQueueItemsAndRef(nextItems);
      appendLog(
        formatText(text.queuePlayNextAdded, {
          songName: getSongName(songIndex),
        }),
      );
    }

    return nextItems.find((item) => item.songIndex === songIndex);
  }

  function addToQueue(songIndex: number) {
    if (!librarySongsRef.current[songIndex]) return;
    const nextItems = addSongToPlaybackQueue(
      queueItemsRef.current,
      songIndex,
      createQueueItem,
    );
    if (nextItems === queueItemsRef.current) {
      logAlreadyQueued(songIndex);
      return;
    }

    setQueueItemsAndRef(nextItems);
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
    removeSongIndices([deletedSongIndex]);
  }

  function removeSongIndices(removedSongIndices: number[]) {
    const nextItems = removeSongIndicesFromPlaybackQueue(
      queueItemsRef.current,
      removedSongIndices,
    );

    if (nextItems !== queueItemsRef.current) {
      setQueueItemsAndRef(nextItems);
    }
  }

  function getFirstQueueItem() {
    const songs = librarySongsRef.current;
    return queueItemsRef.current.find((item) => songs[item.songIndex]) ?? null;
  }

  function getValidQueueItems() {
    return getValidQueueItemsFromItem(getFirstQueueItem()?.id ?? "", librarySongsRef.current.length);
  }

  function peekNextQueueItemAfterCurrent(currentSongIndex: number, songCount: number) {
    const firstItem = getFirstQueueItem();
    if (firstItem?.songIndex !== currentSongIndex) {
      return firstItem;
    }
    const decision = resolveNextQueueForCurrent(currentSongIndex, songCount);
    return decision.status === "next" ? decision.nextItem : null;
  }

  function resolveNextQueueForCurrent(
    currentSongIndex: number,
    songCount: number,
  ) {
    return resolveNextQueueItemForCurrent({
      currentSongIndex,
      queueItems: queueItemsRef.current,
      songCount,
    });
  }

  function getValidQueueItemsFromItem(
    currentItemId: string,
    songCount: number,
  ) {
    return getValidQueueItemsFrom({
      currentItemId,
      queueItems: queueItemsRef.current,
      songCount,
    });
  }

  function getQueueItemCount() {
    return queueItemsRef.current.length;
  }

  function consumeQueuedItemAfterCurrent(
    queueItemId: string,
    songCount: number,
  ) {
    const currentItems = queueItemsRef.current;
    const remainingItems = getValidQueueItemsFromItem(queueItemId, songCount);
    if (remainingItems.length > 0 && remainingItems.length !== currentItems.length) {
      setQueueItemsAndRef(remainingItems);
    }

    return remainingItems[0] ?? null;
  }

  return {
    addToQueue,
    clearQueue,
    consumeQueuedItemAfterCurrent,
    getFirstQueueItem,
    getValidQueueItems,
    getValidQueueItemsFromItem,
    getQueueItemCount,
    peekNextQueueItemAfterCurrent,
    playNext,
    queueItems,
    replaceQueueWithSongIndices,
    resolveNextQueueForCurrent,
    removeSongIndex,
    removeSongIndices,
    removeQueueItem,
    startQueuePlayback,
  };
}
