import { useEffect, useRef, useState } from "react";
import { exampleScores } from "./data/exampleScores";
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

type PanelHeaderProps = {
  id: string;
  title: string;
  description: string;
};

type KeyboardPreviewProps = {
  activeKey: string;
  keys: string[];
};

type PlaybackLogProps = {
  entries: string[];
};

type ScoreInputProps = {
  error: string;
  importedSongs: Song[];
  importError: string;
  input: string;
  notes: Note[];
  onImportFile: (file: File) => void;
  onInputChange: (value: string) => void;
  onParseScore: () => void;
  onSelectImportedSong: (songIndex: number | null) => void;
  selectedSongIndex: number | null;
  songs: Song[];
};

type ExampleScoresProps = {
  songs: Song[];
};

const sidebarItems = [
  {
    iconClass: "icon-Homehomepagemenu",
    label: "Home",
    section: "Workspace",
  },
  { iconClass: "icon-shuru", label: "Score", section: "Score" },
  { iconClass: "icon-yulan", label: "Playback", section: "Playback" },
  { iconClass: "icon-rizhi", label: "Logs", section: "Logs" },
  { iconClass: "icon-shezhi", label: "Settings", section: "Settings" },
] as const;
type AppSection = (typeof sidebarItems)[number]["section"];

const sectionHeaders: Record<
  AppSection,
  { eyebrow: string; title: string; status: string }
> = {
  Workspace: {
    eyebrow: "Workspace",
    title: "Music preview workspace",
    status: "App is running",
  },
  Score: {
    eyebrow: "Score",
    title: "Score input",
    status: "Text parsing preview",
  },
  Playback: {
    eyebrow: "Playback",
    title: "Playback preview",
    status: "UI preview only",
  },
  Logs: {
    eyebrow: "Logs",
    title: "Runtime log",
    status: "In-memory messages",
  },
  Settings: {
    eyebrow: "Settings",
    title: "Settings",
    status: "Placeholder only",
  },
};

