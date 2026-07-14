import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { UiText } from "../i18n/uiText";
import {
  getLibrarySongBpm,
  getLibrarySongFormatVersion,
  getLibrarySongName,
  getLibrarySongNoteCount,
} from "../lib/libraryCollections";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { PlaybackState } from "../types/playback";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type { LibrarySong } from "../types/library";
import {
  normalizeNoteIntervalDelay,
  normalizePlaybackSpeed,
  noteIntervalDelayLimits,
  playbackSpeedLimits,
  type NoteIntervalDelayMs,
  type PlaybackMode,
  type PlaybackSpeed,
} from "../types/playbackOptions";
import { QueuePanel } from "./QueuePanel";
import {
  PauseIcon,
  PlayIcon,
  NextIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  StopIcon,
} from "./PlayerIcons";

type BottomPlayerProps = {
  canPlay: boolean;
  canSeek: boolean;
  currentSong: LibrarySong | null;
  isCurrentSongLoading: boolean;
  isShuffleEnabled: boolean;
  isRealInputOutput: boolean;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onNext: () => void;
  onPlayQueueItem: (queueItem: PlaybackQueueItem) => void;
  onPause: () => void;
  onPlay: () => void;
  onPlaybackSpeedChange: (playbackSpeed: PlaybackSpeed) => void;
  onQueueClear: () => void;
  onQueueClose: () => void;
  onQueueItemRemove: (queueItemId: string) => void;
  onQueueToggle: () => void;
  onRepeatModeCycle: () => void;
  onResume: () => void;
  onSeek: (timeMs: number) => void;
  onShuffleToggle: () => void;
  onStop: () => void;
  outputModeLabel: string;
  playbackMode: PlaybackMode;
  playbackState: PlaybackState;
  playbackSpeed: PlaybackSpeed;
  progress: PreviewPlaybackProgress;
  queueItems: PlaybackQueueItem[];
  queueOpen: boolean;
  songs: LibrarySong[];
  text: UiText["bottomPlayer"];
};

