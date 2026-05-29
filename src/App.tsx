import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
} from "./components/AppShell";
import { BottomPlayer } from "./components/BottomPlayer";
import { HomePanel } from "./components/HomePanel";
import { PlaybackLog } from "./components/LogPanel";
import {
  KeyboardPreview,
  PlaybackControls,
} from "./components/PlaybackPanel";
import { ScoreInput } from "./components/ScorePanel";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
  type UiText,
} from "./i18n/uiText";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "./lib/playbackScheduler";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
  ScoreFileImportError,
} from "./lib/scoreFileImport";
import { dryRunPlayback, testRustCommand } from "./lib/tauriApi";
import {
  defaultKeyMapping,
  type SkyKeyName,
} from "./types/keyMapping";
import type { PlaybackState } from "./types/playback";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
  type NoteIntervalDelayMs,
  type PlaybackMode,
  type PlaybackSpeed,
} from "./types/playbackOptions";
import type { Song } from "./types/score";
import "../font/iconfont.css";
import "./App.css";

const ignoredKeyMappingKeys = new Set(["Alt", "Control", "Meta", "Shift"]);
const letterKeyPattern = /^[a-z]$/i;

function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function formatImportError(error: unknown, text: UiText) {
  if (error instanceof ScoreFileImportError) {
    return formatText(text.score.importErrors[error.code], error.details);
  }

  return String(error instanceof Error ? error.message : error);
}

function getBindableKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (ignoredKeyMappingKeys.has(event.key)) {
    return null;
  }

  if (letterKeyPattern.test(event.key)) {
    return event.key.toLowerCase();
  }

  return event.key;
}

