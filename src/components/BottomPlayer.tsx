import type { UiText } from "../i18n/uiText";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { PlaybackState } from "../types/playback";
import {
  noteIntervalDelayOptions,
  playbackModes,
  playbackSpeedOptions,
  type NoteIntervalDelayMs,
  type PlaybackMode,
  type PlaybackSpeed,
} from "../types/playbackOptions";
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
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onPause: () => void;
  onPlay: () => void;
  onPlaybackModeChange: (playbackMode: PlaybackMode) => void;
  onPlaybackSpeedChange: (playbackSpeed: PlaybackSpeed) => void;
  onResume: () => void;
  onStop: () => void;
  playbackMode: PlaybackMode;
  playbackState: PlaybackState;
  playbackSpeed: PlaybackSpeed;
  progress: PreviewPlaybackProgress;
  text: UiText["bottomPlayer"];
};

function formatPlaybackTime(timeMs: number) {
  const totalSeconds = Math.floor(Math.max(timeMs, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function BottomPlayer({
  currentSong,
  noteIntervalDelayMs,
  onNoteIntervalDelayChange,
  onPause,
  onPlay,
  onPlaybackModeChange,
  onPlaybackSpeedChange,
  onResume,
  onStop,
  playbackMode,
  playbackState,
  playbackSpeed,
  progress,
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
  const progressPercent = Math.min(Math.max(progress.percent, 0), 100);

  return (
    <footer className="bottom-player" aria-label={text.aria}>
      <div
        className="bottom-player-progress-track"
        aria-label={text.progress}
        aria-valuemax={progress.totalMs}
        aria-valuemin={0}
        aria-valuenow={Math.min(progress.currentMs, progress.totalMs)}
        role="progressbar"
      >
        <span
          className="bottom-player-progress-value"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="bottom-player-body">
        <div className="bottom-player-score">
          <span className="bottom-player-label">{text.currentScore}</span>
          <strong className="bottom-player-title">
            {currentSong?.name ?? text.noScore}
          </strong>
          <div className="bottom-player-meta-line">
            <span className="bottom-player-meta-item">
              {text.bpm}: {currentSong?.bpm ?? "--"}
            </span>
            <span className="bottom-player-meta-item">
              {text.notes}: {currentSong?.songNotes.length ?? "--"}
            </span>
            <span className="bottom-player-meta-item">
              {text.state}: {text.states[playbackState]}
            </span>
            <span className="bottom-player-meta-item bottom-player-time">
              {formatPlaybackTime(progress.currentMs)} /{" "}
              {formatPlaybackTime(progress.totalMs)}
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
          <div className="bottom-player-options" aria-label={text.optionsAria}>
          <label className="player-option">
            <span className="player-option-label">{text.mode}</span>
            <select
              className="player-option-select"
              value={playbackMode}
              onChange={(event) =>
                onPlaybackModeChange(event.target.value as PlaybackMode)
              }
            >
              {playbackModes.map((mode) => (
                <option value={mode} key={mode}>
                  {text.playbackModes[mode]}
                </option>
              ))}
            </select>
          </label>

          <label className="player-option">
            <span className="player-option-label">{text.delay}</span>
            <select
              className="player-option-select"
              value={noteIntervalDelayMs}
              onChange={(event) =>
                onNoteIntervalDelayChange(
                  Number(event.target.value) as NoteIntervalDelayMs,
                )
              }
            >
              {noteIntervalDelayOptions.map((delayMs) => (
                <option value={delayMs} key={delayMs}>
                  {delayMs > 0 ? `+${delayMs}` : delayMs} ms
                </option>
              ))}
            </select>
          </label>

          <label className="player-option">
            <span className="player-option-label">{text.speed}</span>
            <select
              className="player-option-select"
              value={playbackSpeed}
              onChange={(event) =>
                onPlaybackSpeedChange(Number(event.target.value) as PlaybackSpeed)
              }
            >
              {playbackSpeedOptions.map((speed) => (
                <option value={speed} key={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>
          </div>

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
      </div>
    </footer>
  );
}
