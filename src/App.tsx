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
import { LibraryPanel } from "./components/LibraryPanel";
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
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import { forceCloseApp } from "./lib/tauriApi";
import "../font/iconfont.css";
import "./App.css";

function App() {
  const stopPreviewRef = useRef<() => void>(() => {});
  const isClosingAfterConfirmRef = useRef(false);
  const closeRequestedUnlistenRef = useRef<(() => void) | null>(null);
  const fileLogContextRef = useRef<Record<string, unknown>>({});
  const dragDepthRef = useRef(0);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
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
    importedSongsRef: scoreLibrary.importedSongsRef,
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
    importedSongsRef: scoreLibrary.importedSongsRef,
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    keyMapping,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    playbackMode: previewPlayback.playbackMode,
    playbackSpeed: previewPlayback.playbackSpeed,
    peekNextQueueItemAfterCurrent:
      playbackQueue.peekNextQueueItemAfterCurrent,
    resolveSongForPlayback: scoreLibrary.resolveSongForPlayback,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setRequestedPlaybackSongIndex: scoreLibrary.setPlaybackSongIndex,
    setSelectedSongIndex: handlePlaybackSongIndexChange,
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
  const playbackCoordinator = usePlaybackCoordinator({
    appendLog,
    experimentalInput,
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
    isLocalSongDeleteBlocked: experimentalInput.isBackgroundHandoffPending,
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
    experimentalInput.isExperimentalPlaybackRunning;

  useEffect(() => {
    let isMounted = true;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (isClosingAfterConfirmRef.current) {
          return;
        }

        event.preventDefault();
        setIsCloseConfirmOpen(true);
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
      selectedSongName: scoreLibrary.currentSelectedSong?.name ?? null,
      targetWindowCompatibilityProfile:
        experimentalInput.targetWindowCompatibilityProfile,
      targetWindowHwnd: experimentalInput.selectedWindowHwnd,
    };
  });

  useEffect(() => {
    playbackShortcutsController.setPlaybackHotkeyControls({
      next: playbackCoordinator.handleNextPlayback,
      pauseResume: () => {
        if (playbackOutput.playbackState === "playing") {
          playbackOutput.onPause();
          return;
        }

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
    isClosingAfterConfirmRef.current = true;
    setIsCloseConfirmOpen(false);
    appFileLogger.appendDetailedLog({
      details: fileLogContextRef.current,
      message: "Close confirmed",
      source: "window",
    });

    try {
      await forceCloseApp();
    } catch (error) {
      appFileLogger.appendDetailedLog({
        details: { error: String(error instanceof Error ? error.message : error) },
        level: "warn",
        message: "Force-close command failed; trying window close fallback",
        source: "window",
      });

      try {
        await getCurrentWindow().close();
      } catch (fallbackError) {
        isClosingAfterConfirmRef.current = false;
        appFileLogger.appendDetailedLog({
          details: {
            error: String(
              fallbackError instanceof Error
                ? fallbackError.message
                : fallbackError,
            ),
          },
          level: "error",
          message: "Failed to close app after confirmation",
          source: "window",
        });
        setIsCloseConfirmOpen(true);
      }
    }
  }

  function renderActiveSection() {
    if (activeSection === "Library") {
      return (
        <LibraryPanel
          builtInPagination={scoreLibrary.builtInPagination}
          importError={scoreLibrary.importError}
          importDisabled={isAnyPlaybackActive}
          isQueueOpen={queueOpen}
          hasSearchQuery={scoreLibrary.hasSearchQuery}
          items={scoreLibrary.pagedVisibleLibraryItems}
          locateScoreRequest={scoreLibrary.locateScoreRequest}
          onAddSongToPlaylist={scoreLibrary.handleAddSongToPlaylist}
          onAddToQueue={playbackQueue.addToQueue}
          onCreatePlaylistWithSong={scoreLibrary.handleCreatePlaylistWithSong}
          onCreatePlaylistRequest={() => setIsCreatingPlaylistFromSidebar(true)}
          onDeleteLocalSong={libraryDialogs.requestDeleteLocalSong}
          onDeletePlaylist={libraryDialogs.requestDeletePlaylist}
          onImportFiles={handleImportScoreFiles}
          onLocateSelectedSong={scoreLibrary.handleLocateSelectedSong}
          onPrepareSong={(songIndex) => {
            void experimentalInput.handlePrepareExperimentalSong(songIndex);
          }}
          onPlaySong={playbackCoordinator.handlePlayLibraryItem}
          onPlaySongNext={playbackQueue.playNext}
          onRemoveFromLiked={playbackCoordinator.handleRemoveFromLiked}
          onRemoveSongFromPlaylist={
            playbackCoordinator.handleRemoveSongFromPlaylist
          }
          onRenamePlaylist={libraryDialogs.requestRenamePlaylist}
          onSearchQueryChange={scoreLibrary.setSearchQuery}
          onSelectSong={scoreLibrary.handleSelectImportedSong}
          onToggleLiked={playbackCoordinator.handleToggleLikedSong}
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
        open={libraryDialogs.isDeleteDialogOpen}
        title={libraryDialogs.deleteDialogTitle}
        variant="danger"
        onCancel={libraryDialogs.cancelDelete}
        onConfirm={libraryDialogs.confirmDelete}
        onOpenChange={(open) => {
          if (!open) {
            libraryDialogs.cancelDelete();
          }
        }}
      />

      <ConfirmDialog
        cancelLabel={text.closeConfirm.cancel}
        confirmLabel={text.closeConfirm.confirm}
        description={text.closeConfirm.description}
        open={isCloseConfirmOpen}
        title={text.closeConfirm.title}
        onCancel={() => setIsCloseConfirmOpen(false)}
        onConfirm={handleConfirmAppClose}
        onOpenChange={(open) => {
          if (!open) {
            setIsCloseConfirmOpen(false);
          }
        }}
      />

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

function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export default App;
