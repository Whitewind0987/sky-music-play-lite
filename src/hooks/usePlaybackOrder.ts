import { useRef } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type {
  LibrarySong,
  LibrarySongId,
  LibrarySongListItem,
} from "../types/library";
import type { PlaybackMode } from "../types/playbackOptions";
import {
  PlaybackContextTransactionStore,
  removeSongFromActivePlaybackContext,
  type ActivePlaybackContext,
  type PlaybackContextTransaction,
} from "../lib/playbackContextTransaction";

export type { ActivePlaybackContext, PlaybackContextTransaction };

type PlaybackOrderNextOptions = {
  currentSongIndex: number;
  currentSongId?: LibrarySongId | null;
  isShuffleEnabled: boolean;
  librarySongs: LibrarySong[];
  playbackMode: PlaybackMode;
};

export type PlaybackOrderNextDecision =
  | { status: "next"; songId: LibrarySongId; songIndex: number }
  | { status: "end-of-order" }
  | {
      status: "context-unavailable";
      reason: "empty-order" | "missing-context" | "missing-current-song";
    };

export function usePlaybackOrder() {
  const activePlaybackContextRef = useRef<ActivePlaybackContext | null>(null);
  const transactionStoreRef = useRef<PlaybackContextTransactionStore | null>(
    null,
  );
  if (!transactionStoreRef.current) {
    transactionStoreRef.current = new PlaybackContextTransactionStore();
  }

  function syncContextRef() {
    activePlaybackContextRef.current = transactionStoreRef.current!.getContext();
  }

  function buildPlaybackContext({
    currentSongId,
    selectedCategory,
    songIds,
    usesSearch,
  }: {
    currentSongId: LibrarySongId;
    selectedCategory: LibraryCategoryId;
    songIds: LibrarySongId[];
    usesSearch: boolean;
  }): ActivePlaybackContext {
    return {
      currentSongId,
      songIds,
      source: usesSearch ? "search" : normalizeCategorySource(selectedCategory),
    };
  }

  function setPlaybackContext({
    currentSongId,
    selectedCategory,
    songIds,
    usesSearch,
  }: {
    currentSongId: LibrarySongId;
    selectedCategory: LibraryCategoryId;
    songIds: LibrarySongId[];
    usesSearch: boolean;
  }) {
    transactionStoreRef.current!.replace(
      buildPlaybackContext({
        currentSongId,
        selectedCategory,
        songIds,
        usesSearch,
      }),
    );
    syncContextRef();
  }

  function beginPlaybackContext(
    options: Parameters<typeof buildPlaybackContext>[0],
  ) {
    const transaction = transactionStoreRef.current!.begin(
      buildPlaybackContext(options),
    );
    syncContextRef();
    return transaction;
  }

  function beginPlaybackContextValue(context: ActivePlaybackContext) {
    const transaction = transactionStoreRef.current!.begin(context);
    syncContextRef();
    return transaction;
  }

  function beginCurrentSongTransaction(songId: LibrarySongId) {
    const transaction = transactionStoreRef.current!.beginCurrentSong(songId);
    syncContextRef();
    return transaction;
  }

  function commitPlaybackContext(transaction: PlaybackContextTransaction) {
    const didCommit = transactionStoreRef.current!.commit(transaction);
    syncContextRef();
    return didCommit;
  }

  function rollbackPlaybackContext(transaction: PlaybackContextTransaction) {
    const didRollback = transactionStoreRef.current!.rollback(transaction);
    syncContextRef();
    return didRollback;
  }

  function clearPlaybackContext() {
    transactionStoreRef.current!.replace(null);
    syncContextRef();
  }

  function removeSongFromPlaybackContext(songId: LibrarySongId) {
    transactionStoreRef.current!.removeSong(songId);
    syncContextRef();
  }

  function markCurrentSong(songId: LibrarySongId) {
    transactionStoreRef.current!.markCurrentSong(songId);
    syncContextRef();
  }

  function getCurrentPlaybackContextSongId() {
    return transactionStoreRef.current!.getCurrentSongId();
  }

  function getNextPlaybackOrderDecision(
    options: PlaybackOrderNextOptions,
  ): PlaybackOrderNextDecision {
    return resolvePlaybackOrderNextDecision({
      ...options,
      context: transactionStoreRef.current!.getContext(),
    });
  }

  function getNextPlaybackOrderSongIndex({
    currentSongIndex,
    isShuffleEnabled,
    librarySongs,
    playbackMode,
  }: PlaybackOrderNextOptions) {
    const decision = getNextPlaybackOrderDecision({
      currentSongIndex,
      isShuffleEnabled,
      librarySongs,
      playbackMode,
    });
    return decision.status === "next" ? decision.songIndex : null;
  }

  return {
    beginCurrentSongTransaction,
    beginPlaybackContext,
    beginPlaybackContextValue,
    commitPlaybackContext,
    activePlaybackContextRef,
    clearPlaybackContext,
    getCurrentPlaybackContextSongId,
    getNextPlaybackOrderDecision,
    getNextPlaybackOrderSongIndex,
    markCurrentSong,
    removeSongFromPlaybackContext,
    rollbackPlaybackContext,
    setPlaybackContext,
  };
}

