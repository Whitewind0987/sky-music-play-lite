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
import { exampleScores } from "./data/exampleScores";
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
import { parseTextScore } from "./lib/scoreParser";
import { testRustCommand } from "./lib/tauriApi";
import type { Note, Song } from "./types/score";
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
  const [scoreInput, setScoreInput] = useState("1Key5 1Key6 1Key7 2Key1");
  const [parsedNotes, setParsedNotes] = useState<Note[]>([]);
  const [parseError, setParseError] = useState("");
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

  useEffect(() => {
    return () => {
      previewStopRef.current?.();
    };
  }, []);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
  }

  function handleParseScore() {
    try {
      const notes = parseTextScore(scoreInput);
      setParsedNotes(notes);
      setParseError("");
      setSelectedSongIndex(null);
    } catch (error) {
      setParsedNotes([]);
      setParseError(String(error instanceof Error ? error.message : error));
    }
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
      setParsedNotes(songs[0].songNotes);
      setImportError("");
      setParseError("");
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

    if (songIndex !== null) {
      setParsedNotes(importedSongs[songIndex]?.songNotes ?? []);
      setParseError("");
    }
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
      const selectedSong =
        selectedSongIndex === null ? null : importedSongs[selectedSongIndex];
      const notes = selectedSong ? selectedSong.songNotes : parseTextScore(scoreInput);

      setParsedNotes(notes);
      setParseError("");
      setIsPreviewPlaying(true);
      appendLog(
        selectedSong
          ? formatText(text.logs.previewStartedFromSong, {
              songName: selectedSong.name,
            })
          : text.logs.previewStarted,
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
      setParsedNotes([]);
      setParseError(String(error instanceof Error ? error.message : error));
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
          error={parseError}
          importedSongs={importedSongs}
          importError={importError}
          input={scoreInput}
          notes={parsedNotes}
          onImportFile={handleImportScoreFile}
          onInputChange={setScoreInput}
          onParseScore={handleParseScore}
          onSelectImportedSong={handleSelectImportedSong}
          selectedSongIndex={selectedSongIndex}
          songs={exampleScores}
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
        noteCount={parsedNotes.length}
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
