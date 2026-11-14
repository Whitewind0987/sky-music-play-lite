import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Minus, Plus, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
import { previewInstruments, type PreviewInstrument } from "../lib/previewInstrumentSamples";
import type { CustomInstrument } from "../lib/customInstruments";
import type { customInstrumentText } from "../i18n/customInstrumentText";
import type { ManualPlaybackUiState } from "../lib/manualPlaybackState";
import type { ManualStepHoldSource } from "../lib/manualStepHoldController";
import { createManualStepPointerGesture } from "../lib/manualStepPointerGesture";
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
  ManualStepIcon,
  NextIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  StopIcon,
} from "./PlayerIcons";

type BottomPlayerProps = {
  canManualStep: boolean;
  canPlay: boolean;
  canSeek: boolean;
  canStop: boolean;
  canOpenVisualization: boolean;
  currentSong: LibrarySong | null;
  isCurrentSongLoading: boolean;
  isPreviewAudioEnabled: boolean;
  isShuffleEnabled: boolean;
  isRealInputOutput: boolean;
  isVisualizationOpen: boolean;
  manualState: ManualPlaybackUiState;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onNext: () => void;
  onVisualizationClose: () => void;
  onVisualizationOpen: () => void;
  onPlayQueueItem: (queueItem: PlaybackQueueItem) => void;
  onPause: () => void;
  onPreviewAudioToggle: () => void;
  onPreviewVolumeChange: (volume: number) => void;
  previewVolume: number;
  onPreviewInstrumentChange: (instrument: PreviewInstrument | CustomInstrument) => void;
  customInstrumentMenu?: {
    items: CustomInstrument[];
    text: (typeof customInstrumentText)[keyof typeof customInstrumentText];
    onManage: () => void;
  };
  onManualStepHoldBegin: (source: ManualStepHoldSource) => void;
  onManualStepHoldEnd: (source: ManualStepHoldSource) => void;
  onManualStep: () => void;
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
  previewInstrument: string;
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
  buttonStep: number;
  inputStep: number;
  label: string;
  max: number;
  min: number;
  normalizeValue: (value: number) => number;
  onChange: (value: number) => void;
  unit: string;
  value: number;
};

function PlayerStepper({
  buttonStep,
  inputStep,
  label,
  max,
  min,
  normalizeValue,
  onChange,
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
    const nextValue = normalizeValue(value + buttonStep * direction);

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
        <Minus aria-hidden="true" focusable="false" />
      </button>
      <div className="player-stepper-value">
        <input
          className="player-stepper-input"
          type="number"
          aria-label={label}
          max={max}
          min={min}
          step={inputStep}
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
        <Plus aria-hidden="true" focusable="false" />
      </button>
    </div>
  );
}

