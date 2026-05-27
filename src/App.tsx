import { useState } from "react";
import { testRustCommand } from "./lib/tauriApi";
import "./App.css";

type PanelHeaderProps = {
  id: string;
  title: string;
  description: string;
};

type KeyboardPreviewProps = {
  keys: string[];
};

type PlaybackLogProps = {
  entries: string[];
};

function PanelHeader({ id, title, description }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function ScoreInput() {
  return (
    <section className="panel score-panel" aria-labelledby="score-input-title">
      <PanelHeader
        id="score-input-title"
        title="Score input area"
        description="A simple score editor will be added in a later phase."
      />
      <textarea
        aria-labelledby="score-input-title"
        placeholder="Score input is not active yet."
        disabled
      />
    </section>
  );
}

function KeyboardPreview({ keys }: KeyboardPreviewProps) {
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
          <button className="key-button" type="button" disabled key={key}>
            {key}
          </button>
        ))}
      </div>
    </section>
  );
}

type PlaybackControlsProps = {
  onTestRust: () => void;
};

function PlaybackControls({ onTestRust }: PlaybackControlsProps) {
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
        {entries.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  const previewKeys = ["A", "S", "D", "F", "G", "H", "J", "K"];
  const [logEntries, setLogEntries] = useState([
    "App layout is ready.",
    "No playback features yet.",
  ]);

  async function handleTestRust() {
    try {
      const message = await testRustCommand();
      setLogEntries((currentEntries) => [...currentEntries, message]);
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
        <ScoreInput />
        <KeyboardPreview keys={previewKeys} />
        <PlaybackControls onTestRust={handleTestRust} />
        <PlaybackLog entries={logEntries} />
      </div>
    </main>
  );
}

export default App;
