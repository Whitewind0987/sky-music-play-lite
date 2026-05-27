import { useEffect, useRef, useState } from "react";
import { exampleScores } from "./data/exampleScores";
import { schedulePreviewPlayback } from "./lib/playbackScheduler";
import { parseTextScore } from "./lib/scoreParser";
import { testRustCommand } from "./lib/tauriApi";
import type { Note, Song } from "./types/score";
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
  input: string;
  notes: Note[];
  onInputChange: (value: string) => void;
  onParseScore: () => void;
  songs: Song[];
};

type ExampleScoresProps = {
  songs: Song[];
};

function PanelHeader({ id, title, description }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
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
  input,
  notes,
  onInputChange,
  onParseScore,
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
          {isPreviewPlaying ? "Restart Preview" : "Play Preview"}
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
  const [activeKey, setActiveKey] = useState("");
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
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
    } catch (error) {
      setParsedNotes([]);
      setParseError(String(error instanceof Error ? error.message : error));
    }
  }

  function stopCurrentPreview() {
    previewStopRef.current?.();
    previewStopRef.current = null;
    setActiveKey("");
    setIsPreviewPlaying(false);
  }

  function handlePlayPreview() {
    stopCurrentPreview();

    try {
      const notes = parseTextScore(scoreInput);
      setParsedNotes(notes);
      setParseError("");
      setIsPreviewPlaying(true);
      appendLog("Preview started.");

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Header area</p>
          <h1>SkyMusicPlay Lite</h1>
        </div>
        <p>App is running</p>
      </header>

      <div className="app-layout">
        <ScoreInput
          error={parseError}
          input={scoreInput}
          notes={parsedNotes}
          onInputChange={setScoreInput}
          onParseScore={handleParseScore}
          songs={exampleScores}
        />
        <KeyboardPreview activeKey={activeKey} keys={previewKeys} />
        <PlaybackControls
          isPreviewPlaying={isPreviewPlaying}
          onPlayPreview={handlePlayPreview}
          onTestRust={handleTestRust}
        />
        <PlaybackLog entries={logEntries} />
      </div>
    </main>
  );
}

export default App;