export function BottomPlayer({
  canManualStep,
  canPlay,
  canSeek,
  canStop,
  canOpenVisualization,
  currentSong,
  isCurrentSongLoading,
  isPreviewAudioEnabled,
  isShuffleEnabled,
  isRealInputOutput,
  isVisualizationOpen,
  manualState,
  noteIntervalDelayMs,
  onNoteIntervalDelayChange,
  onNext,
  onVisualizationClose,
  onVisualizationOpen,
  onPlayQueueItem,
  onPause,
  onPreviewAudioToggle,
  onPreviewVolumeChange,
  previewVolume,
  onPreviewInstrumentChange,
  customInstrumentMenu,
  onManualStepHoldBegin,
  onManualStepHoldEnd,
  onManualStep,
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
  previewInstrument,
  queueItems,
  queueOpen,
  songs,
  text,
}: BottomPlayerProps) {
  const audioLabel = isPreviewAudioEnabled ? text.disablePreviewAudio : text.enablePreviewAudio;
  const selectedBuiltIn = previewInstruments.find(item => item === previewInstrument);
  const instrumentLabel = selectedBuiltIn ? text.previewInstruments[selectedBuiltIn]
    : customInstrumentMenu?.items.find(item => item.id === previewInstrument)?.name ?? text.previewInstruments.piano;
  const AudioIcon = isPreviewAudioEnabled && previewVolume > 0 ? Volume2 : VolumeX;
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewClearFrameRef = useRef<number | null>(null);
  const queueButtonRef = useRef<HTMLButtonElement | null>(null);
  const queuePanelRef = useRef<HTMLDivElement | null>(null);
  const [dragTimeMs, setDragTimeMs] = useState<number | null>(null);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const [isManualStepPointerHeld, setIsManualStepPointerHeld] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const volumeDragRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isRealInputOutput) {
      volumeDragRef.current?.abort();
      setIsVolumeDragging(false);
    }
    return () => volumeDragRef.current?.abort();
  }, [isRealInputOutput]);

  function handleVolumePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const track = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    volumeDragRef.current?.abort();
    const listeners = new AbortController();
    volumeDragRef.current = listeners;
    const update = (clientY: number) => {
      const fraction = (track.bottom - clientY) / track.height;
      onPreviewVolumeChange(Math.round(100 * Math.max(0, Math.min(1, fraction))));
    };
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      listeners.abort();
      setIsVolumeDragging(false);
    };
    const options = { signal: listeners.signal };
    window.addEventListener("pointermove", pointer => {
      if (pointer.pointerId === pointerId) update(pointer.clientY);
    }, options);
    window.addEventListener("pointerup", finish, options);
    window.addEventListener("pointercancel", finish, options);
    window.addEventListener("blur", () => {
      listeners.abort();
      setIsVolumeDragging(false);
    }, options);
    setIsVolumeDragging(true);
    update(event.clientY);
  }
  const onManualStepRef = useRef(onManualStep);
  const onManualStepHoldBeginRef = useRef(onManualStepHoldBegin);
  const onManualStepHoldEndRef = useRef(onManualStepHoldEnd);
  onManualStepRef.current = onManualStep;
  onManualStepHoldBeginRef.current = onManualStepHoldBegin;
  onManualStepHoldEndRef.current = onManualStepHoldEnd;
  const manualStepPointerGestureRef = useRef<
    ReturnType<typeof createManualStepPointerGesture> | null
  >(null);
  if (manualStepPointerGestureRef.current === null) {
    manualStepPointerGestureRef.current = createManualStepPointerGesture({
      onBegin: (pointerId) =>
        onManualStepHoldBeginRef.current(`pointer:${pointerId}`),
      onEnd: (pointerId) =>
        onManualStepHoldEndRef.current(`pointer:${pointerId}`),
      onHeldChange: setIsManualStepPointerHeld,
      onKeyboardStep: () => onManualStepRef.current(),
    });
  }
  const canPause = playbackState === "playing";
  const isManualStepDisabled =
    (isCurrentSongLoading || !canManualStep) && !isManualStepPointerHeld;

  useEffect(() => {
    if (
      manualState === "tail" ||
      manualState === "finished" ||
      manualState === "error"
    ) {
      manualStepPointerGestureRef.current?.terminate();
    }
  }, [manualState]);

  useEffect(() => {
    if (!isRealInputOutput) {
      manualStepPointerGestureRef.current?.terminate();
    }
  }, [isRealInputOutput]);

  useEffect(
    () => () => manualStepPointerGestureRef.current?.dispose(),
    [],
  );

  function handleManualStepPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (isManualStepDisabled || event.button !== 0) return;
    if (!manualStepPointerGestureRef.current?.begin(event.pointerId)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleManualStepPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!manualStepPointerGestureRef.current?.end(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleManualStepPointerCancel(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    manualStepPointerGestureRef.current?.cancel(event.pointerId);
  }

  function handleManualStepLostPointerCapture() {
    manualStepPointerGestureRef.current?.terminate();
  }

  function handleManualStepClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!manualStepPointerGestureRef.current?.consumeClick(event.detail !== 0)) {
      event.preventDefault();
    }
  }
  const isV2Song =
    currentSong !== null && getLibrarySongFormatVersion(currentSong) === 2;
  const songTitle = currentSong ? getLibrarySongName(currentSong) : text.noScore;
  const stateText = isCurrentSongLoading
    ? text.loadingScore
    : manualState === "idle"
      ? text.states[playbackState]
      : text.manualStates[manualState];
  const isVisualizationTrigger = canOpenVisualization || isVisualizationOpen;
  const canResume = playbackState === "paused";
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
              : !canPlay,
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

  function toggleVisualization() {
    if (isVisualizationOpen) {
      onVisualizationClose();
    } else if (canOpenVisualization) {
      onVisualizationOpen();
    }
  }

  function handleVisualizationTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    if (
      !isVisualizationTrigger ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }

    event.preventDefault();
    if (!event.repeat) toggleVisualization();
  }

  function handlePlayerBodyClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (
      !(target instanceof Element) ||
      !event.currentTarget.contains(target) ||
      target.closest(
        '[data-player-control-zone], button, input, [role="slider"]',
      ) !== null
    ) {
      return;
    }

    toggleVisualization();
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

      <div className="bottom-player-body" onClick={handlePlayerBodyClick}>
        <div
          className={`bottom-player-score${
            isVisualizationTrigger ? " is-visualization-trigger" : ""
          }`}
          aria-disabled={!isVisualizationTrigger}
          aria-expanded={isVisualizationOpen}
          aria-label={isVisualizationOpen ? text.collapseVisualization : text.expandVisualization}
          role="button"
          tabIndex={isVisualizationTrigger ? 0 : -1}
          onKeyDown={handleVisualizationTriggerKeyDown}
        >
          <div className="bottom-player-info">
            <span className="visually-hidden">{text.currentScore}</span>
            <div className="bottom-player-title-row">
              <strong className="bottom-player-title" title={songTitle}>
                {songTitle}
              </strong>
              {isV2Song ? (
                <span className="bottom-player-v2-badge" title={text.v2Score}>
                  V2
                </span>
              ) : null}
            </div>
            <div className="bottom-player-meta-line">
              <span className="bottom-player-meta-item bottom-player-time">
                {formatPlaybackTime(progress.currentMs)} /{" "}
                {formatPlaybackTime(progress.totalMs)}
              </span>
              {currentSong ? (
                <>
                  <span className="bottom-player-meta-item">
                    {text.bpm} {getLibrarySongBpm(currentSong)}
                  </span>
                  <span className="bottom-player-meta-item">
                    {text.notes} {getLibrarySongNoteCount(currentSong)}
                  </span>
                </>
              ) : null}
              <span
                className={`bottom-player-meta-item bottom-player-state${
                  isCurrentSongLoading ? " is-loading" : ""
                }${manualState === "error" ? " is-error" : ""}`}
                title={`${text.state}: ${stateText}`}
              >
                <span className="visually-hidden">{text.state}: </span>
                {stateText}
              </span>
            </div>
          </div>
        </div>

        <div
          className="bottom-player-center"
          aria-label={text.controlsAria}
          data-player-control-zone
        >
          <div className="bottom-player-transport">
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
            {isRealInputOutput ? (
              <button
                className="player-icon-button player-icon-button-secondary player-icon-button-manual-step"
                type="button"
                aria-label={text.manualStep}
                disabled={isManualStepDisabled}
                title={text.manualStepTooltip}
                onClick={handleManualStepClick}
                onLostPointerCapture={handleManualStepLostPointerCapture}
                onPointerCancel={handleManualStepPointerCancel}
                onPointerDown={handleManualStepPointerDown}
                onPointerUp={handleManualStepPointerEnd}
              >
                <ManualStepIcon />
                <span className="visually-hidden">{text.manualStep}</span>
              </button>
            ) : null}
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
        </div>

        <div className="bottom-player-actions" data-player-control-zone>
          <div
            className={`bottom-player-output${
              isRealInputOutput ? " is-real-input" : ""
            }`}
          >
            <span className="bottom-player-output-mode">
              <span className="bottom-player-output-label">{text.output}</span>
              {outputModeLabel}
            </span>
            {isRealInputOutput ? (
              <span
                className="bottom-player-real-input-warning"
                title={text.realInputWarning}
              >
                <span
                  className="bottom-player-warning-dot"
                  aria-hidden="true"
                />
                {text.realInputWarning}
              </span>
            ) : null}
          </div>

          <div className="bottom-player-actions-row">
            <div
              className="bottom-player-options"
              aria-label={text.optionsAria}
              role="group"
            >
              <div className="player-option" title={text.delay}>
                <span className="player-option-label">{text.delay}</span>
                <PlayerStepper
                  buttonStep={noteIntervalDelayLimits.buttonStep}
                  inputStep={noteIntervalDelayLimits.inputStep}
                  label={text.delay}
                  max={noteIntervalDelayLimits.max}
                  min={noteIntervalDelayLimits.min}
                  normalizeValue={normalizeNoteIntervalDelay}
                  onChange={(value) =>
                    onNoteIntervalDelayChange(value as NoteIntervalDelayMs)
                  }
                  unit="ms"
                  value={noteIntervalDelayMs}
                />
              </div>

              <span className="bottom-player-options-divider" aria-hidden="true" />

              <div className="player-option" title={text.speed}>
                <span className="player-option-label">{text.speed}</span>
                <PlayerStepper
                  buttonStep={playbackSpeedLimits.buttonStep}
                  inputStep={playbackSpeedLimits.inputStep}
                  label={text.speed}
                  max={playbackSpeedLimits.max}
                  min={playbackSpeedLimits.min}
                  normalizeValue={normalizePlaybackSpeed}
                  onChange={(value) => onPlaybackSpeedChange(value as PlaybackSpeed)}
                  unit="x"
                  value={playbackSpeed}
                />
              </div>
            </div>

            {!isRealInputOutput && (
              <>
                <div className="bottom-player-volume" data-dragging={isVolumeDragging}>
                  <button
                    className="player-icon-button player-icon-button-secondary bottom-player-speaker-button"
                    type="button"
                    aria-label={audioLabel}
                    aria-pressed={isPreviewAudioEnabled}
                    title={audioLabel}
                    onClick={onPreviewAudioToggle}
                  >
                    <AudioIcon className="player-icon" aria-hidden="true" focusable="false" />
                  </button>
                  <div className="bottom-player-volume-popup">
                    <div className="bottom-player-volume-panel">
                      <div
                        className="bottom-player-volume-track"
                        onPointerDown={handleVolumePointerDown}
                      >
                        <input
                          className="bottom-player-volume-slider"
                          type="range"
                          min={0}
                          max={100}
                          value={previewVolume}
                          aria-label={text.previewVolume}
                          aria-valuetext={`${previewVolume}%`}
                          aria-orientation="vertical"
                          style={{ backgroundImage: `linear-gradient(to top, var(--app-primary) ${previewVolume}%, transparent ${previewVolume}%)` }}
                          onChange={event => onPreviewVolumeChange(event.currentTarget.valueAsNumber)}
                          onKeyDown={event => {
                            if (event.key === "Escape") event.currentTarget.blur();
                          }}
                        />
                      </div>
                      <span aria-hidden="true">{previewVolume}%</span>
                    </div>
                  </div>
                </div>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="player-icon-button player-icon-button-secondary bottom-player-instrument-button"
                      type="button"
                      aria-label={`${text.previewInstrument}: ${instrumentLabel}`}
                      title={text.previewInstrument}
                    >
                      <SlidersHorizontal className="player-icon" aria-hidden="true" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="library-sort-menu" side="top" align="end" sideOffset={6} collisionPadding={8}>
                      <DropdownMenu.Label className="library-sort-note">{text.previewInstrument}</DropdownMenu.Label>
                      <DropdownMenu.RadioGroup value={previewInstrument} onValueChange={value => {
                        const instrument = previewInstruments.find(candidate => candidate === value);
                        const custom = customInstrumentMenu?.items.find(item => item.id === value);
                        const selection = instrument ?? custom;
                        if (selection) onPreviewInstrumentChange(selection);
                      }}>
                        {previewInstruments.map(instrument => (
                          <DropdownMenu.RadioItem key={instrument} value={instrument} asChild>
                            <button type="button">
                              <span className="library-sort-check">
                                <DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
                              </span>
                              {text.previewInstruments[instrument]}
                            </button>
                          </DropdownMenu.RadioItem>
                        ))}
                        {customInstrumentMenu?.items.length ? <>
                          <DropdownMenu.Label className="library-sort-note">{customInstrumentMenu.text.custom}</DropdownMenu.Label>
                          {customInstrumentMenu.items.map(item => (
                            <DropdownMenu.RadioItem key={item.id} value={item.id} asChild>
                              <button type="button">
                                <span className="library-sort-check">
                                  <DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
                                </span>
                                <span className="custom-instrument-menu-name">{item.name}</span>
                              </button>
                            </DropdownMenu.RadioItem>
                          ))}
                        </> : null}
                      </DropdownMenu.RadioGroup>
                      {customInstrumentMenu && (
                        <DropdownMenu.Item asChild onSelect={customInstrumentMenu.onManage}>
                          <button type="button">{customInstrumentMenu.text.manage}</button>
                        </DropdownMenu.Item>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>
            )}

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
      </div>
    </footer>
  );
}
