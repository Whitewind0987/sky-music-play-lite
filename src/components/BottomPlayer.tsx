import { useEffect, useState } from "react";
import type { UiText } from "../i18n/uiText";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { PlaybackState } from "../types/playback";
import {
  normalizeNoteIntervalDelay,
  normalizePlaybackSpeed,
  noteIntervalDelayLimits,
  playbackSpeedLimits,
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
  RepeatOneIcon,
  ShuffleIcon,
  StopIcon,
} from "./PlayerIcons";

type BottomPlayerProps = {
  currentSong: Song | null;
  isShuffleEnabled: boolean;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onPause: () => void;
  onPlay: () => void;
  onPlaybackSpeedChange: (playbackSpeed: PlaybackSpeed) => void;
  onRepeatModeCycle: () => void;
  onResume: () => void;
  onShuffleToggle: () => void;
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

function formatNumberInputValue(value: number) {
  return Number(value.toFixed(2)).toString();
}

type PlayerStepperProps = {
  label: string;
  max: number;
  min: number;
  normalizeValue: (value: number) => number;
  onChange: (value: number) => void;
  step: number;
  unit: string;
  value: number;
};

function PlayerStepper({
  label,
  max,
  min,
  normalizeValue,
  onChange,
  step,
  unit,
  value,
}: PlayerStepperProps) {
  const [draftValue, setDraftValue] = useState(formatNumberInputValue(value));

  useEffect(() => {
    setDraftValue(formatNumberInputValue(value));
  }, [value]);

  function commitDraftValue() {
    if (draftValue.trim() === "") {
      setDraftValue(formatNumberInputValue(value));
      return;
    }

    const parsedValue = Number(draftValue);

    if (!Number.isFinite(parsedValue)) {
      setDraftValue(formatNumberInputValue(value));
      return;
    }

    const nextValue = normalizeValue(parsedValue);

    onChange(nextValue);
    setDraftValue(formatNumberInputValue(nextValue));
  }

  function handleStepClick(direction: -1 | 1) {
    const nextValue = normalizeValue(value + step * direction);

    onChange(nextValue);
    setDraftValue(formatNumberInputValue(nextValue));
  }

  return (
    <div className="player-stepper">
      <button
        className="player-stepper-button"
        type="button"
        aria-label={`${label} -`}
        onClick={() => handleStepClick(-1)}
      >
        -
      </button>
      <div className="player-stepper-value">
        <input
          className="player-stepper-input"
          type="number"
          aria-label={label}
          max={max}
          min={min}
          step={step}
          value={draftValue}
          onBlur={commitDraftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitDraftValue();
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              setDraftValue(formatNumberInputValue(value));
            }
          }}
        />
        <span className="player-stepper-unit">{unit}</span>
      </div>
      <button
        className="player-stepper-button"
        type="button"
        aria-label={`${label} +`}
        onClick={() => handleStepClick(1)}
      >
        +
      </button>
    </div>
  );
}

export function BottomPlayer({
  currentSong,
  isShuffleEnabled,
  noteIntervalDelayMs,
  onNoteIntervalDelayChange,
  onPause,
  onPlay,
  onPlaybackSpeedChange,
  onRepeatModeCycle,
  onResume,
  onShuffleToggle,
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
  const isRepeatActive = playbackMode !== "sequence";
  const RepeatModeIcon =
    playbackMode === "repeat-one" ? RepeatOneIcon : RepeatIcon;

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
            className={`player-icon-button player-icon-button-secondary player-icon-button-toggle${
              isShuffleEnabled ? " is-active" : ""
            }`}
            type="button"
            aria-label={
              isShuffleEnabled ? text.shuffleEnabled : text.shuffleDisabled
            }
            aria-pressed={isShuffleEnabled}
            onClick={onShuffleToggle}
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
            className={`player-icon-button player-icon-button-secondary player-icon-button-toggle${
              isRepeatActive ? " is-active" : ""
            }`}
            type="button"
            aria-label={text.repeatAria[playbackMode]}
            aria-pressed={isRepeatActive}
            onClick={onRepeatModeCycle}
          >
            <RepeatModeIcon />
            <span className="visually-hidden">{text.repeat}</span>
          </button>
        </div>

        <div className="bottom-player-actions">
          <div className="bottom-player-options" aria-label={text.optionsAria}>
            <div className="player-option">
              <span className="player-option-label">{text.delay}</span>
              <PlayerStepper
                label={text.delay}
                max={noteIntervalDelayLimits.max}
                min={noteIntervalDelayLimits.min}
                normalizeValue={normalizeNoteIntervalDelay}
                onChange={(value) =>
                  onNoteIntervalDelayChange(value as NoteIntervalDelayMs)
                }
                step={noteIntervalDelayLimits.step}
                unit="ms"
                value={noteIntervalDelayMs}
              />
            </div>

            <div className="player-option">
              <span className="player-option-label">{text.speed}</span>
              <PlayerStepper
                label={text.speed}
                max={playbackSpeedLimits.max}
                min={playbackSpeedLimits.min}
                normalizeValue={normalizePlaybackSpeed}
                onChange={(value) => onPlaybackSpeedChange(value as PlaybackSpeed)}
                step={playbackSpeedLimits.step}
                unit="x"
                value={playbackSpeed}
              />
            </div>
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
