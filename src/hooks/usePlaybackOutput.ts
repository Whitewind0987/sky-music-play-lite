import type { UiText } from "../i18n/uiText";
import { resolveManualPlaybackOutputPolicy } from "../lib/manualPlaybackState";
import type { ManualPlaybackUiState } from "../lib/manualPlaybackState";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { PlaybackState } from "../types/playback";
import type { ScoreVisualizationTimingMode } from "../types/scoreVisualization";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { useExperimentalInput } from "./useExperimentalInput";
import type { usePreviewPlayback } from "./usePreviewPlayback";

type PreviewPlaybackApi = ReturnType<typeof usePreviewPlayback>;
type ExperimentalInputApi = ReturnType<typeof useExperimentalInput>;

export type PlaybackOutputMode =
  | "preview"
  | "experimental-foreground"
  | "experimental-target-window";

type UsePlaybackOutputOptions = {
  experimentalInput: ExperimentalInputApi;
  previewPlayback: PreviewPlaybackApi;
  text: UiText["bottomPlayer"];
};

export type PlaybackOutput = {
  canManualStep: boolean;
  canPlay: boolean;
  canSeek: boolean;
  canStop: boolean;
  isRealInputOutput: boolean;
  isShuffleEnabled: boolean;
  mode: PlaybackOutputMode;
  manualState: ManualPlaybackUiState;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onPause: () => void;
  onManualStep: () => void;
  onPlay: () => void;
  onPlaySong: (songIndex: number) => void | Promise<boolean>;
  onPlaybackSpeedChange: (playbackSpeed: PlaybackSpeed) => void;
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
  visualizationFollowsProgress: boolean;
  visualizationShowsActiveKeys: boolean;
  visualizationTimingMode: ScoreVisualizationTimingMode;
};

type AutomaticPlaybackOutput = Omit<
  PlaybackOutput,
  | "canManualStep"
  | "onManualStep"
  | "manualState"
  | "visualizationFollowsProgress"
  | "visualizationShowsActiveKeys"
  | "visualizationTimingMode"
>;

