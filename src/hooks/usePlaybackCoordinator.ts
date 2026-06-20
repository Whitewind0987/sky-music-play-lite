import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
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
  experimentalInput: ExperimentalInputController;
  playbackOrder: PlaybackOrderController;
  playbackOutput: PlaybackOutputController;
  playbackQueue: PlaybackQueueController;
  scoreLibrary: ScoreLibraryController;
  text: UiText;
};

export function usePlaybackCoordinator({
  appendLog,
  experimentalInput,
  playbackOrder,
  playbackOutput,
  playbackQueue,
  scoreLibrary,
  text,
}: UsePlaybackCoordinatorOptions) {
  const currentPlaybackLibrarySong = scoreLibrary.currentPlaybackLibrarySong;
  const isCurrentSongLoading =
  currentPlaybackLibrarySong !== null &&
  currentPlaybackLibrarySong.source === "built-in" &&
  !currentPlaybackLibrarySong.isBuiltInLoaded &&
  scoreLibrary.isBuiltInSongLoading(currentPlaybackLibrarySong.id);

  async function ensureTargetWindowReadyForPlayback() {
    if (playbackOutput.mode !== "experimental-target-window") {
      return true;
    }

    return experimentalInput.ensureTargetWindowAvailableForPlayback();
  }

  async function handlePlayLibraryItem(item: LibrarySongListItem) {
    if (!(await ensureTargetWindowReadyForPlayback())) {
      return;
    }

    if (playbackOutput.mode === "experimental-target-window") {
      const didStart = await startOutputSong(item.songIndex);

      if (!didStart) {
        return;
      }
    }

    scoreLibrary.setSelectedSongId(item.librarySong.id);
    setPlaybackContextForLibraryItem(item);
    playbackQueue.replaceQueueWithCurrent(item.songIndex);

    if (playbackOutput.mode !== "experimental-target-window") {
      void startOutputSong(item.songIndex);
    }
  }

  async function handlePlayQueueItem(queueItem: PlaybackQueueItem) {
    if (!(await ensureTargetWindowReadyForPlayback())) {
      return;
    }

    scoreLibrary.handleSelectImportedSong(queueItem.songIndex);
    playbackOrder.clearPlaybackContext();
    startPlaybackFromSongIndex(queueItem.songIndex, {
      skipTargetWindowGuard: true,
    });
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

    const songs = scoreLibrary.importedSongsRef.current;
    const shouldDeferQueueConsume =
      playbackOutput.mode === "experimental-target-window";
    const queuedItem = shouldDeferQueueConsume
      ? playbackQueue.peekNextQueueItemAfterCurrent(songs.length)
      : playbackQueue.consumeNextQueueItemAfterCurrent(songs.length);

    const playbackOrderNextSongIndex =
      queuedItem === null && scoreLibrary.selectedSongIndex !== null
        ? playbackOrder.getNextPlaybackOrderSongIndex({
            currentSongIndex: scoreLibrary.selectedSongIndex,
            isShuffleEnabled: playbackOutput.isShuffleEnabled,
            librarySongs: scoreLibrary.librarySongs,
            playbackMode: playbackOutput.playbackMode,
          })
        : null;
    const nextSongIndex = queuedItem?.songIndex ?? playbackOrderNextSongIndex;

    if (nextSongIndex === null) {
      playbackOrder.clearPlaybackContext();
      playbackOutput.onStop();
      appendLog(text.logs.manualNextUnavailable);
      return;
    }

    appendLog(
      formatText(text.logs.manualNextTriggered, {
        songName: songs[nextSongIndex]?.name ?? text.logs.queueUnknownSong,
      }),
    );
    const didStart = await startOutputSong(nextSongIndex);

    if (!didStart) {
      return;
    }

    if (queuedItem) {
      if (shouldDeferQueueConsume) {
        playbackQueue.consumeQueuedItemAfterCurrent(
          queuedItem.id,
          songs.length,
        );
      }
      playbackOrder.clearPlaybackContext();
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

  function handleDeleteLocalSong(
    songIndex: number,
    _songId: LibrarySongId,
    options: { stopPlaybackBeforeDelete: boolean },
  ) {
    scoreLibrary.handleDeleteLocalSong(
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
    playbackOrder.setPlaybackContext({
      currentSongId: item.librarySong.id,
      selectedCategory: scoreLibrary.selectedLibraryCategory,
      songIds: buildPlaybackOrderFromVisibleItems(
        scoreLibrary.visibleLibraryItems,
        item.librarySong.id,
        { usesSearch: scoreLibrary.hasSearchQuery },
      ),
      usesSearch: scoreLibrary.hasSearchQuery,
    });
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
