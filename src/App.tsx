import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
} from "./components/AppShell";
import { BottomPlayer } from "./components/BottomPlayer";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlaybackLog } from "./components/LogPanel";
import {
  KeyboardPreview,
  PlaybackControls,
} from "./components/PlaybackPanel";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import { useExperimentalInput } from "./hooks/useExperimentalInput";
import { useKeyMapping } from "./hooks/useKeyMapping";
import { usePlaybackLog } from "./hooks/usePlaybackLog";
import { usePreviewPlayback } from "./hooks/usePreviewPlayback";
import { useScoreLibrary } from "./hooks/useScoreLibrary";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import { formatText } from "./lib/formatText";
import { dryRunPlayback, testRustCommand } from "./lib/tauriApi";
import "../font/iconfont.css";
import "./App.css";

function App() {
  const stopPreviewRef = useRef<() => void>(() => {});
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const text = uiText[language];
  const { appendLog, logEntries, setLogEntries } = usePlaybackLog([
    uiText[defaultLanguage].logs.appReady,
    uiText[defaultLanguage].logs.noPlaybackYet,
  ]);
  const { handleStartKeyMappingListen, keyMapping, listeningSkyKey } =
    useKeyMapping();
  const scoreLibrary = useScoreLibrary({
    appendLog,
    onBeforeLibraryMutation: () => stopPreviewRef.current(),
    text,
  });
  const previewPlayback = usePreviewPlayback({
    appendLog,
    currentSelectedSong: scoreLibrary.currentSelectedSong,
    importedSongs: scoreLibrary.importedSongs,
    importedSongsRef: scoreLibrary.importedSongsRef,
    selectedSongIndex: scoreLibrary.selectedSongIndex,
    setSelectedSongIndex: scoreLibrary.setSelectedSongIndex,
    text,
  });
  const experimentalInput = useExperimentalInput({
    appendLog,
    currentSong: scoreLibrary.currentSelectedSong,
    keyMapping,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    playbackSpeed: previewPlayback.playbackSpeed,
    stopPreviewPlayback: previewPlayback.stopCurrentPreview,
    text,
  });

  useEffect(() => {
    stopPreviewRef.current = previewPlayback.stopCurrentPreview;
  }, [previewPlayback.stopCurrentPreview]);

  async function handleTestRust() {
    try {
      const message = await testRustCommand();
      appendLog(message);
    } catch (error) {
      setLogEntries((currentEntries) => [
        ...currentEntries,
        formatText(text.logs.rustCommandFailed, { error: String(error) }),
      ]);
    }
  }

  async function handleDryRunPlayback() {
    if (!scoreLibrary.currentSelectedSong) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    try {
      appendLog(
        formatText(text.logs.dryRunStarted, {
          songName: scoreLibrary.currentSelectedSong.name,
        }),
      );

      const result = await dryRunPlayback(
        scoreLibrary.currentSelectedSong.songNotes,
        keyMapping,
      );
      const firstNote = result.first_note;
      const lastNote = result.last_note;

      appendLog(
        formatText(text.logs.dryRunFinished, {
          firstKey: firstNote?.key ?? text.logs.noNoteSummary,
          firstMappedKey: firstNote?.mapped_key ?? text.logs.noNoteSummary,
          firstTime: firstNote?.time ?? text.logs.noNoteSummary,
          lastKey: lastNote?.key ?? text.logs.noNoteSummary,
          lastMappedKey: lastNote?.mapped_key ?? text.logs.noNoteSummary,
          lastTime: lastNote?.time ?? text.logs.noNoteSummary,
          noteCount: result.note_count,
          status: text.logs.dryRunStatus[result.status] ?? result.status,
        }),
      );
    } catch (error) {
      appendLog(
        formatText(text.logs.dryRunFailed, {
          error: String(error),
        }),
      );
    }
  }

  function renderActiveSection() {
    if (activeSection === "Library") {
      return (
        <LibraryPanel
          importError={scoreLibrary.importError}
          onImportFiles={scoreLibrary.handleImportScoreFiles}
          onPlaySong={previewPlayback.handlePlayImportedSong}
          onSelectSong={scoreLibrary.handleSelectImportedSong}
          selectedCategory={scoreLibrary.selectedLibraryCategory}
          selectedSongIndex={scoreLibrary.selectedSongIndex}
          songs={scoreLibrary.importedSongs}
          text={text.library}
        />
      );
    }

    if (activeSection === "Playback") {
      return (
        <>
          <KeyboardPreview
            activeKeys={previewPlayback.activeKeys}
            keyMapping={keyMapping}
            text={text.keyboard}
          />
          <PlaybackControls
            canRunDryRun={scoreLibrary.currentSelectedSong !== null}
            canPlayPreview={scoreLibrary.currentSelectedSong !== null}
            onDryRunPlayback={handleDryRunPlayback}
            playbackState={previewPlayback.playbackState}
            onPausePreview={previewPlayback.handlePausePreview}
            onPlayPreview={previewPlayback.handlePlayPreview}
            onResumePreview={previewPlayback.handleResumePreview}
            onStopPreview={previewPlayback.handleStopPreview}
            onTestRust={handleTestRust}
            text={text.playback}
          />
        </>
      );
    }

    if (activeSection === "Logs") {
      return <PlaybackLog entries={logEntries} text={text.logs} />;
    }

    if (activeSection === "Settings") {
      return (
        <SettingsPlaceholder
          experimentalInput={{
            canSendTestKey: experimentalInput.canSendTestKey,
            candidateWindows: experimentalInput.candidateWindows,
            experimentalInputEnabled:
              experimentalInput.experimentalInputEnabled,
            experimentalPlaybackProgress:
              experimentalInput.experimentalPlaybackProgress,
            isDetectingSkyWindow: experimentalInput.isDetectingSkyWindow,
            isExperimentalPlaybackRunning:
              experimentalInput.isExperimentalPlaybackRunning,
            isRefreshingWindows: experimentalInput.isRefreshingWindows,
            isSendingTestKey: experimentalInput.isSendingTestKey,
            lastError: experimentalInput.lastError,
            canStartExperimentalPlayback:
              experimentalInput.canStartExperimentalPlayback,
            canStartForegroundPlayback:
              experimentalInput.canStartForegroundPlayback,
            canStopExperimentalPlayback:
              experimentalInput.canStopExperimentalPlayback,
            canStopForegroundPlayback:
              experimentalInput.canStopForegroundPlayback,
            onDetectSkyWindow: experimentalInput.handleDetectSkyWindow,
            onExperimentalInputEnabledChange:
              experimentalInput.setExperimentalInputEnabled,
            onExperimentalInputModeChange:
              experimentalInput.handleExperimentalInputModeChange,
            onStartForegroundPlayback:
              experimentalInput.handleStartForegroundPlayback,
            onStartExperimentalPlayback:
              experimentalInput.handleStartExperimentalPlayback,
            onRefreshWindows: experimentalInput.handleRefreshWindows,
            onSelectedWindowChange: experimentalInput.setSelectedWindowHwnd,
            onSendForegroundTestKeyScancode:
              experimentalInput.handleSendForegroundTestKeyScancode,
            onSendTestKey: experimentalInput.handleSendTestKey,
            onStopExperimentalPlayback:
              experimentalInput.handleStopExperimentalPlayback,
            onStopForegroundPlayback:
              experimentalInput.handleStopForegroundPlayback,
            selectedWindowHwnd: experimentalInput.selectedWindowHwnd,
            testMappedKey: experimentalInput.testMappedKey,
            testSkyKey: experimentalInput.testSkyKey,
            experimentalInputMode: experimentalInput.experimentalInputMode,
            foregroundCountdown: experimentalInput.foregroundCountdown,
            foregroundPlaybackState: experimentalInput.foregroundPlaybackState,
          }}
          keyMapping={keyMapping}
          language={language}
          listeningSkyKey={listeningSkyKey}
          onKeyMappingListenStart={handleStartKeyMappingListen}
          onLanguageChange={setLanguage}
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
        localImportCount={scoreLibrary.importedSongs.length}
        onLibraryCategoryChange={scoreLibrary.handleLibraryCategoryChange}
        onSectionChange={setActiveSection}
        selectedLibraryCategory={scoreLibrary.selectedLibraryCategory}
        text={text}
      />

      <section className="workspace-shell" aria-label={text.app.contentAria}>
        <WorkspaceHeader
          activeSection={activeSection}
          onSettingsClick={() => setActiveSection("Settings")}
          text={text}
        />

        <div
          className={`app-layout app-layout-${activeSection.toLowerCase()}`}
        >
          {renderActiveSection()}
        </div>
      </section>

      <BottomPlayer
        currentSong={scoreLibrary.currentSelectedSong}
        isShuffleEnabled={previewPlayback.isShuffleEnabled}
        noteIntervalDelayMs={previewPlayback.noteIntervalDelayMs}
        onNoteIntervalDelayChange={
          previewPlayback.handleNoteIntervalDelayChange
        }
        onPause={previewPlayback.handlePausePreview}
        onPlay={previewPlayback.handlePlayPreview}
        onPlaybackSpeedChange={previewPlayback.handlePlaybackSpeedChange}
        onRepeatModeCycle={previewPlayback.handleRepeatModeCycle}
        onResume={previewPlayback.handleResumePreview}
        onShuffleToggle={previewPlayback.handleShuffleToggle}
        onStop={previewPlayback.handleStopPreview}
        playbackMode={previewPlayback.playbackMode}
        playbackState={previewPlayback.playbackState}
        playbackSpeed={previewPlayback.playbackSpeed}
        progress={previewPlayback.bottomPlayerProgress}
        text={text.bottomPlayer}
      />
    </main>
  );
}

export default App;