export function usePlaybackOutput({
  experimentalInput,
  previewPlayback,
  text,
}: UsePlaybackOutputOptions): PlaybackOutput {
  const sharedControls = {
    isShuffleEnabled: previewPlayback.isShuffleEnabled,
    noteIntervalDelayMs: previewPlayback.noteIntervalDelayMs,
    onNoteIntervalDelayChange: previewPlayback.handleNoteIntervalDelayChange,
    onPlaybackSpeedChange: previewPlayback.handlePlaybackSpeedChange,
    onRepeatModeCycle: previewPlayback.handleRepeatModeCycle,
    onShuffleToggle: previewPlayback.handleShuffleToggle,
    playbackMode: previewPlayback.playbackMode,
    playbackSpeed: previewPlayback.playbackSpeed,
  };

  let automaticOutput: AutomaticPlaybackOutput;

  if (!experimentalInput.experimentalInputEnabled) {
    const canSeek = isSeekablePlaybackState(previewPlayback.playbackState);

    automaticOutput = {
      ...sharedControls,
      canPlay: previewPlayback.canPlayPreview,
      canSeek,
      canStop:
        previewPlayback.playbackState === "playing" ||
        previewPlayback.playbackState === "paused",
      isRealInputOutput: false,
      mode: "preview",
      onPause: previewPlayback.handlePausePreview,
      onPlay: previewPlayback.handlePlayPreview,
      onPlaySong: previewPlayback.handlePlayImportedSong,
      onResume: previewPlayback.handleResumePreview,
      onSeek: previewPlayback.handleSeekPreview,
      onStop: previewPlayback.handleStopPreview,
      outputModeLabel: text.outputModes.preview,
      playbackState: previewPlayback.playbackState,
      progress: previewPlayback.bottomPlayerProgress,
    };
  } else if (experimentalInput.experimentalInputMode === "foreground") {
    const canSeek = isSeekablePlaybackState(
      experimentalInput.foregroundBottomPlaybackState,
    );

    automaticOutput = {
      ...sharedControls,
      canPlay: experimentalInput.canStartForegroundPlayback,
      canSeek,
      canStop: experimentalInput.canStopForegroundPlayback,
      isRealInputOutput: true,
      mode: "experimental-foreground",
      onPause: experimentalInput.handlePauseForegroundPlayback,
      onPlay: experimentalInput.handleStartForegroundPlayback,
      onPlaySong: experimentalInput.handlePlayForegroundSong,
      onResume: experimentalInput.handleResumeForegroundPlayback,
      onSeek: experimentalInput.handleSeekForegroundPlayback,
      onStop: experimentalInput.handleStopForegroundPlayback,
      outputModeLabel: text.outputModes.experimentalForeground,
      playbackState: experimentalInput.foregroundBottomPlaybackState,
      progress: experimentalInput.foregroundPlaybackProgress,
    };
  } else {
    const canSeek =
      experimentalInput.selectedWindowHwnd !== null &&
      isSeekablePlaybackState(experimentalInput.experimentalPlaybackState);

    automaticOutput = {
      ...sharedControls,
      canPlay: experimentalInput.canAttemptExperimentalPlayback,
      canSeek,
      canStop: experimentalInput.canStopExperimentalPlayback,
      isRealInputOutput: true,
      mode: "experimental-target-window",
      onPause: experimentalInput.handlePauseExperimentalPlayback,
      onPlay: experimentalInput.handleStartExperimentalPlayback,
      onPlaySong: experimentalInput.handlePlayExperimentalSong,
      onResume: experimentalInput.handleResumeExperimentalPlayback,
      onSeek: experimentalInput.handleSeekExperimentalPlayback,
      onStop: experimentalInput.handleStopExperimentalPlayback,
      outputModeLabel: text.outputModes.experimentalTargetWindow,
      playbackState: experimentalInput.experimentalPlaybackState,
      progress: experimentalInput.experimentalPlaybackProgress,
    };
  }

  const manualPolicy = resolveManualPlaybackOutputPolicy({
    automaticCanPlay:
      automaticOutput.canPlay &&
      !experimentalInput.isPlaybackOwnershipTransitionPending,
    automaticCanSeek: automaticOutput.canSeek,
    automaticCanStop:
      automaticOutput.canStop ||
      experimentalInput.isPlaybackOwnershipTransitionPending,
    canStepManual: experimentalInput.canStepManualPlayback,
    isRealInputOutput: automaticOutput.isRealInputOutput,
    state: experimentalInput.manualPlaybackState,
  });
  const usesManualProgress =
    manualPolicy.showsManualProgress &&
    experimentalInput.manualPlaybackShowsProgress;
  const automaticFollowsProgress = isSeekablePlaybackState(
    automaticOutput.playbackState,
  );
  const automaticShowsActiveKeys =
    automaticOutput.playbackState === "playing" ||
    automaticOutput.playbackState === "paused";

  return {
    ...automaticOutput,
    canManualStep: manualPolicy.canManualStep,
    canPlay: manualPolicy.canPlay,
    canSeek: manualPolicy.canSeek,
    canStop: manualPolicy.canStop,
    manualState: experimentalInput.manualPlaybackState,
    onManualStep: () => {
      void experimentalInput.handleStepManualPlayback();
    },
    onStop: automaticOutput.isRealInputOutput
      ? experimentalInput.handleStopAllRealPlayback
      : automaticOutput.onStop,
    progress: usesManualProgress
      ? experimentalInput.manualPlaybackProgress
      : automaticOutput.progress,
    visualizationFollowsProgress:
      usesManualProgress || automaticFollowsProgress,
    visualizationShowsActiveKeys:
      usesManualProgress
        ? experimentalInput.manualPlaybackState === "active" ||
          experimentalInput.manualPlaybackState === "tail"
        : automaticShowsActiveKeys,
    visualizationTimingMode: usesManualProgress ? "source" : "automatic",
  };
}

function isSeekablePlaybackState(playbackState: PlaybackState) {
  return (
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished"
  );
}