function PanelHeader({ id, title, description }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

type AppSidebarProps = {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
};

function AppSidebar({ activeSection, onSectionChange }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Application navigation">
      <div className="sidebar-brand">
        <span className="brand-mark">S</span>
        <div>
          <p className="eyebrow">Sky tools</p>
          <h1>SkyMusicPlay Lite</h1>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main sections">
        {sidebarItems.map((item) => (
          <button
            className={`sidebar-link${
              activeSection === item.section ? " is-active" : ""
            }`}
            key={item.section}
            type="button"
            onClick={() => onSectionChange(item.section)}
          >
            <span
              className={`sidebar-icon sidebar-icon-${item.section.toLowerCase()} iconfont ${item.iconClass}`}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

type WorkspaceHeaderProps = {
  activeSection: AppSection;
  onSettingsClick: () => void;
};

function WorkspaceHeader({
  activeSection,
  onSettingsClick,
}: WorkspaceHeaderProps) {
  const header = sectionHeaders[activeSection];

  return (
    <header className="workspace-header">
      <h2>{header.title}</h2>
      <div className="header-actions" aria-label="Placeholder actions">
        <button
          className="icon-action"
          type="button"
          onClick={onSettingsClick}
          title="Settings"
          aria-label="Settings"
        >
          <span className="iconfont icon-shezhi" aria-hidden="true" />
        </button>
        <button
          className="icon-action"
          type="button"
          disabled
          title="User Manual"
          aria-label="User Manual"
        >
          <span className="iconfont icon-wenhao" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

type WorkspaceOverviewProps = {
  isPreviewPlaying: boolean;
  logCount: number;
  noteCount: number;
};

function WorkspaceOverview({
  isPreviewPlaying,
  logCount,
  noteCount,
}: WorkspaceOverviewProps) {
  return (
    <section className="overview-grid" aria-label="Workspace overview">
      <article className="overview-card">
        <p className="eyebrow">Score</p>
        <h3>{noteCount} parsed notes</h3>
        <p>Use the Score section to edit and parse text notes.</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">Playback</p>
        <h3>{isPreviewPlaying ? "Preview running" : "Preview idle"}</h3>
        <p>Use the Playback section to preview highlighted keys.</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">Logs</p>
        <h3>{logCount} log entries</h3>
        <p>Use the Logs section to inspect runtime messages.</p>
      </article>
    </section>
  );
}

function ExampleScores({ songs }: ExampleScoresProps) {
  return (
    <div className="example-scores" aria-label="Example score metadata">
      {songs.map((song) => (
        <article className="score-card" key={song.name}>
          <h3>{song.name}</h3>
          <dl>
            <div>
              <dt>BPM</dt>
              <dd>{song.bpm}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{song.songNotes.length}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

type ImportedScoresProps = {
  selectedSongIndex: number | null;
  songs: Song[];
  onSelectImportedSong: (songIndex: number | null) => void;
};

function ImportedScores({
  selectedSongIndex,
  songs,
  onSelectImportedSong,
}: ImportedScoresProps) {
  if (songs.length === 0) {
    return <p className="import-empty">No imported scores yet.</p>;
  }

  return (
    <div className="imported-scores" aria-label="Imported score files">
      <div className="imported-scores-header">
        <h3>Imported scores</h3>
        <button type="button" onClick={() => onSelectImportedSong(null)}>
          Use text input
        </button>
      </div>
      <div className="imported-score-list">
        {songs.map((song, index) => (
          <button
            className={`imported-score-card${
              selectedSongIndex === index ? " is-selected" : ""
            }`}
            key={`${song.name}-${index}`}
            type="button"
            onClick={() => onSelectImportedSong(index)}
          >
            <span>{song.name}</span>
            <span>BPM {song.bpm}</span>
            <span>{song.songNotes.length} notes</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ParsedNotes({ notes }: { notes: Note[] }) {
  if (notes.length === 0) {
    return <p className="parse-empty">No parsed notes yet.</p>;
  }

  return (
    <div className="parsed-notes" aria-label="Parsed score notes">
      <p>{notes.length} notes parsed.</p>
      <ol>
        {notes.map((note) => (
          <li key={`${note.time}-${note.key}`}>
            <span>{note.key}</span>
            <span>{note.time} ms</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScoreInput({
  error,
  importedSongs,
  importError,
  input,
  notes,
  onImportFile,
  onInputChange,
  onParseScore,
  onSelectImportedSong,
  selectedSongIndex,
  songs,
}: ScoreInputProps) {
  return (
    <section className="panel score-panel" aria-labelledby="score-input-title">
      <PanelHeader
        id="score-input-title"
        title="Score input area"
        description="A simple score editor will be added in a later phase."
      />
      <textarea
        aria-labelledby="score-input-title"
        onChange={(event) => onInputChange(event.currentTarget.value)}
        placeholder="Type score keys, for example: 1Key5 1Key6 1Key7 2Key1"
        value={input}
      />
      <label className="file-import-control">
        <span>Import .json or .txt score file</span>
        <input
          accept=".json,.txt"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            if (file) {
              onImportFile(file);
            }

            event.currentTarget.value = "";
          }}
        />
      </label>
      {importError ? <p className="parse-error">{importError}</p> : null}
      <ImportedScores
        selectedSongIndex={selectedSongIndex}
        songs={importedSongs}
        onSelectImportedSong={onSelectImportedSong}
      />
      <button className="parse-button" type="button" onClick={onParseScore}>
        Parse Score
      </button>
      {error ? <p className="parse-error">{error}</p> : null}
      <ParsedNotes notes={notes} />
      <ExampleScores songs={songs} />
    </section>
  );
}

function KeyboardPreview({ activeKey, keys }: KeyboardPreviewProps) {
  return (
    <section
      className="panel keyboard-panel"
      aria-labelledby="keyboard-preview-title"
    >
      <PanelHeader
        id="keyboard-preview-title"
        title="Keyboard preview area"
        description="Keys are shown as a static preview for now."
      />
      <div className="keyboard-grid" aria-label="Static keyboard preview">
        {keys.map((key) => (
          <button
            className={`key-button${activeKey === key ? " is-active" : ""}`}
            type="button"
            disabled
            key={key}
          >
            {key}
          </button>
        ))}
      </div>
    </section>
  );
}

type PlaybackControlsProps = {
  isPreviewPlaying: boolean;
  onPlayPreview: () => void;
  onTestRust: () => void;
};

function PlaybackControls({
  isPreviewPlaying,
  onPlayPreview,
  onTestRust,
}: PlaybackControlsProps) {
  return (
    <section
      className="panel controls-panel"
      aria-labelledby="playback-controls-title"
    >
      <PanelHeader
        id="playback-controls-title"
        title="Playback controls area"
        description="Playback buttons are placeholders in this phase."
      />
      <div className="control-row">
        <button type="button" disabled>
          Play
        </button>
        <button type="button" disabled>
          Pause
        </button>
        <button type="button" disabled>
          Resume
        </button>
        <button type="button" disabled>
          Stop
        </button>
        <button
          className={isPreviewPlaying ? "is-playing" : ""}
          type="button"
          onClick={onPlayPreview}
        >
          {isPreviewPlaying ? "Stop Preview" : "Play Preview"}
        </button>
        <button type="button" onClick={onTestRust}>
          Test Rust
        </button>
      </div>
    </section>
  );
}

function PlaybackLog({ entries }: PlaybackLogProps) {
  return (
    <section className="panel log-panel" aria-labelledby="playback-log-title">
      <PanelHeader
        id="playback-log-title"
        title="Log area"
        description="Runtime messages will appear here in a later phase."
      />
      <ul className="log-list">
        {entries.map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}

function SettingsPlaceholder() {
  return (
    <section className="settings-grid" aria-label="Settings placeholder">
      <article className="panel settings-panel">
        <PanelHeader
          id="settings-system-title"
          title="System settings"
          description="Real settings will be added in a later phase."
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>Language</span>
            <span className="fake-select">English</span>
          </div>
          <div className="setting-row">
            <span>Theme</span>
            <span className="fake-segment">System</span>
          </div>
          <div className="setting-row">
            <span>Default page</span>
            <span className="fake-select">Home</span>
          </div>
        </div>
      </article>

      <article className="panel settings-panel">
        <PanelHeader
          id="settings-preview-title"
          title="Preview options"
          description="These controls are placeholders and do not save yet."
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>Detailed logs</span>
            <span className="fake-toggle is-on" />
          </div>
          <div className="setting-row">
            <span>Real keyboard mode</span>
            <span className="fake-toggle" />
          </div>
          <div className="setting-row">
            <span>Manual</span>
            <span className="fake-link">Open later</span>
          </div>
        </div>
      </article>
    </section>
  );
}

function App() {
  const previewKeys = [
    "1Key1",
    "1Key2",
    "1Key3",
    "1Key4",
    "1Key5",
    "1Key6",
    "1Key7",
    "1Key8",
    "2Key1",
  ];
  const previewStopRef = useRef<(() => void) | null>(null);
  const [scoreInput, setScoreInput] = useState("1Key5 1Key6 1Key7 2Key1");
  const [parsedNotes, setParsedNotes] = useState<Note[]>([]);
  const [parseError, setParseError] = useState("");
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>("Workspace");
  const [logEntries, setLogEntries] = useState([
    "App layout is ready.",
    "No playback features yet.",
  ]);

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
        throw new Error("Only .json and .txt score files are supported.");
      }

      const content = await file.text();
      const songs = parseScoreFileContent(content);

      setImportedSongs(songs);
      setSelectedSongIndex(0);
      setParsedNotes(songs[0].songNotes);
      setImportError("");
      setParseError("");
      appendLog(`Imported ${songs.length} score(s) from ${file.name}.`);
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
    setActiveKey("");
    setIsPreviewPlaying(false);
  }

  function handlePlayPreview() {
    if (isPreviewPlaying) {
      stopCurrentPreview();
      appendLog("Preview stopped.");
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
          ? `Preview started from imported score: ${selectedSong.name}.`
          : "Preview started.",
      );

      previewStopRef.current = schedulePreviewPlayback(
        notes,
        (note) => {
          setActiveKey(note.key);
          appendLog(`Playing preview key: ${note.key}`);
        },
        () => {
          setActiveKey("");
          setIsPreviewPlaying(false);
          previewStopRef.current = null;
          appendLog("Preview finished.");
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
        `Rust command failed: ${String(error)}`,
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
        />
      );
    }

    if (activeSection === "Playback") {
      return (
        <>
          <KeyboardPreview activeKey={activeKey} keys={previewKeys} />
          <PlaybackControls
            isPreviewPlaying={isPreviewPlaying}
            onPlayPreview={handlePlayPreview}
            onTestRust={handleTestRust}
          />
        </>
      );
    }

    if (activeSection === "Logs") {
      return <PlaybackLog entries={logEntries} />;
    }

    if (activeSection === "Settings") {
      return <SettingsPlaceholder />;
    }

    return (
      <WorkspaceOverview
        isPreviewPlaying={isPreviewPlaying}
        logCount={logEntries.length}
        noteCount={parsedNotes.length}
      />
    );
  }

  return (
    <main className="app-shell">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <section className="workspace-shell" aria-label="Workspace content">
        <WorkspaceHeader
          activeSection={activeSection}
          onSettingsClick={() => setActiveSection("Settings")}
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
