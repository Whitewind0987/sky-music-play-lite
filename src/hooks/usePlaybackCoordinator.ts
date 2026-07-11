import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import { getLibrarySongName } from "../lib/libraryCollections";
import { resolveManualNextCurrentSong } from "../lib/manualNextPlayback";
import { runPlaybackContextTransaction } from "../lib/playbackContextTransaction";
import { getQueueSongIds } from "../lib/playbackQueueDecision";
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
  const currentOrSelectedLibrarySong =
    currentPlaybackLibrarySong ??
    (scoreLibrary.selectedSongIndex === null
      ? null
      : scoreLibrary.librarySongs[scoreLibrary.selectedSongIndex] ?? null);
  const isCurrentSongLoading =
    currentOrSelectedLibrarySong !== null &&
    scoreLibrary.isSongLoading(currentOrSelectedLibrarySong.id);

  async function ensureTargetWindowReadyForPlayback() {
    if (
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: playbackOutput.mode,
        selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
      })
    ) {
      return true;
    }

    return experimentalInput.ensureTargetWindowAvailableForPlayback();
  }

  async function handlePlayLibraryItem(item: LibrarySongListItem) {
    if (isAcceptedStartOutputMode(playbackOutput.mode)) {
      const transaction = playbackOrder.beginPlaybackContext(
        getPlaybackContextOptions(item),
      );
      const transactionResult = await runPlaybackContextTransaction({
        commit: playbackOrder.commitPlaybackContext,
        rollback: playbackOrder.rollbackPlaybackContext,
        start: async () =>
          (await ensureTargetWindowReadyForPlayback()) &&
          (await startOutputSong(item.songIndex)),
        transaction,
      });

      if (transactionResult !== "started") {
        return;
      }
    } else {
      if (!(await ensureTargetWindowReadyForPlayback())) {
        return;
      }
      setPlaybackContextForLibraryItem(item);
    }

    scoreLibrary.setSelectedSongId(item.librarySong.id);
    playbackQueue.replaceQueueWithCurrent(item.songIndex);

    if (!isAcceptedStartOutputMode(playbackOutput.mode)) {
      void startOutputSong(item.songIndex);
    }
  }

  async function handlePlayQueueItem(queueItem: PlaybackQueueItem) {
    const songs = scoreLibrary.librarySongsRef.current;
    const queueContextItems = playbackQueue.getValidQueueItemsFromItem(
      queueItem.id,
      songs.length,
    );
    const queueContextSongIds = getQueueSongIds(queueContextItems, songs);
    const currentSongId = songs[queueItem.songIndex]?.id;
    if (!currentSongId || queueContextSongIds[0] !== currentSongId) {
      return;
    }

    const transaction = playbackOrder.beginPlaybackContextValue({
      currentSongId,
      songIds: queueContextSongIds,
      source: "queue",
    });
    const transactionResult = await runPlaybackContextTransaction({
      commit: playbackOrder.commitPlaybackContext,
      rollback: playbackOrder.rollbackPlaybackContext,
      start: async () =>
        (await ensureTargetWindowReadyForPlayback()) &&
        (await startOutputSong(queueItem.songIndex)),
      transaction,
    });

    if (transactionResult !== "started") {
      return;
    }

    scoreLibrary.handleSelectImportedSong(queueItem.songIndex);
    playbackQueue.consumeQueuedItemAfterCurrent(queueItem.id, songs.length);
  }

  function handleRemoveFromLiked(songId: LibrarySongId) {
    const shouldClear =
      scoreLibrary.selectedLibraryCategory === "liked" &&
      scoreLibrary.selectedSongId === songId;

    scoreLibrary.handleRemoveFromLiked(songId);

    if (shouldClear) {
      clearCurrentSelectionAfterRemoval();
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
      clearCurrentSelectionAfterRemoval();
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
      clearCurrentSelectionAfterRemoval();
    }
  }

  async function handleNextPlayback() {
    if (!(await ensureTargetWindowReadyForPlayback())) {
      return;
    }

    const songs = scoreLibrary.librarySongsRef.current;
    const activeForegroundSongId =
      experimentalInput.getActiveForegroundPlaybackSongId();
    const activeTargetWindowSongId =
      experimentalInput.getActiveTargetWindowPlaybackSongId();
    const pendingPlaybackContextSongId =
      playbackOrder.getPendingPlaybackContextSongId();
    const effectivePlaybackContextSongId =
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
    const queuedItem =
      queueDecision.status === "next" ? queueDecision.nextItem : null;

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
    const queueContextSongIds =
      queueDecision.status === "next"
        ? getQueueSongIds(queueDecision.remainingItems, songs)
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

    if (
      currentSongResolution.status === "context-unavailable" ||
      playbackOrderDecision?.status === "context-unavailable"
    ) {
      return;
    }

    if (nextSongIndex === null) {
      playbackOrder.clearPlaybackContext();
      playbackOutput.onStop();
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
    const transactionResult = await runPlaybackContextTransaction({
      commit: playbackOrder.commitPlaybackContext,
      rollback: playbackOrder.rollbackPlaybackContext,
      start: () => startOutputSong(nextSongIndex),
      transaction,
    });

    if (transactionResult !== "started") {
      return;
    }

    if (queuedItem) {
      playbackQueue.consumeQueuedItemAfterCurrent(queuedItem.id, songs.length);
    } else if (queueDecision.status === "current-not-in-queue") {
      playbackQueue.replaceQueueWithCurrent(nextSongIndex);
    } else {
      playbackQueue.startQueuePlayback(nextSongIndex);
    }
  }

  async function handleBottomPlayerPlay() {
    if (!(await ensureTargetWindowReadyForPlayback())) {
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
      clearCurrentSelectionAfterRemoval();
      appendLog(text.logs.selectedSongNotInCurrentView);
      return;
    }

    setPlaybackContextForLibraryItem(selectedVisibleItem);
    const didStart = await startOutputSong(selectedVisibleItem.songIndex);

    if (didStart) {
      playbackQueue.replaceQueueWithCurrent(selectedVisibleItem.songIndex);
    }
  }

  function handleQueueItemRemove(queueItemId: string) {
    const removedItem = playbackQueue.queueItems.find(
      (queueItem) => queueItem.id === queueItemId,
    );
    const isRemovingCurrentItem = playbackQueue.queueItems[0]?.id === queueItemId;
    const isRemovingOnlyQueueItem = playbackQueue.queueItems.length === 1;

    playbackQueue.removeQueueItem(queueItemId);

    if (removedItem && isRemovingCurrentItem && isRemovingOnlyQueueItem) {
      clearCurrentPlaybackSelection();
    }
  }

  function handleQueueClear() {
    const hadQueueItems = playbackQueue.queueItems.length > 0;

    playbackQueue.clearQueue();

    if (hadQueueItems) {
      clearCurrentPlaybackSelection();
    }
  }

  async function startPlaybackFromSongIndex(
    songIndex: number,
    { skipTargetWindowGuard = false }: { skipTargetWindowGuard?: boolean } = {},
  ) {
    if (
      !skipTargetWindowGuard &&
      !(await ensureTargetWindowReadyForPlayback())
    ) {
      return;
    }

    const shouldStartQueue = canStartQueueForCurrentOutput();
    const didStart = await startOutputSong(songIndex);

    if (didStart && shouldStartQueue) {
      playbackQueue.startQueuePlayback(songIndex);
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

  function setPlaybackContextForLibraryItem(item: LibrarySongListItem) {
    playbackOrder.setPlaybackContext(getPlaybackContextOptions(item));
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

  function clearCurrentSelectionAfterRemoval() {
    playbackOutput.onStop();
    playbackOrder.clearPlaybackContext();
    playbackQueue.clearQueue();
    scoreLibrary.setSelectedSongId(null);
  }

  function clearCurrentPlaybackSelection() {
    playbackOutput.onStop();
    playbackOrder.clearPlaybackContext();
    scoreLibrary.setSelectedSongId(null);
  }

  function canStartQueueForCurrentOutput() {
    return (
      playbackOutput.mode !== "experimental-target-window" ||
      experimentalInput.selectedWindowHwnd !== null
    );
  }

  async function startOutputSong(songIndex: number) {
    const result = await playbackOutput.onPlaySong(songIndex);

    return result !== false;
  }

  return {
    clearCurrentPlaybackSelection,
    clearCurrentSelectionAfterRemoval,
    handleBottomPlayerPlay,
    handleDeleteLocalSong,
    handleNextPlayback,
    handlePlayLibraryItem,
    handlePlayQueueItem,
    handleQueueClear,
    handleQueueItemRemove,
    handleRemoveFromLiked,
    handleRemoveSongFromPlaylist,
    handleToggleLikedSong,
    isCurrentSongLoading,
    startPlaybackFromSongIndex,
  };
}

function isAcceptedStartOutputMode(mode: PlaybackOutputController["mode"]) {
  return (
    mode === "experimental-target-window" ||
    mode === "experimental-foreground"
  );
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
