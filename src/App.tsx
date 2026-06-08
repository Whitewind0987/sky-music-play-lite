import { getVersion } from "@tauri-apps/api/app";
import {
  register,
  unregister,
  type ShortcutEvent,
} from "@tauri-apps/plugin-global-shortcut";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
} from "./components/AppShell";
import { BottomPlayer } from "./components/BottomPlayer";
import { CreatePlaylistDialog } from "./components/CreatePlaylistDialog";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlaybackLog } from "./components/LogPanel";
import { KeyboardPreview } from "./components/PlaybackPanel";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import { UpdateDialog } from "./components/UpdateDialog";
import {
  ALLOWED_RELEASE_URL_PREFIX,
  UPDATE_MANIFEST_URL,
  USER_MANUAL_URL,
} from "./config/update";
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
import { usePreviewPlayback } from "./hooks/usePreviewPlayback";
import { useScoreLibrary } from "./hooks/useScoreLibrary";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import { formatText } from "./lib/formatText";
import {
  formatShortcutCode,
  isUnsafeGlobalStopShortcut,
  toGlobalShortcutAccelerators,
} from "./lib/playbackShortcuts";
import {
  checkForUpdate,
  type UpdateInfo,
} from "./lib/updateCheck";
import { ignoreUpdate, isUpdateIgnored } from "./lib/updateIgnore";
import type { LibrarySongId, LibrarySongListItem } from "./types/library";
import type { PlaybackQueueItem } from "./types/playbackQueue";
import {
  defaultPlaybackShortcuts,
  type PlaybackShortcutAction,
  type PlaybackShortcutNotices,
  type PlaybackShortcuts,
} from "./types/playbackShortcuts";
import "../font/iconfont.css";
import "./App.css";

