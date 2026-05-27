import { useEffect, useRef, useState } from "react";
import { exampleScores } from "./data/exampleScores";
import { schedulePreviewPlayback } from "./lib/playbackScheduler";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "./lib/scoreFileImport";
import { parseTextScore } from "./lib/scoreParser";
import { testRustCommand } from "./lib/tauriApi";
import {
  defaultLanguage,
  languageOptions,
  uiText,
  type LanguageCode,
  type UiText,
} from "./i18n/uiText";
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
  keys: PreviewKey[];
  text: UiText["keyboard"];
};

type PlaybackLogProps = {
  entries: string[];
  text: UiText["logs"];
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
  text: UiText["score"];
};

type ExampleScoresProps = {
  songs: Song[];
  text: UiText["score"];
};

type PreviewKey = {
  skyKey: string;
  keyboardKey: string;
};

const defaultKeyboardPreviewKeys: PreviewKey[] = [
  { skyKey: "Key0", keyboardKey: "Y" },
  { skyKey: "Key1", keyboardKey: "U" },
  { skyKey: "Key2", keyboardKey: "I" },
  { skyKey: "Key3", keyboardKey: "O" },
  { skyKey: "Key4", keyboardKey: "P" },
  { skyKey: "Key5", keyboardKey: "H" },
  { skyKey: "Key6", keyboardKey: "J" },
  { skyKey: "Key7", keyboardKey: "K" },
  { skyKey: "Key8", keyboardKey: "L" },
  { skyKey: "Key9", keyboardKey: ";" },
  { skyKey: "Key10", keyboardKey: "N" },
  { skyKey: "Key11", keyboardKey: "M" },
  { skyKey: "Key12", keyboardKey: "," },
  { skyKey: "Key13", keyboardKey: "." },
  { skyKey: "Key14", keyboardKey: "/" },
];

const sidebarItems = [
  {
    iconClass: "icon-Homehomepagemenu",
    section: "Workspace",
  },
  { iconClass: "icon-shuru", section: "Score" },
  { iconClass: "icon-yulan", section: "Playback" },
  { iconClass: "icon-rizhi", section: "Logs" },
  { iconClass: "icon-shezhi", section: "Settings" },
] as const;
type AppSection = (typeof sidebarItems)[number]["section"];

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
  text: UiText;
};

