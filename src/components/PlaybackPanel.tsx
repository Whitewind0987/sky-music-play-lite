import type { UiText } from "../i18n/uiText";
import type { PlaybackState } from "../types/playback";
import { PanelHeader } from "./PanelHeader";

export type PreviewKey = {
  skyKey: string;
  keyboardKey: string;
};

export const defaultKeyboardPreviewKeys: PreviewKey[] = [
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

type KeyboardPreviewProps = {
  activeKeys: string[];
  keys: PreviewKey[];
  text: UiText["keyboard"];
};

export function KeyboardPreview({
  activeKeys,
  keys,
  text,
}: KeyboardPreviewProps) {
  const activePreviewKeys = activeKeys.map((activeKey) =>
    getPreviewKeyName(activeKey),
  );

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
              activePreviewKeys.includes(key.skyKey) ? " is-active" : ""
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

export function getPreviewKeyName(scoreKey: string) {
  return scoreKey.match(/Key\d+$/)?.[0] ?? scoreKey;
}

type PlaybackControlsProps = {
  canPlayPreview: boolean;
  playbackState: PlaybackState;
  onPausePreview: () => void;
  onPlayPreview: () => void;
  onResumePreview: () => void;
  onStopPreview: () => void;
  onTestRust: () => void;
  text: UiText["playback"];
};

export function PlaybackControls({
  canPlayPreview,
  playbackState,
  onPausePreview,
  onPlayPreview,
  onResumePreview,
  onStopPreview,
  onTestRust,
  text,
}: PlaybackControlsProps) {
  const canStartPlayback =
    canPlayPreview && (playbackState === "idle" || playbackState === "finished");
  const canPausePlayback = playbackState === "playing";
  const canResumePlayback = playbackState === "paused";
  const canStopPlayback =
    playbackState === "playing" || playbackState === "paused";

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
      <p className="playback-state">
        {text.stateLabel}: {text.states[playbackState]}
      </p>
      <div className="control-row">
        <button
          className={playbackState === "playing" ? "is-playing" : ""}
          type="button"
          disabled={!canStartPlayback}
          onClick={onPlayPreview}
        >
          {text.play}
        </button>
        <button
          type="button"
          disabled={!canPausePlayback}
          onClick={onPausePreview}
        >
          {text.pause}
        </button>
        <button
          type="button"
          disabled={!canResumePlayback}
          onClick={onResumePreview}
        >
          {text.resume}
        </button>
        <button
          type="button"
          disabled={!canStopPlayback}
          onClick={onStopPreview}
        >
          {text.stop}
        </button>
        <button type="button" onClick={onTestRust}>
          {text.testRust}
        </button>
      </div>
    </section>
  );
}
