import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CircleAlert, FileUp } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
} from "./components/AppShell";
import { AppNoticeToast } from "./components/AppNoticeToast";
import { BottomPlayer } from "./components/BottomPlayer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CreatePlaylistDialog } from "./components/CreatePlaylistDialog";
import {
  getV1ToV2UpgradePreferenceReadiness,
  LibraryPanel,
} from "./components/LibraryPanel";
import { PlaybackLog } from "./components/LogPanel";
import { KeyboardPreview } from "./components/PlaybackPanel";
import { RenamePlaylistDialog } from "./components/RenamePlaylistDialog";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import { UpdateDialog } from "./components/UpdateDialog";
import { USER_MANUAL_URL } from "./config/update";
import { useAppFileLogger } from "./hooks/useAppFileLogger";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { useExperimentalInput } from "./hooks/useExperimentalInput";
import { useKeyMapping } from "./hooks/useKeyMapping";
import { useLibraryDialogs } from "./hooks/useLibraryDialogs";
import { usePlaybackLog } from "./hooks/usePlaybackLog";
import { usePlaybackCoordinator } from "./hooks/usePlaybackCoordinator";
import { usePlaybackOrder } from "./hooks/usePlaybackOrder";
import { usePlaybackOutput } from "./hooks/usePlaybackOutput";
import { usePlaybackQueue } from "./hooks/usePlaybackQueue";
import { usePlaybackShortcuts } from "./hooks/usePlaybackShortcuts";
import { usePreviewPlayback } from "./hooks/usePreviewPlayback";
import { useScoreLibrary } from "./hooks/useScoreLibrary";
import { useScoreUpgradeGuard } from "./hooks/useScoreUpgradeGuard";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import { useV1ToV2UpgradePreferences } from "./hooks/useV1ToV2UpgradePreferences";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import {
  dismissExitConfirmationDialog,
  getExitCloseRequestDecision,
  openExitConfirmationDialog,
  runConfirmBeforeExitPreferenceChange,
  runExitConfirmationAction,
  runForceCloseAction,
} from "./lib/exitConfirmationFlow";
import { formatText } from "./lib/formatText";
import { shouldBlockLocalSongDeletion } from "./lib/libraryDeletionBlocking";
import { getLibrarySongName } from "./lib/libraryCollections";
import {
  synchronizeRemovedLibrarySongsWithPlayback,
  type RemovedLibrarySong,
} from "./lib/missingScorePlaybackSync";
import { shouldStopPlaybackForRemovedSong } from "./lib/missingScorePlaybackActivity";
import { runScoreUpgradePlaybackStartGuard } from "./lib/scoreUpgradePlaybackGuard";
import { forceCloseApp } from "./lib/tauriApi";
import type { LibrarySongId } from "./types/library";
import "../font/iconfont.css";
import "./App.css";

