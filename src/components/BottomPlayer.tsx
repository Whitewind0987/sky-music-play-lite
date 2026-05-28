import type { UiText } from "../i18n/uiText";
import type { PlaybackState } from "../types/playback";
import type { Song } from "../types/score";
import {
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  StopIcon,
} from "./PlayerIcons";

type BottomPlayerProps = {
  currentSong: Song | null;
  onPause: () => void;
  onPlay: () => void;
  onResume: () => void;
  onStop: () => void;
  playbackState: PlaybackState;
  text: UiText["bottomPlayer"];
};

export function BottomPlayer({
  currentSong,
  onPause,
  onPlay,
  onResume,
  onStop,
  playbackState,
  text,
}: BottomPlayerProps) {
  const hasSong = currentSong !== null;
  const canPlay =
    hasSong && (playbackState === "idle" || playbackState === "finished");
  const canPause = playbackState === "playing";
  const canResume = playbackState === "paused";
  const canStop = playbackState === "playing" || playbackState === "paused";
  const primaryAction =
    playbackState === "playing"
      ? {
          disabled: !canPause,
          icon: <PauseIcon />,
          label: text.pause,
          onClick: onPause,
        }
      : {
          disabled: playbackState === "paused" ? !canResume : !canPlay,
          icon: <PlayIcon />,
          label: playbackState === "paused" ? text.resume : text.play,
          onClick: playbackState === "paused" ? onResume : onPlay,
        };

  return (
    <footer className="bottom-player" aria-label={text.aria}>
      <div className="bottom-player-progress-track" aria-label={text.progress}>
        <span className="bottom-player-progress-value" />
      </div>

      <div className="bottom-player-score">
        <span className="bottom-player-label">{text.currentScore}</span>
        <strong className="bottom-player-title">
          {currentSong?.name ?? text.noScore}
        </strong>
        <div className="bottom-player-meta">
          <span>
            {text.bpm}: {currentSong?.bpm ?? "--"}
          </span>
          <span>
            {text.notes}: {currentSong?.songNotes.length ?? "--"}
          </span>
          <span>
            {text.state}: {text.states[playbackState]}
          </span>
        </div>
      </div>

      <div className="bottom-player-center" aria-label={text.controlsAria}>
        <button
          className="player-icon-button player-icon-button-secondary"
          type="button"
          aria-label={text.shuffle}
          disabled
        >
          <ShuffleIcon />
          <span className="visually-hidden">{text.shuffle}</span>
        </button>
        <button
          className="player-icon-button player-icon-button-secondary"
          type="button"
          aria-label={text.stop}
          disabled={!canStop}
          onClick={onStop}
        >
          <StopIcon />
        </button>
        <button
          className="player-icon-button player-icon-button-primary"
          type="button"
          aria-label={primaryAction.label}
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.icon}
        </button>
        <button
          className="player-icon-button player-icon-button-secondary"
          type="button"
          aria-label={text.repeat}
          disabled
        >
          <RepeatIcon />
          <span className="visually-hidden">{text.repeat}</span>
        </button>
      </div>

      <div className="bottom-player-actions">
        <button
          className="player-icon-button player-icon-button-secondary"
          type="button"
          aria-label={text.queue}
          disabled
        >
          <QueueIcon />
          <span className="visually-hidden">{text.queue}</span>
        </button>
      </div>
    </footer>
  );
}