function App() {
  const playbackControllerRef = useRef<PreviewPlaybackController | null>(null);
  const [keyMapping, setKeyMapping] = useState(defaultKeyMapping);
  const [listeningSkyKey, setListeningSkyKey] = useState<SkyKeyName | null>(null);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackProgress, setPlaybackProgress] =
    useState<PreviewPlaybackProgress>({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>(defaultPlaybackMode);
  const [noteIntervalDelayMs, setNoteIntervalDelayMs] =
    useState<NoteIntervalDelayMs>(defaultNoteIntervalDelayMs);
  const [playbackSpeed, setPlaybackSpeed] =
    useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [activeSection, setActiveSection] = useState<AppSection>("Workspace");
  const [logEntries, setLogEntries] = useState<string[]>(() => [
    uiText[defaultLanguage].logs.appReady,
    uiText[defaultLanguage].logs.noPlaybackYet,
  ]);
  const text = uiText[language];
  const currentSelectedSong =
    selectedSongIndex === null ? null : importedSongs[selectedSongIndex] ?? null;
  const previewDurationMs =
    currentSelectedSong === null
      ? 0
      : getAdjustedPreviewDurationMs(currentSelectedSong.songNotes, {
          noteIntervalDelayMs,
          playbackSpeed,
        });
  const bottomPlayerProgress =
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished"
      ? playbackProgress
      : {
          currentMs: 0,
          percent: 0,
          totalMs: previewDurationMs,
        };

  useEffect(() => {
    return () => {
      playbackControllerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (listeningSkyKey === null) {
      return;
    }

    const skyKeyBeingMapped = listeningSkyKey;

    function handleKeyMappingKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setListeningSkyKey(null);
        return;
      }

      const bindableKey = getBindableKey(event);

      if (bindableKey === null) {
        return;
      }

      setKeyMapping((currentMapping) => ({
        ...currentMapping,
        [skyKeyBeingMapped]: bindableKey,
      }));
      setListeningSkyKey(null);
    }

    window.addEventListener("keydown", handleKeyMappingKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyMappingKeyDown);
    };
  }, [listeningSkyKey]);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
  }

  function resetPlaybackProgress() {
    setPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  }

  async function handleImportScoreFile(file: File) {
    stopCurrentPreview();

    try {
      if (!isSupportedScoreFileName(file.name)) {
        throw new Error(text.score.unsupportedFile);
      }

      const content = await file.text();
      const songs = parseScoreFileContent(content);

      setImportedSongs(songs);
      setSelectedSongIndex(0);
      setImportError("");
      appendLog(
        formatText(text.logs.importedScores, {
          count: songs.length,
          fileName: file.name,
        }),
      );
    } catch (error) {
      const importErrorMessage = formatImportError(error, text);

      setImportedSongs([]);
      setSelectedSongIndex(null);
      setImportError(importErrorMessage);
      appendLog(
        formatText(text.logs.importFailed, {
          error: importErrorMessage,
          fileName: file.name,
        }),
      );
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    stopCurrentPreview();
    setSelectedSongIndex(songIndex);
  }

  function handleStartKeyMappingListen(skyKey: SkyKeyName) {
    setListeningSkyKey(skyKey);
  }

  function stopCurrentPreview(nextState: PlaybackState = "idle") {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    setActiveKeys([]);
    setPlaybackState(nextState);
    resetPlaybackProgress();
  }

  function startPreviewForSong(songIndex: number) {
    try {
      const song = importedSongs[songIndex];

      if (!song) {
        appendLog(text.logs.noSelectedScore);
        return;
      }

      const notes = song.songNotes;

      setSelectedSongIndex(songIndex);

      if (notes.length === 0) {
        stopCurrentPreview("finished");
        appendLog(text.logs.previewFinished);
        return;
      }

      setPlaybackState("playing");
      resetPlaybackProgress();
      appendLog(
        formatText(text.logs.previewStartedWithOptions, {
          delayMs: noteIntervalDelayMs,
          songName: song.name,
          speed: playbackSpeed,
        }),
      );

      playbackControllerRef.current = schedulePreviewPlayback(
        notes,
        (noteGroup) => {
          const keys = noteGroup.map((note) => note.key);

          setActiveKeys(keys);
          appendLog(
            formatText(text.logs.playingPreviewKey, { key: keys.join(", ") }),
          );
        },
        () => {
          setActiveKeys([]);
          playbackControllerRef.current = null;

          if (playbackMode === "repeat-one") {
            appendLog(
              formatText(text.logs.repeatOneTriggered, { songName: song.name }),
            );
            startPreviewForSong(songIndex);
            return;
          }

          if (playbackMode === "repeat-all") {
            const nextSongIndex =
              importedSongs.length === 0
                ? songIndex
                : (songIndex + 1) % importedSongs.length;
            const nextSong = importedSongs[nextSongIndex] ?? song;

            appendLog(
              formatText(text.logs.repeatAllTriggered, {
                songName: nextSong.name,
              }),
            );
            startPreviewForSong(nextSongIndex);
            return;
          }

          setPlaybackState("finished");
          appendLog(text.logs.previewFinished);
        },
        {
          noteIntervalDelayMs,
          onProgress: setPlaybackProgress,
          playbackSpeed,
        },
      );
    } catch (error) {
      stopCurrentPreview();
      appendLog(
        formatText(text.logs.playbackError, {
          error: String(error instanceof Error ? error.message : error),
        }),
      );
    }
  }

  function handlePlayPreview() {
    if (selectedSongIndex === null) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    stopCurrentPreview();
    startPreviewForSong(selectedSongIndex);
  }

  function handlePausePreview() {
    if (playbackState !== "playing") {
      return;
    }

    playbackControllerRef.current?.pause();
    setActiveKeys([]);
    setPlaybackState("paused");
    appendLog(text.logs.previewPaused);
  }

  function handleResumePreview() {
    if (playbackState !== "paused") {
      return;
    }

    playbackControllerRef.current?.resume();
    setPlaybackState("playing");
    appendLog(text.logs.previewResumed);
  }

  function handleStopPreview() {
    if (playbackState !== "playing" && playbackState !== "paused") {
      return;
    }

    stopCurrentPreview();
    appendLog(text.logs.previewStopped);
  }

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
    if (!currentSelectedSong) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    try {
      appendLog(
        formatText(text.logs.dryRunStarted, {
          songName: currentSelectedSong.name,
        }),
      );

      const result = await dryRunPlayback(currentSelectedSong.songNotes, keyMapping);
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
    if (activeSection === "Score") {
      return (
        <ScoreInput
          importedSongs={importedSongs}
          importError={importError}
          onImportFile={handleImportScoreFile}
          onSelectImportedSong={handleSelectImportedSong}
          selectedSongIndex={selectedSongIndex}
          text={text.score}
        />
      );
    }

    if (activeSection === "Playback") {
      return (
        <>
          <KeyboardPreview
            activeKeys={activeKeys}
            keyMapping={keyMapping}
            text={text.keyboard}
          />
          <PlaybackControls
            canRunDryRun={currentSelectedSong !== null}
            canPlayPreview={currentSelectedSong !== null}
            onDryRunPlayback={handleDryRunPlayback}
            playbackState={playbackState}
            onPausePreview={handlePausePreview}
            onPlayPreview={handlePlayPreview}
            onResumePreview={handleResumePreview}
            onStopPreview={handleStopPreview}
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
            keyMapping={keyMapping}
            language={language}
            listeningSkyKey={listeningSkyKey}
            onKeyMappingListenStart={handleStartKeyMappingListen}
            onLanguageChange={setLanguage}
            text={text.settings}
          />
      );
    }

    return (
      <HomePanel
        onGoToScore={() => setActiveSection("Score")}
        onSelectSong={handleSelectImportedSong}
        selectedSongIndex={selectedSongIndex}
        songs={importedSongs}
        text={text.home}
      />
    );
  }

  return (
    <main className="app-shell">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
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
        currentSong={currentSelectedSong}
        noteIntervalDelayMs={noteIntervalDelayMs}
        onNoteIntervalDelayChange={setNoteIntervalDelayMs}
        onPause={handlePausePreview}
        onPlay={handlePlayPreview}
        onPlaybackModeChange={setPlaybackMode}
        onPlaybackSpeedChange={setPlaybackSpeed}
        onResume={handleResumePreview}
        onStop={handleStopPreview}
        playbackMode={playbackMode}
        playbackState={playbackState}
        playbackSpeed={playbackSpeed}
        progress={bottomPlayerProgress}
        text={text.bottomPlayer}
      />
    </main>
  );
}

export default App;
