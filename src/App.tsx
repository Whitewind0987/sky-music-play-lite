import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
} from "./components/AppShell";
import { AppNoticeToast } from "./components/AppNoticeToast";
import { BottomPlayer } from "./components/BottomPlayer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CreatePlaylistDialog } from "./components/CreatePlaylistDialog";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlaybackLog } from "./components/LogPanel";
import { KeyboardPreview } from "./components/PlaybackPanel";
import { RenamePlaylistDialog } from "./components/RenamePlaylistDialog";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import { UpdateDialog } from "./components/UpdateDialog";
import { USER_MANUAL_URL } from "./config/update";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { useExperimentalInput } from "./hooks/useExperimentalInput";
import { useKeyMapping } from "./hooks/useKeyMapping";
import { usePlaybackLog } from "./hooks/usePlaybackLog";
import {
  buildPlaybackOrderFromVisibleItems,
  usePlaybackOrder,
} from "./hooks/usePlaybackOrder";
import { usePlaybackOutput } from "./hooks/usePlaybackOutput";
import { usePlaybackQueue } from "./hooks/usePlaybackQueue";
import { usePlaybackShortcuts } from "./hooks/usePlaybackShortcuts";
import { usePreviewPlayback } from "./hooks/usePreviewPlayback";
import { useScoreLibrary } from "./hooks/useScoreLibrary";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import { formatText } from "./lib/formatText";
import type { LibrarySongId, LibrarySongListItem } from "./types/library";
import type { PlaybackQueueItem } from "./types/playbackQueue";
import "../font/iconfont.css";
import "./App.css";

type PendingDeleteConfirmation =
  | {
      playlistId: string;
      playlistName: string;
      type: "playlist";
    }
  | {
      songId: LibrarySongId;
      songIndex: number;
      songName: string;
      type: "local-song";
    };

type PendingRenamePlaylist = {
  playlistId: string;
  playlistName: string;
};