function App() {
  const stopPreviewRef = useRef<() => void>(() => {});
  const isClosingAfterConfirmRef = useRef(false);
  const closeConfirmationGuardRef = useRef({ current: false });
  const isCloseConfirmOpenRef = useRef(false);
  const confirmBeforeExitRef = useRef(true);
  const confirmBeforeExitSettingGuardRef = useRef({ current: false });
  const isConfirmBeforeExitSavingRef = useRef(false);
  const closeRequestedUnlistenRef = useRef<(() => void) | null>(null);
  const fileLogContextRef = useRef<Record<string, unknown>>({});
  const dragDepthRef = useRef(0);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const [confirmBeforeExit, setConfirmBeforeExit] = useState(true);
  const [isConfirmBeforeExitSaving, setIsConfirmBeforeExitSaving] =
    useState(false);
  const [closeConfirmDialog, setCloseConfirmDialog] = useState(
    dismissExitConfirmationDialog,
  );
  const [isCloseConfirmSaving, setIsCloseConfirmSaving] = useState(false);
  const [isDraggingScoreFiles, setIsDraggingScoreFiles] = useState(false);
  const [appNotice, setAppNotice] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const [isAppNoticeOpen, setIsAppNoticeOpen] = useState(false);
  const updateCheck = useUpdateCheck();
  const text = uiText[language];
  const appFileLogger = useAppFileLogger(language);
  const appendDetailedLogRef = useRef(appFileLogger.appendDetailedLog);
  const missingLocalSongsRemovedRef = useRef<
    (removedSongs: RemovedLibrarySong[]) => void
  >(() => {});
  const missingPlaybackSongRemovalRef = useRef<
    (songId: LibrarySongId) => void
  >(() => {});

  useEffect(() => {
    appendDetailedLogRef.current = appFileLogger.appendDetailedLog;
  }, [appFileLogger.appendDetailedLog]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info("[startup] App mounted", `${performance.now().toFixed(1)}ms`);
    }
  }, []);

  const { appendLog, logEntries } = usePlaybackLog(
    [uiText[defaultLanguage].logs.appReady],
    {
      onAppend: (entry) => {
        appFileLogger.appendDetailedLog({
          details: fileLogContextRef.current,
          message: entry,
          source: "ui-log",
        });
      },
    },
  );
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
  const v1ToV2UpgradePreferences =
    useV1ToV2UpgradePreferences();
  const scoreLibrary = useScoreLibrary({
    appendLog,
    onBeforeLibraryMutation: () => stopPreviewRef.current(),
    onBeforeMissingPlaybackSongRemoval: (songId) =>
      missingPlaybackSongRemovalRef.current(songId),
    onMissingLocalSongsRemoved: (removedSongs) =>
      missingLocalSongsRemovedRef.current(removedSongs),
    showNotice: showAppNotice,
    text,
  });
  const playbackOrder = usePlaybackOrder();
  const playbackQueue = usePlaybackQueue({
    appendLog,
    librarySongsRef: scoreLibrary.librarySongsRef,
    showNotice: showAppNotice,
    text: text.logs,
  });
  missingLocalSongsRemovedRef.current = (removedSongs) => {
    synchronizeRemovedLibrarySongsWithPlayback(removedSongs, {
      removeSongFromPlaybackContext:
        playbackOrder.removeSongFromPlaybackContext,
      removeSongIndices: playbackQueue.removeSongIndices,
    });
  };
  function handlePlaybackSongIndexChange(songIndex: number | null) {
    scoreLibrary.setPlaybackSongIndex(songIndex);
    scoreLibrary.setSelectedSongIndex(songIndex);
  }
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
    librarySongsRef: scoreLibrary.librarySongsRef,
    resolveSongForPlayback: scoreLibrary.resolveSongForPlayback,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setSelectedSongIndex: handlePlaybackSongIndexChange,
    startQueuePlayback: playbackQueue.startQueuePlayback,
    text,
  });
  const experimentalInput = useExperimentalInput({
    appendLog,
    consumeNextQueueItemAfterCurrent:
      playbackQueue.consumeNextQueueItemAfterCurrent,
    consumeQueuedItemAfterCurrent:
      playbackQueue.consumeQueuedItemAfterCurrent,
    currentSong: scoreLibrary.currentSelectedSong,
    currentPlaybackSongIndex: scoreLibrary.playbackSongIndex,
    getPlaybackOrderNextSongIndex: (options) =>
      playbackOrder.getNextPlaybackOrderSongIndex({
        ...options,
        librarySongs: scoreLibrary.librarySongs,
      }),
    getSongIdentityForPlayback: (songIndex) =>
      scoreLibrary.librarySongs[songIndex]?.id ?? null,
    librarySongsRef: scoreLibrary.librarySongsRef,
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    keyMapping,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    playbackMode: previewPlayback.playbackMode,
    playbackSpeed: previewPlayback.playbackSpeed,
    peekNextQueueItemAfterCurrent:
      playbackQueue.peekNextQueueItemAfterCurrent,
    resolveSongForPlayback: scoreLibrary.resolveSongForPlayback,
    resolveSongForWarmPreparation:
      scoreLibrary.resolveSongForWarmPreparation,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setRequestedPlaybackSongIndex: scoreLibrary.setPlaybackSongIndex,
    setSelectedSongIndex: handlePlaybackSongIndexChange,
    showNotice: showAppNotice,
    startQueuePlayback: playbackQueue.startQueuePlayback,
    stopPreviewPlayback: previewPlayback.stopCurrentPreview,
    text,
  });
  function warmPlaybackPlan(songIndex: number) {
    void experimentalInput.handlePrepareExperimentalSong(songIndex);
  }

  function handleLibrarySongSelection(songIndex: number) {
    scoreLibrary.handleSelectImportedSong(songIndex);
    warmPlaybackPlan(songIndex);
  }

  function handleAddSongToQueue(songIndex: number) {
    playbackQueue.addToQueue(songIndex);
    warmPlaybackPlan(songIndex);
  }

  function handlePlaySongNext(songIndex: number) {
    playbackQueue.playNext(songIndex);
    warmPlaybackPlan(songIndex);
  }
  const appPersistence = useAppPersistence({
    appendDetailedLog: appFileLogger.appendDetailedLog,
    appendLog,
    applyConfirmBeforeExit: handleConfirmBeforeExitChange,
    applyExperimentalInputPreferences:
      experimentalInput.applyExperimentalInputPreferences,
    applyKeyMapping,
    applyPlaybackSettings: previewPlayback.applyPlaybackSettings,
    applyPlaybackShortcuts: playbackShortcutsController.setPlaybackShortcuts,
    applyScoreLibrary: scoreLibrary.applyScoreLibrary,
    applyV1ToV2UpgradePreferences:
      v1ToV2UpgradePreferences.applyPersistedPreferences,
    canSaveAppData: scoreLibrary.hasLoadedBuiltInSongs,
    confirmBeforeExit,
    experimentalInputEnabled: experimentalInput.experimentalInputEnabled,
    experimentalInputMode: experimentalInput.experimentalInputMode,
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    keyMapping,
    language,
    librarySongs: scoreLibrary.localLibrarySongs,
    likedSongs: scoreLibrary.likedSongs,
    migrationFallbackSongs: scoreLibrary.migrationFallbackSongs,
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
    showNotice: showAppNotice,
    targetWindowCompatibilityProfile:
      experimentalInput.targetWindowCompatibilityProfile,
    targetWindowKeyHoldMs: experimentalInput.targetWindowKeyHoldMs,
    targetWindowMessageMethod: experimentalInput.targetWindowMessageMethod,
    text: text.logs,
    validCollectionSongIds: scoreLibrary.validCollectionSongIds,
    v1ToV2UpgradePreferences:
      v1ToV2UpgradePreferences.preferences,
  });
  const playbackOutput = usePlaybackOutput({
    experimentalInput,
    previewPlayback,
    text: text.bottomPlayer,
  });
  missingPlaybackSongRemovalRef.current = (removedPlaybackSongId) => {
    if (
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: [
          previewPlayback.getActivePreviewPlaybackSongId(),
          experimentalInput.getActiveForegroundPlaybackSongId(),
          experimentalInput.getActiveTargetWindowPlaybackSongId(),
        ],
        removedPlaybackSongId,
      })
    ) {
      playbackOutput.onStop();
    }
  };
  const playbackCoordinator = usePlaybackCoordinator({
    appendLog,
    experimentalInput,
    onManualNextDecision: (details) =>
      appFileLogger.appendDetailedLog({
        details,
        message: "Manual next decision",
        source: "playback",
      }),
    playbackOrder,
    playbackOutput,
    playbackQueue,
    scoreLibrary,
    text,
  });
  const libraryDialogs = useLibraryDialogs({
    librarySongs: scoreLibrary.librarySongs,
    onDeleteLocalSong: playbackCoordinator.handleDeleteLocalSong,
    onDeletePlaylist: scoreLibrary.handleDeletePlaylist,
    onRenamePlaylist: scoreLibrary.handleRenamePlaylist,
    playlists: scoreLibrary.playlists,
    isLocalSongDeleteBlocked: shouldBlockLocalSongDeletion({
      isBackgroundHandoffPending: experimentalInput.isBackgroundHandoffPending,
      isForegroundStartPending: experimentalInput.isForegroundStartPending,
      isImportedScoreReconciliationInProgress:
        appPersistence.isImportedScoreReconciliationInProgress,
    }),
    selectedSongId: scoreLibrary.selectedSongId,
    text: text.library,
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
    experimentalInput.isForegroundStartPending ||
    experimentalInput.isExperimentalPlaybackRunning;
  const scoreUpgradeGuard = useScoreUpgradeGuard({
    appendLog,
    isAnyPlaybackActive,
    isImportedScoreReconciliationInProgress:
      appPersistence.isImportedScoreReconciliationInProgress,
    showNotice: showAppNotice,
    text: text.logs,
  });

  useEffect(() => {
    let isMounted = true;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        const closeRequestDecision = getExitCloseRequestDecision({
          confirmBeforeExit: confirmBeforeExitRef.current,
          isDialogOpen: isCloseConfirmOpenRef.current,
          isExitInProgress: isClosingAfterConfirmRef.current,
          isPreferenceSaveInProgress:
            isConfirmBeforeExitSavingRef.current,
        });

        event.preventDefault();

        if (closeRequestDecision === "ignore") {
          return;
        }

        if (closeRequestDecision === "force-close") {
          void requestAppShutdown().catch(() => {});
          return;
        }

        openCloseConfirmationDialog();
        appendDetailedLogRef.current({
          details: fileLogContextRef.current,
          message: "Native close requested; confirmation dialog opened",
          source: "window",
        });
      })
      .then((unlistenCloseRequested) => {
        if (!isMounted) {
          unlistenCloseRequested();
          return;
        }

        closeRequestedUnlistenRef.current = unlistenCloseRequested;
      })
      .catch((error) => {
        appendDetailedLogRef.current({
          details: { error: String(error instanceof Error ? error.message : error) },
          level: "warn",
          message: "Failed to register close confirmation handler",
          source: "window",
        });
      });

    return () => {
      isMounted = false;
      closeRequestedUnlistenRef.current?.();
      closeRequestedUnlistenRef.current = null;
    };
  }, []);

  useEffect(() => {
    stopPreviewRef.current = playbackOutput.onStop;
  }, [playbackOutput.onStop]);

  useEffect(() => {
    fileLogContextRef.current = {
      activeSection,
      isExperimentalInputEnabled: experimentalInput.experimentalInputEnabled,
      language,
      noteIntervalDelayMs: playbackOutput.noteIntervalDelayMs,
      outputMode: playbackOutput.mode,
      playbackMode: playbackOutput.playbackMode,
      playbackSpeed: playbackOutput.playbackSpeed,
      playbackState: playbackOutput.playbackState,
      selectedSongIndex: scoreLibrary.selectedSongIndex,
      selectedSongName:
        scoreLibrary.currentSelectedSong === null
          ? null
          : getLibrarySongName(scoreLibrary.currentSelectedSong),
      targetWindowCompatibilityProfile:
        experimentalInput.targetWindowCompatibilityProfile,
      targetWindowHwnd: experimentalInput.selectedWindowHwnd,
    };
  });

  useEffect(() => {
    playbackShortcutsController.setPlaybackHotkeyControls({
      next: () => {
        runScoreUpgradePlaybackStartGuard({
          getIsScoreUpgradeInProgress:
            scoreLibrary.getIsScoreUpgradeInProgress,
          onBlocked: scoreUpgradeGuard.reportPlaybackStartBlocked,
          onStart: playbackCoordinator.handleNextPlayback,
        });
      },
      pauseResume: () => {
        if (playbackOutput.playbackState === "playing") {
          playbackOutput.onPause();
          return;
        }

        runScoreUpgradePlaybackStartGuard({
          getIsScoreUpgradeInProgress:
            scoreLibrary.getIsScoreUpgradeInProgress,
          onBlocked: scoreUpgradeGuard.reportPlaybackStartBlocked,
          onStart: () => {
            if (playbackOutput.playbackState === "paused") {
              playbackOutput.onResume();
              return;
            }

            if (
              playbackOutput.canPlay &&
              !playbackCoordinator.isCurrentSongLoading
            ) {
              void playbackCoordinator.handleBottomPlayerPlay();
            }
          },
        });
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

  function handleAppDragEnter(event: ReactDragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingScoreFiles(true);
  }

  function handleAppDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = isAnyPlaybackActive ? "none" : "copy";
  }

  function handleAppDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDraggingScoreFiles(false);
    }
  }

  function handleAppDrop(event: ReactDragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingScoreFiles(false);

    const files = Array.from(event.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    if (!isAnyPlaybackActive) {
      setActiveSection("Library");
      scoreLibrary.handleLibraryCategoryChange("local-imports");
    }

    handleImportScoreFiles(files);
  }

  async function handleConfirmAppClose() {
    const result = await runExitConfirmationAction(
      closeConfirmationGuardRef.current,
      setIsCloseConfirmSaving,
      {
        doNotAskAgain: closeConfirmDialog.doNotAskAgain,
        exit: closeAppAfterConfirmation,
        persistConfirmBeforeExit: async (nextConfirmBeforeExit) => {
          await appPersistence.saveConfirmBeforeExitPreference(
            nextConfirmBeforeExit,
          );
          handleConfirmBeforeExitChange(nextConfirmBeforeExit);
        },
      },
    );

    if (result.status === "preference-save-failed") {
      reportConfirmBeforeExitSaveFailure(result.error);
      return;
    }

    if (result.status === "exit-failed") {
      openCloseConfirmationDialog();
    }
  }

  async function closeAppAfterConfirmation() {
    dismissCloseConfirmationDialog();
    appFileLogger.appendDetailedLog({
      details: fileLogContextRef.current,
      message: "Close confirmed",
      source: "window",
    });

    await requestAppShutdown();
  }

  async function requestAppShutdown() {
    const result = await runForceCloseAction(
      isClosingAfterConfirmRef,
      forceCloseApp,
    );

    if (result.status === "failure") {
      reportAppShutdownFailure(result.error);
      throw result.error;
    }
  }

  function handleConfirmBeforeExitChange(nextConfirmBeforeExit: boolean) {
    confirmBeforeExitRef.current = nextConfirmBeforeExit;
    setConfirmBeforeExit(nextConfirmBeforeExit);
  }

  async function handleConfirmBeforeExitSettingChange(
    nextConfirmBeforeExit: boolean,
  ) {
    const result = await runConfirmBeforeExitPreferenceChange(
      confirmBeforeExitSettingGuardRef.current,
      setConfirmBeforeExitSavingState,
      {
        applyConfirmBeforeExit: handleConfirmBeforeExitChange,
        nextConfirmBeforeExit,
        persistConfirmBeforeExit:
          appPersistence.saveConfirmBeforeExitPreference,
      },
    );

    if (result.status === "preference-save-failed") {
      reportConfirmBeforeExitSaveFailure(result.error);
    }
  }

  function setConfirmBeforeExitSavingState(isSaving: boolean) {
    isConfirmBeforeExitSavingRef.current = isSaving;
    setIsConfirmBeforeExitSaving(isSaving);
  }

  function reportConfirmBeforeExitSaveFailure(error: unknown) {
    const errorMessage = String(
      error instanceof Error ? error.message : error,
    );
    const message = formatText(text.logs.appDataSaveFailed, {
      error: errorMessage,
    });

    appendLog(message);
    showAppNotice(message);
    appFileLogger.appendDetailedLog({
      details: { error: errorMessage },
      level: "error",
      message: "Failed to save exit confirmation preference",
      source: "window",
    });
  }

  function reportAppShutdownFailure(error: unknown) {
    const errorMessage = String(
      error instanceof Error ? error.message : error,
    );
    const message = text.closeConfirm.closeFailed;

    appendLog(message);
    showAppNotice(message);
    appFileLogger.appendDetailedLog({
      details: { error: errorMessage },
      level: "error",
      message: "Force-close command failed",
      source: "window",
    });
  }

  function openCloseConfirmationDialog() {
    isCloseConfirmOpenRef.current = true;
    setCloseConfirmDialog(openExitConfirmationDialog());
  }

  function dismissCloseConfirmationDialog() {
    isCloseConfirmOpenRef.current = false;
    setCloseConfirmDialog(dismissExitConfirmationDialog());
  }

  function renderActiveSection() {
    if (activeSection === "Library") {
      return (
        <LibraryPanel
          builtInPagination={scoreLibrary.builtInPagination}
          importError={scoreLibrary.importError}
          importDisabled={isAnyPlaybackActive}
          isV1ToV2UpgradePreferenceReady={
            getV1ToV2UpgradePreferenceReadiness(
              appPersistence.hasLoadedAppData,
            )
          }
          isQueueOpen={queueOpen}
          hasSearchQuery={scoreLibrary.hasSearchQuery}
          items={scoreLibrary.pagedVisibleLibraryItems}
          locateScoreRequest={scoreLibrary.locateScoreRequest}
          onAddSongToPlaylist={scoreLibrary.handleAddSongToPlaylist}
          onAddToQueue={handleAddSongToQueue}
          onCreatePlaylistWithSong={scoreLibrary.handleCreatePlaylistWithSong}
          onCreatePlaylistRequest={() => setIsCreatingPlaylistFromSidebar(true)}
          onDeleteLocalSong={libraryDialogs.requestDeleteLocalSong}
          onDeletePlaylist={libraryDialogs.requestDeletePlaylist}
          onImportFiles={handleImportScoreFiles}
          onLocateSelectedSong={scoreLibrary.handleLocateSelectedSong}
          onPrepareSong={warmPlaybackPlan}
          onPlaySong={playbackCoordinator.handlePlayLibraryItem}
          onPlaySongNext={handlePlaySongNext}
          onRemoveFromLiked={playbackCoordinator.handleRemoveFromLiked}
          onRemoveSongFromPlaylist={
            playbackCoordinator.handleRemoveSongFromPlaylist
          }
          onResolveUpgradeSource={scoreLibrary.preloadSong}
          onUpgradeSourceLoadFailed={(item) =>
            scoreLibrary.reportUpgradeSourceLoadFailure(
              item.librarySong.id,
            )
          }
          onRenamePlaylist={libraryDialogs.requestRenamePlaylist}
          onSearchQueryChange={scoreLibrary.setSearchQuery}
          onSelectSong={handleLibrarySongSelection}
          onToggleLiked={playbackCoordinator.handleToggleLikedSong}
          onUpgradeBlocked={scoreUpgradeGuard.reportBlocked}
          onUpgradeSongToV2={(songId, sourceSong, options) =>
            scoreLibrary.handleUpgradeSongToV2(songId, options, {
              getBlockedMessage: scoreUpgradeGuard.getBlockedMessage,
              resolvedSourceSong: sourceSong,
            })
          }
          onV1ToV2UpgradePreferencesChange={
            v1ToV2UpgradePreferences.updatePreferences
          }
          playlists={scoreLibrary.playlists}
          searchQuery={scoreLibrary.searchQuery}
          selectedCategory={scoreLibrary.selectedLibraryCategory}
          selectedPlaylist={scoreLibrary.selectedPlaylist}
          selectedPlaylistId={scoreLibrary.selectedPlaylistId}
          selectedSongIndex={scoreLibrary.selectedSongIndex}
          upgradeBlocked={scoreUpgradeGuard.isBlocked}
          v1ToV2UpgradePreferences={
            v1ToV2UpgradePreferences.preferences
          }
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
          confirmBeforeExit={confirmBeforeExit}
          isConfirmBeforeExitSaving={isConfirmBeforeExitSaving}
          experimentalInput={{
            candidateWindows: experimentalInput.candidateWindows,
            experimentalInputEnabled:
              experimentalInput.experimentalInputEnabled,
            experimentalPlaybackProgress:
              experimentalInput.experimentalPlaybackProgress,
            isDetectingSkyWindow: experimentalInput.isDetectingSkyWindow,
            isExperimentalPlaybackRunning:
              experimentalInput.isExperimentalPlaybackRunning,
            isTargetWindowSelectionLocked:
              experimentalInput.isTargetWindowSelectionLocked,
            isRefreshingWindows: experimentalInput.isRefreshingWindows,
            lastError: experimentalInput.lastError,
            skyMonitorStatus: experimentalInput.skyMonitorStatus,
            onDetectSkyWindow: experimentalInput.handleDetectSkyWindow,
            onExperimentalInputEnabledChange:
              experimentalInput.setExperimentalInputEnabled,
            onExperimentalInputModeChange:
              experimentalInput.handleExperimentalInputModeChange,
            onRefreshWindows: experimentalInput.handleRefreshWindows,
            onSelectedWindowChange: experimentalInput.setSelectedWindowHwnd,
            onTargetWindowCompatibilityProfileChange:
              experimentalInput.setTargetWindowCompatibilityProfile,
            selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
            selectedWindowSnapshot: experimentalInput.selectedWindowSnapshot,
            targetWindowCompatibilityProfile:
              experimentalInput.targetWindowCompatibilityProfile,
            experimentalInputMode: experimentalInput.experimentalInputMode,
            foregroundCountdown: experimentalInput.foregroundCountdown,
            foregroundPlaybackState: experimentalInput.foregroundPlaybackState,
          }}
          keyMapping={keyMapping}
          language={language}
          listeningSkyKey={listeningSkyKey}
          onKeyMappingListenStart={handleStartKeyMappingListen}
          onConfirmBeforeExitChange={handleConfirmBeforeExitSettingChange}
          onLanguageChange={setLanguage}
          appRuntimeInfo={appFileLogger.runtimeInfo}
          onOpenLogDirectory={appFileLogger.openLogDirectory}
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
    <main
      className="app-shell"
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      <AppSidebar
        activeSection={activeSection}
        onCreatePlaylistRequest={() => {
          setActiveSection("Library");
          setIsCreatingPlaylistFromSidebar(true);
        }}
        onLibraryCategorySelect={(category) => {
          setActiveSection("Library");
          scoreLibrary.handleLibraryCategoryChange(category);
        }}
        onPlaylistSelect={(playlistId) => {
          setActiveSection("Library");
          scoreLibrary.handleLibraryCategoryChange("playlists");
          scoreLibrary.setSelectedPlaylistId(playlistId);
        }}
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
          onLogsClick={() => setActiveSection("Logs")}
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

      {isDraggingScoreFiles ? (
        <div
          className={`app-drag-import-overlay${
            isAnyPlaybackActive ? " is-disabled" : ""
          }`}
          aria-hidden="true"
        >
          <div className="app-drag-import-card">
            <span className="app-drag-import-icon" aria-hidden="true">
              {isAnyPlaybackActive ? <CircleAlert /> : <FileUp />}
            </span>
            <strong>{text.dragImport.title}</strong>
            <span>
              {isAnyPlaybackActive
                ? text.dragImport.disabledDescription
                : text.dragImport.description}
            </span>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel={text.library.cancelDelete}
        confirmLabel={text.library.confirmDelete}
        description={libraryDialogs.deleteDialogDescription}
        isConfirming={libraryDialogs.isDeleteInProgress}
        open={libraryDialogs.isDeleteDialogOpen}
        title={libraryDialogs.deleteDialogTitle}
        variant="danger"
        onCancel={libraryDialogs.cancelDelete}
        onConfirm={libraryDialogs.confirmDelete}
        onOpenChange={libraryDialogs.handleDeleteDialogOpenChange}
      />

      <ConfirmDialog
        cancelLabel={text.closeConfirm.cancel}
        confirmLabel={text.closeConfirm.confirm}
        description={text.closeConfirm.description}
        isConfirming={isCloseConfirmSaving}
        open={closeConfirmDialog.isOpen}
        title={text.closeConfirm.title}
        onCancel={dismissCloseConfirmationDialog}
        onConfirm={handleConfirmAppClose}
        onOpenChange={(open) => {
          if (!open) {
            dismissCloseConfirmationDialog();
          }
        }}
      >
        <label className="confirm-dialog-option">
          <input
            checked={closeConfirmDialog.doNotAskAgain}
            disabled={isCloseConfirmSaving}
            type="checkbox"
            onChange={(event) => {
              setCloseConfirmDialog((currentDialog) => ({
                ...currentDialog,
                doNotAskAgain: event.target.checked,
              }));
            }}
          />
          <span>{text.closeConfirm.doNotAskAgain}</span>
        </label>
      </ConfirmDialog>

      {libraryDialogs.pendingRenamePlaylist ? (
        <RenamePlaylistDialog
          initialName={libraryDialogs.pendingRenamePlaylist.playlistName}
          onClose={libraryDialogs.cancelRename}
          onRename={libraryDialogs.confirmRename}
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
        canSeek={playbackOutput.canSeek}
        currentSong={scoreLibrary.currentPlaybackSong}
        isCurrentSongLoading={playbackCoordinator.isCurrentSongLoading}
        isRealInputOutput={playbackOutput.isRealInputOutput}
        isShuffleEnabled={playbackOutput.isShuffleEnabled}
        noteIntervalDelayMs={playbackOutput.noteIntervalDelayMs}
        onNoteIntervalDelayChange={playbackOutput.onNoteIntervalDelayChange}
        onNext={playbackCoordinator.handleNextPlayback}
        onPause={playbackOutput.onPause}
        onPlayQueueItem={playbackCoordinator.handlePlayQueueItem}
        onPlay={playbackCoordinator.handleBottomPlayerPlay}
        onPlaybackSpeedChange={playbackOutput.onPlaybackSpeedChange}
        onQueueClear={playbackCoordinator.handleQueueClear}
        onQueueItemRemove={playbackCoordinator.handleQueueItemRemove}
        onQueueToggle={() => setQueueOpen((isOpen) => !isOpen)}
        onQueueClose={() => setQueueOpen(false)}
        onRepeatModeCycle={playbackOutput.onRepeatModeCycle}
        onResume={playbackOutput.onResume}
        onSeek={(timeMs) => {
          appFileLogger.appendDetailedLog({
            details: {
              ...fileLogContextRef.current,
              seekTargetMs: Math.round(timeMs),
            },
            message:
              playbackOutput.playbackState === "finished"
                ? "Progress seek requested after finish"
                : "Progress seek requested",
            source: "playback",
          });
          playbackOutput.onSeek(timeMs);
        }}
        onShuffleToggle={playbackOutput.onShuffleToggle}
        onStop={playbackOutput.onStop}
        outputModeLabel={playbackOutput.outputModeLabel}
        playbackMode={playbackOutput.playbackMode}
        playbackState={playbackOutput.playbackState}
        playbackSpeed={playbackOutput.playbackSpeed}
        progress={playbackOutput.progress}
        queueItems={playbackQueue.queueItems}
        queueOpen={queueOpen}
        songs={scoreLibrary.librarySongs}
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

function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export default App;