function formatPlaybackTime(timeMs: number) {
  const totalSeconds = Math.floor(Math.max(timeMs, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatProgressTooltipTime(timeMs: number) {
  const totalSeconds = Math.floor(Math.max(timeMs, 0) / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function clampProgressTime(timeMs: number, totalMs: number) {
  if (!Number.isFinite(timeMs)) {
    return 0;
  }

  return Math.min(Math.max(timeMs, 0), Math.max(totalMs, 0));
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
  canPlay,
  canSeek,
  currentSong,
  isCurrentSongLoading,
  isShuffleEnabled,
  isRealInputOutput,
  noteIntervalDelayMs,
  onNoteIntervalDelayChange,
  onNext,
  onPlayQueueItem,
  onPause,
  onPlay,
  onPlaybackSpeedChange,
  onQueueClear,
  onQueueClose,
  onQueueItemRemove,
  onQueueToggle,
  onRepeatModeCycle,
  onResume,
  onSeek,
  onShuffleToggle,
  onStop,
  outputModeLabel,
  playbackMode,
  playbackState,
  playbackSpeed,
  progress,
  queueItems,
  queueOpen,
  songs,
  text,
}: BottomPlayerProps) {
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewClearFrameRef = useRef<number | null>(null);
  const queueButtonRef = useRef<HTMLButtonElement | null>(null);
  const queuePanelRef = useRef<HTMLDivElement | null>(null);
  const [dragTimeMs, setDragTimeMs] = useState<number | null>(null);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const canPause = playbackState === "playing";
  const isV2Song =
    currentSong !== null && getLibrarySongFormatVersion(currentSong) === 2;
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
          disabled:
            playbackState === "paused"
              ? !canResume
              : !canPlay || isCurrentSongLoading,
          icon: <PlayIcon />,
          label: playbackState === "paused" ? text.resume : text.play,
          onClick: playbackState === "paused" ? onResume : onPlay,
        };
  const totalProgressMs = Math.max(progress.totalMs, 0);
  const currentProgressMs = clampProgressTime(
    progress.currentMs,
    totalProgressMs,
  );
  const canUseProgressSeek = canSeek && totalProgressMs > 0;
  const displayMs =
    dragTimeMs === null
      ? currentProgressMs
      : clampProgressTime(dragTimeMs, totalProgressMs);
  const displayPercent =
    totalProgressMs > 0 ? Math.min(Math.max((displayMs / totalProgressMs) * 100, 0), 100) : 0;
  const tooltipText = `${formatProgressTooltipTime(
    displayMs,
  )} / ${formatProgressTooltipTime(totalProgressMs)}`;
  const isRepeatActive = playbackMode !== "sequence";
  const RepeatModeIcon =
    playbackMode === "repeat-one" ? RepeatOneIcon : RepeatIcon;

  function getProgressTimeFromClientX(clientX: number) {
    const rect = progressTrackRef.current?.getBoundingClientRect();

    if (!rect || rect.width <= 0 || totalProgressMs <= 0) {
      return 0;
    }

    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

    return ratio * totalProgressMs;
  }

  function handleProgressPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canUseProgressSeek || event.button !== 0) {
      return;
    }

    const targetMs = getProgressTimeFromClientX(event.clientX);

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsProgressDragging(true);
    setIsProgressHovering(true);
    setDragTimeMs(targetMs);
  }

  function handleProgressPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isProgressDragging || !canUseProgressSeek) {
      return;
    }

    event.preventDefault();
    setDragTimeMs(getProgressTimeFromClientX(event.clientX));
  }

  function commitProgressSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isProgressDragging || !canUseProgressSeek) {
      return;
    }

    const targetMs = clampProgressTime(
      getProgressTimeFromClientX(event.clientX),
      totalProgressMs,
    );

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    event.preventDefault();
    setIsProgressDragging(false);
    setDragTimeMs(targetMs);
    onSeek(targetMs);

    if (dragPreviewClearFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewClearFrameRef.current);
    }

    dragPreviewClearFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewClearFrameRef.current = null;
      setDragTimeMs(null);
    });
  }

  function cancelProgressSeek(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsProgressDragging(false);
    setDragTimeMs(null);
  }

  function handleProgressKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!canUseProgressSeek) {
      return;
    }

    const seekStepMs = 5000;
    let nextTimeMs: number | null = null;

    if (event.key === "ArrowLeft") {
      nextTimeMs = currentProgressMs - seekStepMs;
    } else if (event.key === "ArrowRight") {
      nextTimeMs = currentProgressMs + seekStepMs;
    } else if (event.key === "Home") {
      nextTimeMs = 0;
    } else if (event.key === "End") {
      nextTimeMs = totalProgressMs;
    }

    if (nextTimeMs === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSeek(clampProgressTime(nextTimeMs, totalProgressMs));
  }

  useEffect(() => {
    if (!queueOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        queuePanelRef.current?.contains(target) ||
        queueButtonRef.current?.contains(target)
      ) {
        return;
      }

      onQueueClose();
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onQueueClose();
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [onQueueClose, queueOpen]);

  useEffect(() => {
    if (canUseProgressSeek) {
      return;
    }

    setDragTimeMs(null);
    setIsProgressDragging(false);
    setIsProgressHovering(false);
  }, [canUseProgressSeek]);

  useEffect(() => {
    return () => {
      if (dragPreviewClearFrameRef.current !== null) {
        window.cancelAnimationFrame(dragPreviewClearFrameRef.current);
      }
    };
  }, []);

  return (
    <footer className="bottom-player" aria-label={text.aria}>
      {queueOpen ? (
        <div ref={queuePanelRef}>
          <QueuePanel
            onClearQueue={onQueueClear}
            onPlayQueueItem={onPlayQueueItem}
            onRemoveQueueItem={onQueueItemRemove}
            queueItems={queueItems}
            songs={songs}
            text={text}
          />
        </div>
      ) : null}

      <div
        className={`bottom-player-progress${
          canUseProgressSeek && isProgressHovering ? " is-hovering" : ""
        }${canUseProgressSeek && isProgressDragging ? " is-dragging" : ""}${
          !canUseProgressSeek ? " is-disabled" : ""
        }`}
        aria-label={text.progress}
        aria-valuemax={Math.round(totalProgressMs)}
        aria-valuemin={0}
        aria-valuenow={Math.round(displayMs)}
        aria-valuetext={tooltipText}
        role="slider"
        tabIndex={canUseProgressSeek ? 0 : -1}
        onKeyDown={handleProgressKeyDown}
        onPointerCancel={cancelProgressSeek}
        onPointerDown={handleProgressPointerDown}
        onPointerEnter={() => {
          if (canUseProgressSeek) {
            setIsProgressHovering(true);
          }
        }}
        onPointerLeave={() => {
          if (!isProgressDragging) {
            setIsProgressHovering(false);
          }
        }}
        onPointerMove={handleProgressPointerMove}
        onPointerUp={commitProgressSeek}
      >
        <div className="bottom-player-progress-track" ref={progressTrackRef}>
          <span
            className="bottom-player-progress-value"
            style={{ width: `${displayPercent}%` }}
          />
          <span
            className="bottom-player-progress-thumb"
            style={{ left: `${displayPercent}%` }}
          />
        </div>
        <span
          className="bottom-player-progress-tooltip"
          style={{ left: `${displayPercent}%` }}
        >
          {tooltipText}
        </span>
      </div>

      <div className="bottom-player-body">
        <div className="bottom-player-score">
          <span className="bottom-player-label">{text.currentScore}</span>
          <div className="bottom-player-title-row">
            <strong className="bottom-player-title">
              {currentSong ? getLibrarySongName(currentSong) : text.noScore}
            </strong>
            <span className="bottom-player-output-badge">
              {outputModeLabel}
            </span>
            {isCurrentSongLoading ? (
              <span className="bottom-player-loading-badge">
                {text.loadingScore}
              </span>
            ) : null}
            {isRealInputOutput ? (
              <span className="bottom-player-real-input-badge">
                {text.realInputWarning}
              </span>
            ) : null}
            {isV2Song ? (
              <span className="bottom-player-v2-badge" title={text.v2Score}>
                V2
              </span>
            ) : null}
          </div>
          <div className="bottom-player-meta-line">
            <span className="bottom-player-meta-item">
              {text.bpm}: {currentSong ? getLibrarySongBpm(currentSong) : "--"}
            </span>
            <span className="bottom-player-meta-item">
              {text.notes}:{" "}
              {currentSong ? getLibrarySongNoteCount(currentSong) : "--"}
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
            className="player-icon-button player-icon-button-secondary player-icon-button-stop"
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
            aria-label={text.next}
            onClick={onNext}
          >
            <NextIcon />
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
            className={`player-icon-button player-icon-button-secondary bottom-player-queue-button${
              queueOpen ? " is-active" : ""
            }`}
            type="button"
            aria-label={text.queue}
            aria-pressed={queueOpen}
            ref={queueButtonRef}
            onClick={onQueueToggle}
          >
            <QueueIcon />
            {queueItems.length > 0 ? (
              <span className="bottom-player-queue-count">
                {queueItems.length}
              </span>
            ) : null}
            <span className="visually-hidden">{text.queue}</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