function App() {
  const stopPreviewRef = useRef<() => void>(() => {});
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const [appNotice, setAppNotice] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const [isAppNoticeOpen, setIsAppNoticeOpen] = useState(false);
  const [pendingDeleteConfirmation, setPendingDeleteConfirmation] =
    useState<PendingDeleteConfirmation | null>(null);
  const [pendingRenamePlaylist, setPendingRenamePlaylist] =
    useState<PendingRenamePlaylist | null>(null);
  const updateCheck = useUpdateCheck();
  const text = uiText[language];

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info("[startup] App mounted", `${performance.now().toFixed(1)}ms`);
    }
  }, []);

  const { appendLog, logEntries } = usePlaybackLog([
    uiText[defaultLanguage].logs.appReady,
  ]);
  const playbackShortcutsController = usePlaybackShortcuts({
    appendLog,
    showNotice: showAppNotice,
    text,
  });
  const {
    applyKeyMapping,
    handleStartKeyMappingListen,
    keyMapping,
    listeningSkyKey,
  } = useKeyMapping();
  const scoreLibrary = useScoreLibrary({
    appendLog,
    onBeforeLibraryMutation: () => stopPreviewRef.current(),
    showNotice: showAppNotice,
    text,
  });
  const playbackOrder = usePlaybackOrder();
  const playbackQueue = usePlaybackQueue({
    appendLog,
    importedSongsRef: scoreLibrary.importedSongsRef,
    showNotice: showAppNotice,
    text: text.logs,
  });
  const previewPlayback = usePreviewPlayback({
    appendLog,
    consumeNextQueueItemAfterCurrent:
      playbackQueue.consumeNextQueueItemAfterCurrent,
    currentSelectedSong: scoreLibrary.currentSelectedSong,
    getPlaybackOrderNextSongIndex: (options) =>
      playbackOrder.getNextPlaybackOrderSongIndex({
        ...options,
        librarySongs: scoreLibrary.librarySongs,
      }),
    importedSongsRef: scoreLibrary.importedSongsRef,
    resolveSongForPlayback: scoreLibrary.resolveSongForPlayback,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setSelectedSongIndex: scoreLibrary.setSelectedSongIndex,
    startQueuePlayback: playbackQueue.startQueuePlayback,
    text,
  });
  const experimentalInput = useExperimentalInput({
    appendLog,
    consumeNextQueueItemAfterCurrent:
      playbackQueue.consumeNextQueueItemAfterCurrent,
    currentSong: scoreLibrary.currentSelectedSong,
    getPlaybackOrderNextSongIndex: (options) =>
      playbackOrder.getNextPlaybackOrderSongIndex({
        ...options,
        librarySongs: scoreLibrary.librarySongs,
      }),
    importedSongsRef: scoreLibrary.importedSongsRef,
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    keyMapping,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    playbackMode: previewPlayback.playbackMode,
    playbackSpeed: previewPlayback.playbackSpeed,
    resolveSongForPlayback: scoreLibrary.resolveSongForPlayback,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setSelectedSongIndex: scoreLibrary.setSelectedSongIndex,
    showNotice: showAppNotice,
    startQueuePlayback: playbackQueue.startQueuePlayback,
    stopPreviewPlayback: previewPlayback.stopCurrentPreview,
    text,
  });
  useAppPersistence({
    appendLog,
    applyExperimentalInputPreferences:
      experimentalInput.applyExperimentalInputPreferences,
    applyKeyMapping,
    applyPlaybackSettings: previewPlayback.applyPlaybackSettings,
    applyPlaybackShortcuts: playbackShortcutsController.setPlaybackShortcuts,
    applyScoreLibrary: scoreLibrary.applyScoreLibrary,
    canSaveAppData: scoreLibrary.hasLoadedBuiltInSongs,
    experimentalInputEnabled: experimentalInput.experimentalInputEnabled,
    experimentalInputMode: experimentalInput.experimentalInputMode,
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    keyMapping,
    language,
    librarySongs: scoreLibrary.localLibrarySongs,
    likedSongs: scoreLibrary.likedSongs,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    playbackMode: previewPlayback.playbackMode,
    playbackShortcuts: playbackShortcutsController.playbackShortcuts,
    playbackSpeed: previewPlayback.playbackSpeed,
    playlists: scoreLibrary.playlists,
    selectedLibraryCategory: scoreLibrary.selectedLibraryCategory,
    selectedPlaylistId: scoreLibrary.selectedPlaylistId,
    selectedSongIndex: scoreLibrary.persistedSelectedSongIndex,
    selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
    selectedWindowSnapshot: experimentalInput.selectedWindowSnapshot,
    setLanguage,
    targetWindowCompatibilityProfile:
      experimentalInput.targetWindowCompatibilityProfile,
    targetWindowKeyHoldMs: experimentalInput.targetWindowKeyHoldMs,
    targetWindowMessageMethod: experimentalInput.targetWindowMessageMethod,
    text: text.logs,
    validCollectionSongIds: scoreLibrary.validCollectionSongIds,
  });
  const playbackOutput = usePlaybackOutput({
    experimentalInput,
    previewPlayback,
    text: text.bottomPlayer,
  });
  const [queueOpen, setQueueOpen] = useState(false);
  const [isCreatingPlaylistFromSidebar, setIsCreatingPlaylistFromSidebar] =
    useState(false);
  const isAnyPlaybackActive =
    previewPlayback.playbackState === "playing" ||
    previewPlayback.playbackState === "paused" ||
    experimentalInput.foregroundPlaybackState === "countdown" ||
    experimentalInput.foregroundPlaybackState === "playing" ||
    experimentalInput.foregroundPlaybackState === "paused" ||
    experimentalInput.isExperimentalPlaybackRunning;
  const selectedLibrarySong =
    scoreLibrary.selectedSongIndex === null
      ? null
      : (scoreLibrary.librarySongs[scoreLibrary.selectedSongIndex] ?? null);
  const isCurrentSongLoading =
    selectedLibrarySong !== null &&
    selectedLibrarySong.source === "built-in" &&
    !selectedLibrarySong.isBuiltInLoaded &&
    scoreLibrary.isBuiltInSongLoading(selectedLibrarySong.id);

  useEffect(() => {
    stopPreviewRef.current = playbackOutput.onStop;
  }, [playbackOutput.onStop]);

  useEffect(() => {
    playbackShortcutsController.setPlaybackHotkeyControls({
      next: handleNextPlayback,
      pauseResume: () => {
        if (playbackOutput.playbackState === "playing") {
          playbackOutput.onPause();
          return;
        }

        if (playbackOutput.playbackState === "paused") {
          playbackOutput.onResume();
          return;
        }

        if (playbackOutput.canPlay && !isCurrentSongLoading) {
          void handleBottomPlayerPlay();
        }
      },
      stop: playbackOutput.onStop,
    });
  });

  function showAppNotice(message: string) {
    setAppNotice((currentNotice) => ({
      id: (currentNotice?.id ?? 0) + 1,
      message,
    }));
    setIsAppNoticeOpen(true);
  }

  async function handleOpenUserManual() {
    try {
      await openUrl(USER_MANUAL_URL);
    } catch (error) {
      console.warn("Failed to open user manual.", error);
    }
  }

  function handleImportScoreFiles(files: File[]) {
    if (isAnyPlaybackActive) {
      appendLog(text.logs.importBlockedDuringPlayback);
      return;
    }

    void scoreLibrary.handleImportScoreFiles(files);
  }

  function handleRequestRenamePlaylist(playlistId: string) {
    const playlist = scoreLibrary.playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    setPendingRenamePlaylist({
      playlistId,
      playlistName: playlist.name,
    });
  }

  function handleCancelRenamePlaylist() {
    setPendingRenamePlaylist(null);
  }

  function handleConfirmRenamePlaylist(nextName: string) {
    if (pendingRenamePlaylist === null) {
      return;
    }

    scoreLibrary.handleRenamePlaylist(
      pendingRenamePlaylist.playlistId,
      nextName,
    );
    setPendingRenamePlaylist(null);
  }

  function handleRequestDeletePlaylist(playlistId: string) {
    const playlist = scoreLibrary.playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    setPendingDeleteConfirmation({
      playlistId,
      playlistName: playlist.name,
      type: "playlist",
    });
  }

  function handleRequestDeleteLocalSong(songIndex: number) {
    const librarySong = scoreLibrary.librarySongs[songIndex];

    if (!librarySong || librarySong.source !== "local-import") {
      return;
    }

    setPendingDeleteConfirmation({
      songId: librarySong.id,
      songIndex,
      songName: librarySong.song.name,
      type: "local-song",
    });
  }

  function handleConfirmPendingDelete() {
    if (pendingDeleteConfirmation === null) {
      return;
    }

    if (pendingDeleteConfirmation.type === "playlist") {
      scoreLibrary.handleDeletePlaylist(pendingDeleteConfirmation.playlistId);
      setPendingDeleteConfirmation(null);
      return;
    }

    const currentSongIndex =
      scoreLibrary.librarySongs[pendingDeleteConfirmation.songIndex]?.id ===
      pendingDeleteConfirmation.songId
        ? pendingDeleteConfirmation.songIndex
        : scoreLibrary.librarySongs.findIndex(
            (librarySong) =>
              librarySong.id === pendingDeleteConfirmation.songId,
          );
    const isDeletingCurrentSong =
      scoreLibrary.selectedSongId === pendingDeleteConfirmation.songId;

    if (currentSongIndex >= 0) {
      scoreLibrary.handleDeleteLocalSong(
        currentSongIndex,
        (deletedSongIndex, deletedSongId) => {
          playbackQueue.removeSongIndex(deletedSongIndex);
          playbackOrder.removeSongFromPlaybackContext(deletedSongId);
        },
        {
          stopPlaybackBeforeDelete: isDeletingCurrentSong,
        },
      );
    }

    setPendingDeleteConfirmation(null);
  }

  function handleCancelPendingDelete() {
    setPendingDeleteConfirmation(null);
  }

  function getPendingDeleteDialogDescription() {
    if (pendingDeleteConfirmation === null) {
      return "";
    }

    if (pendingDeleteConfirmation.type === "playlist") {
      return formatText(text.library.deletePlaylistConfirm, {
        playlistName: pendingDeleteConfirmation.playlistName,
      });
    }

    return formatText(text.library.deleteLocalSongConfirm, {
      songName: pendingDeleteConfirmation.songName,
    });
  }

  function getPendingDeleteDialogTitle() {
    if (pendingDeleteConfirmation?.type === "playlist") {
      return text.library.deletePlaylist;
    }

    return text.library.deleteLocalSong;
  }

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

    scoreLibrary.setSelectedSongId(item.librarySong.id);
    setPlaybackContextForLibraryItem(item);
    playbackQueue.replaceQueueWithCurrent(item.songIndex);
    playbackOutput.onPlaySong(item.songIndex);
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
    const queuedItem = playbackQueue.consumeNextQueueItemAfterCurrent(
      songs.length,
    );
    if (queuedItem) {
      playbackOrder.clearPlaybackContext();
    }

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
    if (queuedItem === null) {
      playbackQueue.startQueuePlayback(nextSongIndex);
    }
    playbackOutput.onPlaySong(nextSongIndex);
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
    playbackQueue.replaceQueueWithCurrent(selectedVisibleItem.songIndex);
    playbackOutput.onPlaySong(selectedVisibleItem.songIndex);
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

    if (canStartQueueForCurrentOutput()) {
      playbackQueue.startQueuePlayback(songIndex);
    }

    playbackOutput.onPlaySong(songIndex);
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

  function renderActiveSection() {
    if (activeSection === "Library") {
      return (
        <LibraryPanel
          builtInPagination={scoreLibrary.builtInPagination}
          importError={scoreLibrary.importError}
          importDisabled={isAnyPlaybackActive}
          hasSearchQuery={scoreLibrary.hasSearchQuery}
          items={scoreLibrary.pagedVisibleLibraryItems}
          onAddSongToPlaylist={scoreLibrary.handleAddSongToPlaylist}
          onAddToQueue={playbackQueue.addToQueue}
          onCreatePlaylistWithSong={scoreLibrary.handleCreatePlaylistWithSong}
          onDeleteLocalSong={handleRequestDeleteLocalSong}
          onDeletePlaylist={handleRequestDeletePlaylist}
          onImportFiles={handleImportScoreFiles}
          onPlaySong={handlePlayLibraryItem}
          onPlaySongNext={playbackQueue.playNext}
          onRemoveFromLiked={handleRemoveFromLiked}
          onRemoveSongFromPlaylist={handleRemoveSongFromPlaylist}
          onRenamePlaylist={handleRequestRenamePlaylist}
          onSearchQueryChange={scoreLibrary.setSearchQuery}
          onSelectSong={scoreLibrary.handleSelectImportedSong}
          onToggleLiked={handleToggleLikedSong}
          playlists={scoreLibrary.playlists}
          searchQuery={scoreLibrary.searchQuery}
          selectedCategory={scoreLibrary.selectedLibraryCategory}
          selectedPlaylist={scoreLibrary.selectedPlaylist}
          selectedPlaylistId={scoreLibrary.selectedPlaylistId}
          selectedSongIndex={scoreLibrary.selectedSongIndex}
          isBuiltInSongLoading={scoreLibrary.isBuiltInSongLoading}
          text={text.library}
        />
      );
    }

    if (activeSection === "Playback") {
      return (
        <KeyboardPreview
          activeKeys={previewPlayback.activeKeys}
          keyMapping={keyMapping}
          text={text.keyboard}
        />
      );
    }

    if (activeSection === "Logs") {
      return <PlaybackLog entries={logEntries} text={text.logs} />;
    }

    if (activeSection === "Settings") {
      return (
        <SettingsPlaceholder
          experimentalInput={{
            candidateWindows: experimentalInput.candidateWindows,
            experimentalInputEnabled:
              experimentalInput.experimentalInputEnabled,
            experimentalPlaybackProgress:
              experimentalInput.experimentalPlaybackProgress,
            isDetectingSkyWindow: experimentalInput.isDetectingSkyWindow,
            isExperimentalPlaybackRunning:
              experimentalInput.isExperimentalPlaybackRunning,
            isRefreshingWindows: experimentalInput.isRefreshingWindows,
            lastError: experimentalInput.lastError,
            onDetectSkyWindow: experimentalInput.handleDetectSkyWindow,
            onExperimentalInputEnabledChange:
              experimentalInput.setExperimentalInputEnabled,
            onExperimentalInputModeChange:
              experimentalInput.handleExperimentalInputModeChange,
            onRefreshWindows: experimentalInput.handleRefreshWindows,
            onSelectedWindowChange: experimentalInput.setSelectedWindowHwnd,
            onTargetWindowCompatibilityProfileChange:
              experimentalInput.setTargetWindowCompatibilityProfile,
            onTargetWindowKeyHoldMsChange:
              experimentalInput.setTargetWindowKeyHoldMs,
            onTargetWindowMessageMethodChange:
              experimentalInput.setTargetWindowMessageMethod,
            selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
            selectedWindowSnapshot: experimentalInput.selectedWindowSnapshot,
            targetWindowCompatibilityProfile:
              experimentalInput.targetWindowCompatibilityProfile,
            targetWindowKeyHoldMs: experimentalInput.targetWindowKeyHoldMs,
            targetWindowMessageMethod:
              experimentalInput.targetWindowMessageMethod,
            experimentalInputMode: experimentalInput.experimentalInputMode,
            foregroundCountdown: experimentalInput.foregroundCountdown,
            foregroundPlaybackState: experimentalInput.foregroundPlaybackState,
          }}
          keyMapping={keyMapping}
          language={language}
          listeningSkyKey={listeningSkyKey}
          onKeyMappingListenStart={handleStartKeyMappingListen}
          onLanguageChange={setLanguage}
          onPlaybackShortcutsChange={(nextShortcuts) => {
            playbackShortcutsController.clearShortcutNotice();
            playbackShortcutsController.setPlaybackShortcuts(nextShortcuts);
          }}
          onShortcutNoticeClear={playbackShortcutsController.clearShortcutNotice}
          playbackShortcuts={playbackShortcutsController.playbackShortcuts}
          shortcutNotice={playbackShortcutsController.shortcutNotice}
          text={text.settings}
        />
      );
    }

    return null;
  }

  return (
    <main className="app-shell">
      <AppSidebar
        activeSection={activeSection}
        localImportCount={scoreLibrary.localLibrarySongs.length}
        onCreatePlaylistRequest={() => setIsCreatingPlaylistFromSidebar(true)}
        onLibraryCategoryChange={scoreLibrary.handleLibraryCategoryChange}
        onPlaylistSelect={scoreLibrary.setSelectedPlaylistId}
        onSectionChange={setActiveSection}
        onUpdateClick={updateCheck.openUpdateDialog}
        playlists={scoreLibrary.playlists}
        selectedLibraryCategory={scoreLibrary.selectedLibraryCategory}
        selectedPlaylistId={scoreLibrary.selectedPlaylistId}
        text={text}
        updateInfo={updateCheck.updateInfo}
      />

      <section className="workspace-shell" aria-label={text.app.contentAria}>
        <WorkspaceHeader
          activeSection={activeSection}
          onSettingsClick={() => setActiveSection("Settings")}
          onUserManualClick={handleOpenUserManual}
          text={text}
        />

        <div
          className={`app-layout app-layout-${activeSection.toLowerCase()}`}
        >
          {renderActiveSection()}
        </div>
      </section>

      <AppNoticeToast
        message={appNotice?.message ?? null}
        noticeKey={appNotice?.id ?? 0}
        open={isAppNoticeOpen}
        onOpenChange={setIsAppNoticeOpen}
      />

      <ConfirmDialog
        cancelLabel={text.library.cancelDelete}
        confirmLabel={text.library.confirmDelete}
        description={getPendingDeleteDialogDescription()}
        open={pendingDeleteConfirmation !== null}
        title={getPendingDeleteDialogTitle()}
        variant="danger"
        onCancel={handleCancelPendingDelete}
        onConfirm={handleConfirmPendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelPendingDelete();
          }
        }}
      />

      {pendingRenamePlaylist ? (
        <RenamePlaylistDialog
          initialName={pendingRenamePlaylist.playlistName}
          onClose={handleCancelRenamePlaylist}
          onRename={handleConfirmRenamePlaylist}
          text={text.library}
        />
      ) : null}

      {updateCheck.isUpdateDialogOpen && updateCheck.updateInfo !== null ? (
        <UpdateDialog
          onClose={updateCheck.closeUpdateDialog}
          onDownload={updateCheck.openUpdateReleasePage}
          onIgnore={updateCheck.ignoreCurrentUpdate}
          text={text.updateDialog}
          updateInfo={updateCheck.updateInfo}
        />
      ) : null}

      <BottomPlayer
        canPlay={playbackOutput.canPlay}
        currentSong={scoreLibrary.currentSelectedSong}
        isCurrentSongLoading={isCurrentSongLoading}
        isRealInputOutput={playbackOutput.isRealInputOutput}
        isShuffleEnabled={playbackOutput.isShuffleEnabled}
        noteIntervalDelayMs={playbackOutput.noteIntervalDelayMs}
        onNoteIntervalDelayChange={playbackOutput.onNoteIntervalDelayChange}
        onNext={handleNextPlayback}
        onPause={playbackOutput.onPause}
        onPlayQueueItem={handlePlayQueueItem}
        onPlay={handleBottomPlayerPlay}
        onPlaybackSpeedChange={playbackOutput.onPlaybackSpeedChange}
        onQueueClear={handleQueueClear}
        onQueueItemRemove={handleQueueItemRemove}
        onQueueToggle={() => setQueueOpen((isOpen) => !isOpen)}
        onQueueClose={() => setQueueOpen(false)}
        onRepeatModeCycle={playbackOutput.onRepeatModeCycle}
        onResume={playbackOutput.onResume}
        onShuffleToggle={playbackOutput.onShuffleToggle}
        onStop={playbackOutput.onStop}
        outputModeLabel={playbackOutput.outputModeLabel}
        playbackMode={playbackOutput.playbackMode}
        playbackState={playbackOutput.playbackState}
        playbackSpeed={playbackOutput.playbackSpeed}
        progress={playbackOutput.progress}
        queueItems={playbackQueue.queueItems}
        queueOpen={queueOpen}
        songs={scoreLibrary.importedSongs}
        text={text.bottomPlayer}
      />
      {isCreatingPlaylistFromSidebar ? (
        <CreatePlaylistDialog
          onClose={() => setIsCreatingPlaylistFromSidebar(false)}
          onCreate={(playlistName) => {
            scoreLibrary.handleCreatePlaylist(playlistName);
            setActiveSection("Library");
            setIsCreatingPlaylistFromSidebar(false);
          }}
          text={text.library}
        />
      ) : null}
    </main>
  );
}

export default App;