function App() {
  const stopPreviewRef = useRef<() => void>(() => {});
  const playbackHotkeyControlsRef = useRef<
    Record<PlaybackShortcutAction, () => void>
  >({
    next: () => {},
    pauseResume: () => {},
    stop: () => {},
  });
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const appNoticeTimerRef = useRef<number | null>(null);
  const globalStopShortcutOperationRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [shortcutNotice, setShortcutNotice] =
    useState<PlaybackShortcutNotices>({});
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [playbackShortcuts, setPlaybackShortcuts] =
    useState<PlaybackShortcuts>(defaultPlaybackShortcuts);
  const text = uiText[language];

  function enqueueGlobalStopShortcutOperation(operation: () => Promise<void>) {
    const nextOperation = globalStopShortcutOperationRef.current
      .catch(() => undefined)
      .then(operation);

    globalStopShortcutOperationRef.current = nextOperation;
    return nextOperation;
  }

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info("[startup] App mounted", `${performance.now().toFixed(1)}ms`);
    }
  }, []);

  const { appendLog, logEntries } = usePlaybackLog([
    uiText[defaultLanguage].logs.appReady,
  ]);
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
    applyPlaybackShortcuts: setPlaybackShortcuts,
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
    playbackShortcuts,
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
    let isCancelled = false;

    async function loadUpdateInfo() {
      try {
        const currentVersion = await getVersion();
        const nextUpdateInfo = await checkForUpdate({
          allowedReleaseUrlPrefix: ALLOWED_RELEASE_URL_PREFIX,
          currentVersion,
          manifestUrl: UPDATE_MANIFEST_URL,
        });

        if (
          !isCancelled &&
          nextUpdateInfo !== null &&
          !isUpdateIgnored(nextUpdateInfo)
        ) {
          setUpdateInfo(nextUpdateInfo);
        }
      } catch (error) {
        console.warn("[update-check] startup check failed", error);
      }
    }

    void loadUpdateInfo();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    playbackHotkeyControlsRef.current = {
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
          handleBottomPlayerPlay();
        }
      },
      stop: playbackOutput.onStop,
    };
  });

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();

      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        tagName === "button" ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null
      );
    }

    function handleInAppShortcutKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.code === playbackShortcuts.pauseResume) {
        event.preventDefault();
        playbackHotkeyControlsRef.current.pauseResume();
        return;
      }

      if (event.code === playbackShortcuts.next) {
        event.preventDefault();
        playbackHotkeyControlsRef.current.next();
      }
    }

    window.addEventListener("keydown", handleInAppShortcutKeyDown);

    return () => {
      window.removeEventListener("keydown", handleInAppShortcutKeyDown);
    };
  }, [playbackShortcuts.next, playbackShortcuts.pauseResume]);

  useEffect(() => {
    let isCancelled = false;
    const registeredAccelerators: string[] = [];

    async function registerGlobalStopHotkey() {
      const shortcutCode = playbackShortcuts.stop;
      const acceleratorCandidates = toGlobalShortcutAccelerators(shortcutCode);
      const shortcutLabel = formatShortcutCode(shortcutCode) || shortcutCode;

      if (isUnsafeGlobalStopShortcut(shortcutCode)) {
        setShortcutNotice((currentNotices) => ({
          ...currentNotices,
          stop: text.settings.keyboardShortcutUnsafeGlobalStop,
        }));
        return;
      }

      if (shortcutCode.trim() !== "" && acceleratorCandidates.length === 0) {
        setShortcutNotice((currentNotices) => ({
          ...currentNotices,
          stop: text.settings.keyboardShortcutGlobalStopFailed,
        }));
        return;
      }

      await enqueueGlobalStopShortcutOperation(async () => {
        if (acceleratorCandidates.length > 0) {
          await unregister(Array.from(new Set(acceleratorCandidates))).catch(
            () => {},
          );
        }

        if (isCancelled) {
          return;
        }

        for (const accelerator of acceleratorCandidates) {
          try {
            await register(accelerator, (event: ShortcutEvent) => {
              if (event.state !== "Pressed") {
                return;
              }

              playbackHotkeyControlsRef.current.stop();
            });

            if (isCancelled) {
              await unregister(accelerator).catch(() => {});
              return;
            }

            registeredAccelerators.push(accelerator);
            setShortcutNotice((currentNotices) => {
              const { stop: _stopNotice, ...nextNotices } = currentNotices;
              return nextNotices;
            });
            return;
          } catch (error) {
            const isLastCandidate =
              accelerator ===
              acceleratorCandidates[acceleratorCandidates.length - 1];

            if (!isLastCandidate) {
              continue;
            }

            const failureMessage =
              text.settings.keyboardShortcutGlobalStopFailed;

            console.warn(
              "Failed to register global Stop hotkey.",
              shortcutLabel,
              error,
            );
            setShortcutNotice((currentNotices) => ({
              ...currentNotices,
              stop: failureMessage,
            }));
            showAppNotice(failureMessage);
            appendLog(
              formatText(text.logs.globalHotkeyRegisterFailed, {
                shortcut: shortcutLabel,
              }),
            );
          }
        }
      });
    }

    void registerGlobalStopHotkey();

    return () => {
      isCancelled = true;

      void enqueueGlobalStopShortcutOperation(async () => {
        if (registeredAccelerators.length > 0) {
          await unregister(Array.from(new Set(registeredAccelerators))).catch(
            () => {},
          );
        }
      });
    };
  }, [
    playbackShortcuts.stop,
    text.logs.globalHotkeyRegisterFailed,
    text.settings.keyboardShortcutGlobalStopFailed,
    text.settings.keyboardShortcutUnsafeGlobalStop,
  ]);

  useEffect(() => {
    return () => {
      if (appNoticeTimerRef.current !== null) {
        window.clearTimeout(appNoticeTimerRef.current);
      }
    };
  }, []);

  function showAppNotice(message: string) {
    setAppNotice(message);
    if (appNoticeTimerRef.current !== null) {
      window.clearTimeout(appNoticeTimerRef.current);
    }
    appNoticeTimerRef.current = window.setTimeout(() => {
      setAppNotice(null);
      appNoticeTimerRef.current = null;
    }, 3000);
  }

  function handleOpenUpdateDialog() {
    if (updateInfo !== null) {
      setIsUpdateDialogOpen(true);
    }
  }

  async function handleOpenUpdateReleasePage() {
    if (updateInfo === null) {
      return;
    }

    try {
      await openUrl(updateInfo.releaseUrl);
    } catch (error) {
      console.warn("Failed to open release page.", error);
    }
  }

  function handleIgnoreUpdate() {
    if (updateInfo === null || updateInfo.updateKind !== "alpha") {
      return;
    }

    ignoreUpdate(updateInfo);
    setIsUpdateDialogOpen(false);
    setUpdateInfo(null);
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

  function handleDeleteLocalSong(songIndex: number) {
    scoreLibrary.handleDeleteLocalSong(
      songIndex,
      (deletedSongIndex, deletedSongId) => {
        playbackQueue.removeSongIndex(deletedSongIndex);
        playbackOrder.removeSongFromPlaybackContext(deletedSongId);
      },
    );
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
          onDeleteLocalSong={handleDeleteLocalSong}
          onDeletePlaylist={scoreLibrary.handleDeletePlaylist}
          onImportFiles={handleImportScoreFiles}
          onPlaySong={handlePlayLibraryItem}
          onPlaySongNext={playbackQueue.playNext}
          onRemoveFromLiked={handleRemoveFromLiked}
          onRemoveSongFromPlaylist={handleRemoveSongFromPlaylist}
          onRenamePlaylist={scoreLibrary.handleRenamePlaylist}
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
            setShortcutNotice({});
            setPlaybackShortcuts(nextShortcuts);
          }}
          onShortcutNoticeClear={() => setShortcutNotice({})}
          playbackShortcuts={playbackShortcuts}
          shortcutNotice={shortcutNotice}
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
        onUpdateClick={handleOpenUpdateDialog}
        playlists={scoreLibrary.playlists}
        selectedLibraryCategory={scoreLibrary.selectedLibraryCategory}
        selectedPlaylistId={scoreLibrary.selectedPlaylistId}
        text={text}
        updateInfo={updateInfo}
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

      {appNotice ? (
        <div className="app-notice" role="status" aria-live="polite">
          {appNotice}
        </div>
      ) : null}

      {isUpdateDialogOpen && updateInfo !== null ? (
        <UpdateDialog
          onClose={() => setIsUpdateDialogOpen(false)}
          onDownload={handleOpenUpdateReleasePage}
          onIgnore={handleIgnoreUpdate}
          text={text.updateDialog}
          updateInfo={updateInfo}
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
