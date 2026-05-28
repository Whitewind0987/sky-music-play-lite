import type { UiText } from "../i18n/uiText";
import {
  getPreviewKeyName,
  skyKeyNames,
  type KeyMapping,
} from "../types/keyMapping";
import type { PlaybackState } from "../types/playback";
import { PanelHeader } from "./PanelHeader";

type KeyboardPreviewProps = {
  activeKeys: string[];
  keyMapping: KeyMapping;
  text: UiText["keyboard"];
};

export function KeyboardPreview({
  activeKeys,
  keyMapping,
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
        {skyKeyNames.map((skyKey) => (
          <button
            className={`key-button${
              activePreviewKeys.includes(skyKey) ? " is-active" : ""
            }`}
            type="button"
            disabled
            key={skyKey}
          >
            <span className="sky-key-label">{skyKey}</span>
            <span className="keyboard-key-label">{keyMapping[skyKey]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type PlaybackControlsProps = {
  canRunDryRun: boolean;
  canPlayPreview: boolean;
  playbackState: PlaybackState;
  onDryRunPlayback: () => void;
  onPausePreview: () => void;
  onPlayPreview: () => void;
  onResumePreview: () => void;
  onStopPreview: () => void;
  onTestRust: () => void;
  text: UiText["playback"];
};

export function PlaybackControls({
  canRunDryRun,
  canPlayPreview,
  playbackState,
  onDryRunPlayback,
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
        <button type="button" disabled={!canRunDryRun} onClick={onDryRunPlayback}>
          {text.rustDryRun}
        </button>
      </div>
    </section>
  );
}