export { removeSongFromActivePlaybackContext };

export function resolvePlaybackOrderNextDecision({
  context,
  currentSongId: explicitCurrentSongId,
  currentSongIndex,
  isShuffleEnabled,
  librarySongs,
  playbackMode,
}: PlaybackOrderNextOptions & {
  context: ActivePlaybackContext | null;
}): PlaybackOrderNextDecision {
  if (!context) {
    return { status: "context-unavailable", reason: "missing-context" };
  }

  const visibleSongIds = context.songIds.filter((songId) =>
    librarySongs.some((librarySong) => librarySong.id === songId),
  );
  if (visibleSongIds.length === 0) {
    return { status: "context-unavailable", reason: "empty-order" };
  }

  const currentSongId =
    explicitCurrentSongId ??
    librarySongs[currentSongIndex]?.id ??
    context.currentSongId;
  const currentPosition = visibleSongIds.indexOf(currentSongId);
  if (currentPosition === -1) {
    return { status: "context-unavailable", reason: "missing-current-song" };
  }

  const nextSongId =
    isShuffleEnabled && playbackMode === "repeat-all"
      ? getRandomNextSongId(visibleSongIds, currentSongId)
      : getOrderedNextSongId(visibleSongIds, currentPosition, playbackMode);
  if (nextSongId === null) {
    return { status: "end-of-order" };
  }

  const songIndex = librarySongs.findIndex(
    (librarySong) => librarySong.id === nextSongId,
  );
  return songIndex === -1
    ? { status: "context-unavailable", reason: "missing-current-song" }
    : { status: "next", songId: nextSongId, songIndex };
}

export function buildPlaybackOrderFromVisibleItems(
  items: LibrarySongListItem[],
  _clickedSongId: LibrarySongId,
  _options: { usesSearch: boolean },
) {
  return items.map((item) => item.librarySong.id);
}

function normalizeCategorySource(
  selectedCategory: LibraryCategoryId,
): ActivePlaybackContext["source"] {
  if (selectedCategory === "liked" || selectedCategory === "playlists") {
    return selectedCategory === "liked" ? "liked" : "playlist";
  }

  return "local-imports";
}

export function getOrderedNextSongId(
  songIds: LibrarySongId[],
  currentPosition: number,
  playbackMode: PlaybackMode,
) {
  const nextSongId = songIds[currentPosition + 1];

  if (nextSongId) {
    return nextSongId;
  }

  return playbackMode === "repeat-all" ? songIds[0] ?? null : null;
}

function getRandomNextSongId(
  songIds: LibrarySongId[],
  currentSongId: LibrarySongId,
) {
  if (songIds.length <= 1) {
    return songIds[0] ?? null;
  }

  let nextSongId = currentSongId;

  while (nextSongId === currentSongId) {
    nextSongId = songIds[Math.floor(Math.random() * songIds.length)];
  }

  return nextSongId;
}
