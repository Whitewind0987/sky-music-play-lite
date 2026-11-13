import { useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import { getLibrarySongName } from "../lib/libraryCollections";
import { resolveManualNextCurrentSong } from "../lib/manualNextPlayback";
import {
  runPlaybackContextTransaction,
  type PlaybackContextTransaction,
} from "../lib/playbackContextTransaction";
import { getQueueSongIds } from "../lib/playbackQueueDecision";
import { resolvePlaylistSongIndices } from "../lib/playlistPlayback";
import type { LibrarySongId, LibrarySongListItem } from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type { useExperimentalInput } from "./useExperimentalInput";
import {
  buildPlaybackOrderFromVisibleItems,
  type usePlaybackOrder,
} from "./usePlaybackOrder";
import type { usePlaybackOutput } from "./usePlaybackOutput";
import type { usePlaybackQueue } from "./usePlaybackQueue";
import type { useScoreLibrary } from "./useScoreLibrary";

type ExperimentalInputController = ReturnType<typeof useExperimentalInput>;
type PlaybackOrderController = ReturnType<typeof usePlaybackOrder>;
type PlaybackOutputController = ReturnType<typeof usePlaybackOutput>;
type PlaybackQueueController = ReturnType<typeof usePlaybackQueue>;
type ScoreLibraryController = ReturnType<typeof useScoreLibrary>;

type UsePlaybackCoordinatorOptions = {
  appendLog: (entry: string) => void;
  onManualNextDecision?: (details: Record<string, unknown>) => void;
  experimentalInput: ExperimentalInputController;
  playbackOrder: PlaybackOrderController;
  playbackOutput: PlaybackOutputController;
  playbackQueue: PlaybackQueueController;
  scoreLibrary: ScoreLibraryController;
  text: UiText;
};

export function usePlaybackCoordinator({
  appendLog,
  onManualNextDecision,
  experimentalInput,
  playbackOrder,
  playbackOutput,
  playbackQueue,
  scoreLibrary,
  text,
}: UsePlaybackCoordinatorOptions) {
  const currentPlaybackLibrarySong = scoreLibrary.currentPlaybackLibrarySong;
  const pendingStartRef = useRef<{
    transaction: PlaybackContextTransaction;
    songId: LibrarySongId;
    previousSongId: LibrarySongId | null;
    isQueuePriority: boolean;
  } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const firstQueueItem = playbackQueue.getFirstQueueItem();
  const currentOrSelectedLibrarySong =
    currentPlaybackLibrarySong ??
    (scoreLibrary.selectedSongIndex === null
      ? null
      : scoreLibrary.librarySongs[scoreLibrary.selectedSongIndex] ?? null);
  const isCurrentSongLoading =
    currentOrSelectedLibrarySong !== null &&
    scoreLibrary.isSongLoading(currentOrSelectedLibrarySong.id);
  const canPlay =
    playbackOutput.canPlay && !isStarting &&
    ((playbackOutput.canStartQueue && firstQueueItem !== null) || !isCurrentSongLoading);

  async function ensureTargetWindowReadyForPlayback() {
    if (
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: playbackOutput.mode,
        selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
      })
    ) {
      return true;
    }

    return (await experimentalInput.ensureTargetWindowAvailableForPlayback()) !== null;
  }

  async function startWithContext(
    songId: LibrarySongId,
    transaction: PlaybackContextTransaction,
    onStarted: (songIndex: number) => void,
    isQueuePriority = false,
  ) {
    const previousSongId = getPreviousSongId();
    const request = { transaction, songId, previousSongId, isQueuePriority };
    pendingStartRef.current = request;
    setIsStarting(true);
    let didStart = false;
    try {
      const result = await runPlaybackContextTransaction({
        commit: () => {
          const songIndex = findSongIndex(songId);
          if (pendingStartRef.current !== request || songIndex < 0) {
            playbackOrder.rollbackPlaybackContext(transaction);
            return false;
          }
          if (!playbackOrder.commitPlaybackContext(transaction)) {
            return false;
          }
          onStarted(songIndex);
          return true;
        },
        rollback: playbackOrder.rollbackPlaybackContext,
        start: async () => {
          if (
            !(await ensureTargetWindowReadyForPlayback()) ||
            pendingStartRef.current !== request ||
            playbackOrder.getPendingPlaybackContextSongId() !== songId
          ) {
            return false;
          }
          const songIndex = findSongIndex(songId);
          return songIndex >= 0 && await playbackOutput.onPlaySong(songIndex);
        },
        transaction,
      });
      didStart = result === "started";
      return didStart;
    } finally {
      if (pendingStartRef.current === request) {
        pendingStartRef.current = null;
        setIsStarting(false);
        if (!didStart && request.isQueuePriority) {
          restorePriorityPlaybackSong(request.previousSongId);
        }
      }
    }
  }

  function findSongIndex(songId: LibrarySongId) {
    return scoreLibrary.librarySongsRef.current.findIndex((song) => song.id === songId);
  }

  function getPreviousSongId() {
    return pendingStartRef.current
      ? pendingStartRef.current.previousSongId
      : scoreLibrary.currentPlaybackLibrarySong?.id ?? null;
  }

  async function handlePlayLibraryItem(item: LibrarySongListItem) {
    const songId = item.librarySong.id;
    const previousSongId = getPreviousSongId();
    await startWithContext(
      songId,
      playbackOrder.beginPlaybackContext(getPlaybackContextOptions(item)),
      (songIndex) => {
        scoreLibrary.setSelectedSongId(songId);
        playbackQueue.startQueuePlayback(
          songIndex,
          previousSongId === null ? null : findSongIndex(previousSongId),
        );
      },
    );
  }

  async function handlePlayAllPlaylist() {
    const selectedPlaylist = scoreLibrary.selectedPlaylist;
    const songs = scoreLibrary.librarySongsRef.current;
    if (!selectedPlaylist) {
      return;
    }

    const songIndices = resolvePlaylistSongIndices(
      selectedPlaylist.songIds,
      songs,
    );
    const firstSongIndex = songIndices[0];
    const firstSong =
      firstSongIndex === undefined ? undefined : songs[firstSongIndex];
    if (!firstSong) {
      return;
    }

    const playlistSongIds = songIndices.map((songIndex) => songs[songIndex]!.id);
    const transaction = playbackOrder.beginPlaybackContextValue({
      currentSongId: firstSong.id,
      songIds: playlistSongIds,
      source: "playlist",
    });
    await startWithContext(firstSong.id, transaction, () => {
      playbackQueue.replaceQueueWithSongIndices(
        resolvePlaylistSongIndices(playlistSongIds, scoreLibrary.librarySongsRef.current),
      );
      scoreLibrary.setSelectedSongId(firstSong.id);
    });
  }

  async function startQueueItem(
    queueItem: PlaybackQueueItem,
    behavior: "resume" | "jump",
  ) {
    const songs = scoreLibrary.librarySongsRef.current;
    const queueContextItems = playbackQueue.getValidQueueItemsFromItem(
      queueItem.id,
      songs.length,
    );
    const queueContextSongIds = getQueueSongIds(queueContextItems, songs);
    const currentSongId = queueContextSongIds[0];
    if (!currentSongId) {
      return;
    }

    const resumesCurrentSong = behavior === "resume" && (
      scoreLibrary.currentPlaybackLibrarySong?.id === currentSongId ||
      playbackOrder.getCommittedPlaybackContextSongId() === currentSongId
    );
    const existingTransaction = resumesCurrentSong
      ? playbackOrder.beginCurrentSongTransaction(currentSongId)
      : null;
    const transaction = existingTransaction ?? playbackOrder.beginPlaybackContextValue({
      currentSongId, songIds: queueContextSongIds, source: "queue",
    });
    await startWithContext(currentSongId, transaction, () => {
      scoreLibrary.setSelectedSongId(currentSongId);
      playbackQueue.consumeQueuedItemAfterCurrent(
        queueItem.id, scoreLibrary.librarySongsRef.current.length,
      );
    });
  }

  function handlePlayQueueItem(queueItem: PlaybackQueueItem) {
    return startQueueItem(queueItem, "jump");
  }

  async function startQueueWhenIdle() {
    if (!playbackOutput.canStartQueue || pendingStartRef.current !== null) {
      return;
    }
    const firstItem = playbackQueue.getFirstQueueItem();
    if (firstItem) {
      await startQueueItem(firstItem, "resume");
    }
  }

  function handleAddSongToQueue(songIndex: number, allowStart = true) {
    playbackQueue.addToQueue(songIndex);
    if (allowStart) return startQueueWhenIdle();
  }

  function handlePlaySongNext(songIndex: number, allowStart = true) {
    const songs = scoreLibrary.librarySongsRef.current;
    const songId = songs[songIndex]?.id;
    if (!songId) return;

    const pendingStart = pendingStartRef.current;
    const canPrioritize = pendingStart
      ? pendingStart.isQueuePriority
      : playbackOutput.canStartQueue;
    if (allowStart && canPrioritize) {
      if (pendingStart?.songId === songId) return;
      if (pendingStart) {
        // Cancel the old output request while retaining its original playback identity.
        playbackOutput.onStop();
        restorePriorityPlaybackSong(pendingStart.previousSongId);
      }

      const songIds = getQueueSongIds(playbackQueue.getValidQueueItems(), songs);
      const transaction = playbackOrder.beginPlaybackContextValue({
        currentSongId: songId,
        songIds: [songId, ...songIds.filter((id) => id !== songId)],
        source: "queue",
      });
      // Promote against the live queue only after the output accepts the start.
      return startWithContext(songId, transaction, (acceptedSongIndex) => {
        playbackQueue.startQueuePlayback(acceptedSongIndex, null);
        scoreLibrary.setSelectedSongId(songId);
        syncQueuePlaybackOrder(songId);
      }, true);
    }

    const afterSongIndex = pendingStart
      ? findSongIndex(pendingStart.songId)
      : scoreLibrary.playbackSongIndex;
    const reordered = playbackQueue.playNext(songIndex, afterSongIndex);
    const currentSongId = afterSongIndex === null ? null : songs[afterSongIndex]?.id;
    if (reordered && !pendingStart && currentSongId) {
      syncQueuePlaybackOrder(currentSongId);
    }
  }

  function syncQueuePlaybackOrder(currentSongId: LibrarySongId) {
    const songIds = getQueueSongIds(
      playbackQueue.getValidQueueItems(), scoreLibrary.librarySongsRef.current,
    );
    playbackOrder.updateQueuePlaybackOrder(currentSongId, songIds);
  }

  function handleRemoveFromLiked(songId: LibrarySongId) {
    const shouldClear =
      scoreLibrary.selectedLibraryCategory === "liked" &&
      scoreLibrary.selectedSongId === songId;

    scoreLibrary.handleRemoveFromLiked(songId);

    if (shouldClear) {
      clearCurrentPlaybackSelection();
    }
  }

  function handleRemoveSongFromPlaylist(
    playlistId: string,
    songId: LibrarySongId,
  ) {
    const shouldClear =
      scoreLibrary.selectedLibraryCategory === "playlists" &&
      scoreLibrary.selectedPlaylistId === playlistId &&
      scoreLibrary.selectedSongId === songId;

    scoreLibrary.handleRemoveSongFromPlaylist(playlistId, songId);

    if (shouldClear) {
      clearCurrentPlaybackSelection();
    }
  }

  function handleToggleLikedSong(songIndex: number) {
    const toggledSong = scoreLibrary.librarySongs[songIndex];
    const isCurrentlyLiked =
      toggledSong !== undefined &&
      scoreLibrary.likedSongs.some(
        (entry) => entry.songId === toggledSong.id,
      );
    const shouldClear =
      scoreLibrary.selectedLibraryCategory === "liked" &&
      isCurrentlyLiked &&
      scoreLibrary.selectedSongId === toggledSong?.id;

    scoreLibrary.handleToggleLikedSong(songIndex);

    if (shouldClear) {
      clearCurrentPlaybackSelection();
    }
  }

  async function handleNextPlayback() {
    const startAtRequest = pendingStartRef.current;
    const songs = scoreLibrary.librarySongsRef.current;
    const activeForegroundSongId =
      experimentalInput.getActiveForegroundPlaybackSongId();
    const activeTargetWindowSongId =
      experimentalInput.getActiveTargetWindowPlaybackSongId();
    const pendingPlaybackContextSongId =
      playbackOrder.getPendingPlaybackContextSongId();
    const effectivePlaybackContextSongId =
      scoreLibrary.currentPlaybackLibrarySong?.id ??
      playbackOrder.getCurrentPlaybackContextSongId();
    const currentSongResolution = resolveManualNextCurrentSong({
      activeForegroundSongId,
      activeTargetWindowSongId,
      contextSongId: effectivePlaybackContextSongId,
      librarySongs: songs,
      pendingContextSongId: pendingPlaybackContextSongId,
      playbackSongIndex: scoreLibrary.playbackSongIndex,
      selectedSongIndex: scoreLibrary.selectedSongIndex,
    });
    const currentSongIndex =
      currentSongResolution.status === "resolved"
        ? currentSongResolution.songIndex
        : null;
    const queueDecision =
      currentSongIndex === null
        ? { status: "current-unavailable" as const }
        : playbackQueue.resolveNextQueueForCurrent(
            currentSongIndex,
            songs.length,
          );
    const queuedItem = queueDecision.status === "next"
      ? queueDecision.nextItem
      : queueDecision.status === "current-not-in-queue" ||
          queueDecision.status === "current-unavailable"
        ? playbackQueue.getFirstQueueItem()
        : null;

    const playbackOrderDecision =
      queuedItem !== null
        ? null
        : currentSongResolution.status === "resolved"
        ? playbackOrder.getNextPlaybackOrderDecision({
            currentSongId: currentSongResolution.songId,
            currentSongIndex: currentSongResolution.songIndex,
            isShuffleEnabled: playbackOutput.isShuffleEnabled,
            librarySongs: songs,
            playbackMode: playbackOutput.playbackMode,
          })
        : {
            status: "context-unavailable" as const,
            reason: currentSongResolution.reason,
          };

    const nextSongIndex =
      queuedItem?.songIndex ??
      (playbackOrderDecision?.status === "next"
        ? playbackOrderDecision.songIndex
        : null);
    const queueContextSongIds = queuedItem
      ? getQueueSongIds(playbackQueue.getValidQueueItemsFromItem(queuedItem.id, songs.length), songs)
      : [];
    onManualNextDecision?.({
      outputMode: playbackOutput.mode,
      activeForegroundSongId,
      activeTargetWindowSongId,
      playbackContextSongId: effectivePlaybackContextSongId,
      pendingPlaybackContextSongId,
      effectivePlaybackContextSongId,
      committedPlaybackContextSongId:
        playbackOrder.getCommittedPlaybackContextSongId(),
      hasPendingPlaybackContextTransaction:
        playbackOrder.hasPendingPlaybackContextTransaction(),
      playbackSongIndex: scoreLibrary.playbackSongIndex,
      selectedSongIndex: scoreLibrary.selectedSongIndex,
      contextStatus: currentSongResolution.status,
      currentSongResolution,
      currentSongResolutionSource: currentSongResolution.source,
      actualCurrentSongId:
        currentSongResolution.status === "resolved"
          ? currentSongResolution.songId
          : null,
      actualCurrentSongIndex: currentSongIndex,
      queueDecisionStatus: queueDecision.status,
      matchedQueueCurrentItemId:
        queueDecision.status === "next" || queueDecision.status === "no-next"
          ? queueDecision.currentItem.id
          : null,
      matchedQueueCurrentSongIndex:
        queueDecision.status === "next" || queueDecision.status === "no-next"
          ? queueDecision.currentItem.songIndex
          : null,
      queueItemCount: playbackQueue.getQueueItemCount(),
      queueDerivedContextSongIds: queueContextSongIds,
      finalNextSource:
        nextSongIndex === null
          ? null
          : queuedItem
            ? "queue"
            : "playback-order",
      decisionStatus: playbackOrderDecision?.status ?? "queue-next",
      decisionReason:
        playbackOrderDecision?.status === "context-unavailable"
          ? playbackOrderDecision.reason
          : null,
      playbackOrderDecision,
      nextSongId: nextSongIndex === null ? null : songs[nextSongIndex]?.id ?? null,
      nextSongIndex,
      queueCandidateId: queuedItem?.id ?? null,
      queueCandidateSongId:
        queuedItem === null ? null : songs[queuedItem.songIndex]?.id ?? null,
      queueCandidateSongIndex: queuedItem?.songIndex ?? null,
    });

    if (playbackOrderDecision?.status === "context-unavailable") {
      return;
    }

    if (nextSongIndex === null) {
      if (
        !(await ensureTargetWindowReadyForPlayback()) ||
        pendingStartRef.current !== startAtRequest
      ) {
        return;
      }
      playbackOrder.clearPlaybackContext();
      handleStopPlayback();
      appendLog(text.logs.manualNextUnavailable);
      return;
    }

    appendLog(
      formatText(text.logs.manualNextTriggered, {
        songName: songs[nextSongIndex]
          ? getLibrarySongName(songs[nextSongIndex])
          : text.logs.queueUnknownSong,
      }),
    );
    const nextSongId = songs[nextSongIndex]?.id;
    if (!nextSongId) {
      return;
    }
    const transaction = queuedItem
      ? playbackOrder.beginPlaybackContextValue({
          currentSongId: nextSongId,
          songIds: queueContextSongIds,
          source: "queue",
        })
      : playbackOrder.beginCurrentSongTransaction(nextSongId);
    if (!transaction) {
      return;
    }
    await startWithContext(nextSongId, transaction, (songIndex) => {
      if (queuedItem) {
        if (startAtRequest) {
          playbackQueue.consumeQueuedItemAfterCurrent(
            queuedItem.id,
            scoreLibrary.librarySongsRef.current.length,
          );
        } else {
          const previousSongId = currentSongResolution.status === "resolved"
            ? currentSongResolution.songId
            : null;
          playbackQueue.advanceQueuePlayback(queuedItem.id, previousSongId);
          syncQueuePlaybackOrder(nextSongId);
        }
      } else {
        const previousSongIndex = currentSongResolution.status === "resolved"
          ? findSongIndex(currentSongResolution.songId)
          : null;
        playbackQueue.startQueuePlayback(songIndex, previousSongIndex);
      }
    });
  }

  async function handleBottomPlayerPlay() {
    if (pendingStartRef.current !== null) {
      return;
    }

    if (playbackOutput.playbackState === "paused") {
      playbackOutput.onResume();
      return;
    }

    if (
      playbackOutput.manualState === "active" ||
      playbackOutput.manualState === "tail"
    ) {
      if (await ensureTargetWindowReadyForPlayback()) {
        await playbackOutput.onPlay();
      }
      return;
    }

    if (!playbackOutput.canPlay) {
      return;
    }

    if (playbackQueue.getFirstQueueItem()) {
      await startQueueWhenIdle();
      return;
    }

    if (
      scoreLibrary.selectedSongId === null ||
      scoreLibrary.selectedSongIndex === null
    ) {
      playbackOutput.onPlay();
      return;
    }

    const selectedVisibleItem = getCurrentDisplayedLibraryItems().find(
      (item) => item.librarySong.id === scoreLibrary.selectedSongId,
    );

    if (!selectedVisibleItem) {
      clearCurrentPlaybackSelection();
      appendLog(text.logs.selectedSongNotInCurrentView);
      return;
    }

    await handlePlayLibraryItem(selectedVisibleItem);
  }

  function handleQueueItemRemove(queueItemId: string) {
    const queueItems = playbackQueue.getValidQueueItems();
    const removedItem = queueItems.find(
      (queueItem) => queueItem.id === queueItemId,
    );
    const isRemovingCurrentItem = queueItems[0]?.id === queueItemId;
    const isRemovingOnlyQueueItem = queueItems.length === 1;

    playbackQueue.removeQueueItem(queueItemId);

    const pendingSongId = pendingStartRef.current?.songId;
    const isRemovingPendingStart = pendingSongId && removedItem &&
      scoreLibrary.librarySongsRef.current[removedItem.songIndex]?.id === pendingSongId;
    if (removedItem && isRemovingCurrentItem && isRemovingOnlyQueueItem) {
      clearCurrentPlaybackSelection();
    } else if (isRemovingPendingStart) {
      handleStopPlayback();
    }
  }

  function handleQueueClear() {
    const hadQueueItems = playbackQueue.getQueueItemCount() > 0;

    playbackQueue.clearQueue();

    if (hadQueueItems || pendingStartRef.current?.isQueuePriority) {
      clearCurrentPlaybackSelection();
    }
  }

  async function handleDeleteLocalSong(
    songIndex: number,
    _songId: LibrarySongId,
    options: { stopPlaybackBeforeDelete: boolean },
  ) {
    return scoreLibrary.handleDeleteLocalSong(
      songIndex,
      (deletedSongIndex, deletedSongId) => {
        playbackQueue.removeSongIndex(deletedSongIndex);
        playbackOrder.removeSongFromPlaybackContext(deletedSongId);
      },
      {
        stopPlaybackBeforeDelete: options.stopPlaybackBeforeDelete,
      },
    );
  }

  async function handleDeleteLocalSongs(songIds: LibrarySongId[]) {
    const removedSongIds = Array.from(new Set(songIds));

    // 只有「正在播放的曲谱本身在删除列表里」才需要停止播放。
    // 删别的曲谱时强行停播会把用户的当前播放打断，属于误伤。
    const playingSongId = scoreLibrary.playbackSongIdRef.current;
    const shouldStopPlayback =
      playingSongId !== null && removedSongIds.includes(playingSongId);

    for (const songId of removedSongIds) {
      const songIndex = scoreLibrary.librarySongsRef.current.findIndex(
        (librarySong) => librarySong.id === songId,
      );

      if (songIndex < 0) {
        continue;
      }

      if (scoreLibrary.librarySongsRef.current[songIndex].source !==
        "local-import"
      ) {
        continue;
      }

      await handleDeleteLocalSong(songIndex, songId, {
        stopPlaybackBeforeDelete: shouldStopPlayback,
      });
    }
  }


  function getPlaybackContextOptions(item: LibrarySongListItem) {
    return {
      currentSongId: item.librarySong.id,
      selectedCategory: scoreLibrary.selectedLibraryCategory,
      songIds: buildPlaybackOrderFromVisibleItems(
        scoreLibrary.visibleLibraryItems,
        item.librarySong.id,
        { usesSearch: scoreLibrary.hasSearchQuery },
      ),
      usesSearch: scoreLibrary.hasSearchQuery,
    };
  }

  function getCurrentDisplayedLibraryItems() {
    return scoreLibrary.selectedLibraryCategory === "built-in"
      ? scoreLibrary.pagedVisibleLibraryItems
      : scoreLibrary.visibleLibraryItems;
  }

  function clearCurrentPlaybackSelection() {
    handleStopPlayback();
    playbackOrder.clearPlaybackContext();
    scoreLibrary.setPlaybackSongId(null);
    scoreLibrary.setSelectedSongId(null);
  }

  function handleStopPlayback() {
    const pendingStart = pendingStartRef.current;
    if (pendingStart) {
      pendingStartRef.current = null;
      playbackOrder.rollbackPlaybackContext(pendingStart.transaction);
      setIsStarting(false);
    }
    playbackOutput.onStop();
    if (pendingStart?.isQueuePriority) {
      restorePriorityPlaybackSong(pendingStart.previousSongId);
    }
  }

  function restorePriorityPlaybackSong(songId: LibrarySongId | null) {
    if (playbackOutput.mode === "experimental-target-window") {
      scoreLibrary.setPlaybackSongId(songId !== null && findSongIndex(songId) >= 0 ? songId : null);
    }
  }

  return {
    canPlay,
    canStop: playbackOutput.canStop || isStarting,
    clearCurrentPlaybackSelection,
    handleAddSongToQueue,
    handleBottomPlayerPlay,
    handleDeleteLocalSong,
    handleDeleteLocalSongs,
    handleNextPlayback,
    handlePlayLibraryItem,
    handlePlayAllPlaylist,
    handlePlayQueueItem,
    handlePlaySongNext,
    handleQueueClear,
    handleQueueItemRemove,
    handleRemoveFromLiked,
    handleRemoveSongFromPlaylist,
    handleStopPlayback,
    handleToggleLikedSong,
    isCurrentSongLoading,
  };
}

export function shouldSkipTargetWindowEnumerationBeforePlayback({
  mode,
  selectedWindowHwnd,
}: {
  mode: string;
  selectedWindowHwnd: string | null;
}) {
  return mode !== "experimental-target-window" || selectedWindowHwnd !== null;
}
