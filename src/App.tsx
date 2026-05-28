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
import { schedulePreviewPlayback } from "./lib/playbackScheduler";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "./lib/scoreFileImport";
import { testRustCommand } from "./lib/tauriApi";
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
  const previewStopRef = useRef<(() => void) | null>(null);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
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
      previewStopRef.current?.();
    };
  }, []);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
  }

  async function handleImportScoreFile(file: File) {
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
    setSelectedSongIndex(songIndex);
  }

  function stopCurrentPreview() {
    previewStopRef.current?.();
    previewStopRef.current = null;
    setActiveKeys([]);
    setIsPreviewPlaying(false);
  }

  function handlePlayPreview() {
    if (isPreviewPlaying) {
      stopCurrentPreview();
      appendLog(text.logs.previewStopped);
      return;
    }

    stopCurrentPreview();

    try {
      if (!currentSelectedSong) {
        appendLog(text.logs.noSelectedScore);
        return;
      }

      const notes = currentSelectedSong.songNotes;

      setIsPreviewPlaying(true);
      appendLog(
        formatText(text.logs.previewStartedFromSong, {
          songName: currentSelectedSong.name,
        }),
      );

      previewStopRef.current = schedulePreviewPlayback(
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
          setIsPreviewPlaying(false);
          previewStopRef.current = null;
          appendLog(text.logs.previewFinished);
        },
      );
    } catch (error) {
      appendLog(String(error instanceof Error ? error.message : error));
    }
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
            isPreviewPlaying={isPreviewPlaying}
            onPlayPreview={handlePlayPreview}
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
        isPreviewPlaying={isPreviewPlaying}
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
