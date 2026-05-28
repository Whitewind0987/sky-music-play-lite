import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  WorkspaceOverview,
  type AppSection,
} from "./components/AppShell";
import { PlaybackLog } from "./components/LogPanel";
import {
  defaultKeyboardPreviewKeys,
  KeyboardPreview,
  PlaybackControls,
} from "./components/PlaybackPanel";
import { ScoreInput } from "./components/ScorePanel";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
} from "./i18n/uiText";
import {
  schedulePreviewPlayback,
  type PreviewPlaybackController,
} from "./lib/playbackScheduler";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "./lib/scoreFileImport";
import { testRustCommand } from "./lib/tauriApi";
import type { PlaybackState } from "./types/playback";
import type { Song } from "./types/score";
import "../font/iconfont.css";
import "./App.css";

function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function App() {
  const playbackControllerRef = useRef<PreviewPlaybackController | null>(null);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [activeSection, setActiveSection] = useState<AppSection>("Workspace");
  const [logEntries, setLogEntries] = useState<string[]>(() => [
    uiText[defaultLanguage].logs.appReady,
    uiText[defaultLanguage].logs.noPlaybackYet,
  ]);
  const text = uiText[language];
  const currentSelectedSong =
    selectedSongIndex === null ? null : importedSongs[selectedSongIndex] ?? null;

  useEffect(() => {
    return () => {
      playbackControllerRef.current?.stop();
    };
  }, []);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
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
      setImportedSongs([]);
      setSelectedSongIndex(null);
      setImportError(String(error instanceof Error ? error.message : error));
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    stopCurrentPreview();
    setSelectedSongIndex(songIndex);
  }

  function stopCurrentPreview(nextState: PlaybackState = "idle") {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    setActiveKeys([]);
    setPlaybackState(nextState);
  }

  function handlePlayPreview() {
    stopCurrentPreview();

    try {
      if (!currentSelectedSong) {
        appendLog(text.logs.noSelectedScore);
        return;
      }

      const notes = currentSelectedSong.songNotes;

      setPlaybackState("playing");
      appendLog(
        formatText(text.logs.previewStartedFromSong, {
          songName: currentSelectedSong.name,
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
          setPlaybackState("finished");
          playbackControllerRef.current = null;
          appendLog(text.logs.previewFinished);
        },
      );
    } catch (error) {
      stopCurrentPreview();
      appendLog(String(error instanceof Error ? error.message : error));
    }
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
            keys={defaultKeyboardPreviewKeys}
            text={text.keyboard}
          />
          <PlaybackControls
            canPlayPreview={currentSelectedSong !== null}
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
          language={language}
          onLanguageChange={setLanguage}
          text={text.settings}
        />
      );
    }

    return (
      <WorkspaceOverview
        isPreviewPlaying={playbackState === "playing"}
        logCount={logEntries.length}
        noteCount={currentSelectedSong?.songNotes.length ?? 0}
        text={text.workspace}
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
    </main>
  );
}

export default App;