function AppSidebar({ activeSection, onSectionChange, text }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label={text.app.navigationAria}>
      <div className="sidebar-brand">
        <span className="brand-mark">S</span>
        <div>
          <p className="eyebrow">{text.brand.eyebrow}</p>
          <h1>{text.brand.name}</h1>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label={text.app.mainSectionsAria}>
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
            <span>{text.navigation[item.section]}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

type WorkspaceHeaderProps = {
  activeSection: AppSection;
  onSettingsClick: () => void;
  text: UiText;
};

function WorkspaceHeader({
  activeSection,
  onSettingsClick,
  text,
}: WorkspaceHeaderProps) {
  const header = text.sections[activeSection];

  return (
    <header className="workspace-header">
      <h2>{header.title}</h2>
      <div className="header-actions" aria-label={text.app.placeholderActionsAria}>
        <button
          className="icon-action"
          type="button"
          onClick={onSettingsClick}
          title={text.actions.settings}
          aria-label={text.actions.settings}
        >
          <span className="iconfont icon-shezhi" aria-hidden="true" />
        </button>
        <button
          className="icon-action"
          type="button"
          disabled
          title={text.actions.userManual}
          aria-label={text.actions.userManual}
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
  text: UiText["workspace"];
};

function WorkspaceOverview({
  isPreviewPlaying,
  logCount,
  noteCount,
  text,
}: WorkspaceOverviewProps) {
  return (
    <section className="overview-grid" aria-label={text.aria}>
      <article className="overview-card">
        <p className="eyebrow">{text.scoreTitle}</p>
        <h3>
          {noteCount} {text.parsedNotes}
        </h3>
        <p>{text.scoreDescription}</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">{text.playbackTitle}</p>
        <h3>{isPreviewPlaying ? text.previewRunning : text.previewIdle}</h3>
        <p>{text.playbackDescription}</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">{text.logsTitle}</p>
        <h3>
          {logCount} {text.logEntries}
        </h3>
        <p>{text.logsDescription}</p>
      </article>
    </section>
  );
}

function ExampleScores({ songs, text }: ExampleScoresProps) {
  return (
    <div className="example-scores" aria-label={text.exampleScoresAria}>
      {songs.map((song) => (
        <article className="score-card" key={song.name}>
          <h3>{song.name}</h3>
          <dl>
            <div>
              <dt>{text.bpm}</dt>
              <dd>{song.bpm}</dd>
            </div>
            <div>
              <dt>{text.notes}</dt>
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
  text: UiText["score"];
};

function ImportedScores({
  selectedSongIndex,
  songs,
  onSelectImportedSong,
  text,
}: ImportedScoresProps) {
  if (songs.length === 0) {
    return <p className="import-empty">{text.noImportedScores}</p>;
  }

  return (
    <div className="imported-scores" aria-label={text.importedScoresAria}>
      <div className="imported-scores-header">
        <h3>{text.importedScoresTitle}</h3>
        <button type="button" onClick={() => onSelectImportedSong(null)}>
          {text.useTextInput}
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
            <span>{text.bpm} {song.bpm}</span>
            <span>
              {song.songNotes.length} {text.notes}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ParsedNotes({
  notes,
  text,
}: {
  notes: Note[];
  text: UiText["score"];
}) {
  if (notes.length === 0) {
    return <p className="parse-empty">{text.noParsedNotes}</p>;
  }

  return (
    <div className="parsed-notes" aria-label="Parsed score notes">
      <p>
        {notes.length} {text.notesParsed}
      </p>
      <ol>
        {notes.map((note) => (
          <li key={`${note.time}-${note.key}`}>
            <span>{note.key}</span>
            <span>
              {note.time} {text.milliseconds}
            </span>
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
  text,
}: ScoreInputProps) {
  return (
    <section className="panel score-panel" aria-labelledby="score-input-title">
      <PanelHeader
        id="score-input-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <textarea
        aria-labelledby="score-input-title"
        onChange={(event) => onInputChange(event.currentTarget.value)}
        placeholder={text.placeholder}
        value={input}
      />
      <label className="file-import-control">
        <span>{text.importLabel}</span>
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
        text={text}
      />
      <button className="parse-button" type="button" onClick={onParseScore}>
        {text.parseButton}
      </button>
      {error ? <p className="parse-error">{error}</p> : null}
      <ParsedNotes notes={notes} text={text} />
      <ExampleScores songs={songs} text={text} />
    </section>
  );
}

function KeyboardPreview({ activeKey, keys, text }: KeyboardPreviewProps) {
  const activePreviewKey = getPreviewKeyName(activeKey);

  return (
    <section
      className="panel keyboard-panel"
      aria-labelledby="keyboard-preview-title"
    >
      <PanelHeader
        id="keyboard-preview-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <div className="keyboard-grid" aria-label={text.previewAria}>
        {keys.map((key) => (
          <button
            className={`key-button${
              activePreviewKey === key.skyKey ? " is-active" : ""
            }`}
            type="button"
            disabled
            key={key.skyKey}
          >
            <span className="sky-key-label">{key.skyKey}</span>
            <span className="keyboard-key-label">{key.keyboardKey}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function getPreviewKeyName(scoreKey: string) {
  return scoreKey.match(/Key\d+$/)?.[0] ?? scoreKey;
}

function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

type PlaybackControlsProps = {
  isPreviewPlaying: boolean;
  onPlayPreview: () => void;
  onTestRust: () => void;
  text: UiText["playback"];
};

function PlaybackControls({
  isPreviewPlaying,
  onPlayPreview,
  onTestRust,
  text,
}: PlaybackControlsProps) {
  return (
    <section
      className="panel controls-panel"
      aria-labelledby="playback-controls-title"
    >
      <PanelHeader
        id="playback-controls-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <div className="control-row">
        <button type="button" disabled>
          {text.play}
        </button>
        <button type="button" disabled>
          {text.pause}
        </button>
        <button type="button" disabled>
          {text.resume}
        </button>
        <button type="button" disabled>
          {text.stop}
        </button>
        <button
          className={isPreviewPlaying ? "is-playing" : ""}
          type="button"
          onClick={onPlayPreview}
        >
          {isPreviewPlaying ? text.stopPreview : text.playPreview}
        </button>
        <button type="button" onClick={onTestRust}>
          {text.testRust}
        </button>
      </div>
    </section>
  );
}

function PlaybackLog({ entries, text }: PlaybackLogProps) {
  return (
    <section className="panel log-panel" aria-labelledby="playback-log-title">
      <PanelHeader
        id="playback-log-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <ul className="log-list">
        {entries.map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}

type SettingsPlaceholderProps = {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  text: UiText["settings"];
};

function SettingsPlaceholder({
  language,
  onLanguageChange,
  text,
}: SettingsPlaceholderProps) {
  return (
    <section className="settings-grid" aria-label={text.aria}>
      <article className="panel settings-panel">
        <PanelHeader
          id="settings-system-title"
          title={text.systemTitle}
          description={text.systemDescription}
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>{text.language}</span>
            <div className="language-options">
              {languageOptions.map((option) => (
                <button
                  className={`language-option${
                    language === option.code ? " is-selected" : ""
                  }`}
                  key={option.code}
                  type="button"
                  aria-pressed={language === option.code}
                  onClick={() => onLanguageChange(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>{text.theme}</span>
            <span className="fake-segment">{text.systemTheme}</span>
          </div>
          <div className="setting-row">
            <span>{text.defaultPage}</span>
            <span className="fake-select">{text.home}</span>
          </div>
        </div>
      </article>

      <article className="panel settings-panel">
        <PanelHeader
          id="settings-preview-title"
          title={text.previewTitle}
          description={text.previewDescription}
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>{text.detailedLogs}</span>
            <span className="fake-toggle is-on" />
          </div>
          <div className="setting-row">
            <span>{text.realKeyboardMode}</span>
            <span className="fake-toggle" />
          </div>
          <div className="setting-row">
            <span>{text.manual}</span>
            <span className="fake-link">{text.openLater}</span>
          </div>
        </div>
      </article>
    </section>
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
  const [activeKey, setActiveKey] = useState("");
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
    setActiveKey("");
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
        (note) => {
          setActiveKey(note.key);
          appendLog(formatText(text.logs.playingPreviewKey, { key: note.key }));
        },
        () => {
          setActiveKey("");
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
            activeKey={activeKey}
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
