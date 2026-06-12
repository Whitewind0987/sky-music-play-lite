import type { UiText } from "../i18n/uiText";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { PlaybackState } from "../types/playback";
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

type PlaybackOutput = {
  canPlay: boolean;
  canSeek: boolean;
  isRealInputOutput: boolean;
  isShuffleEnabled: boolean;
  mode: PlaybackOutputMode;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onNoteIntervalDelayChange: (noteIntervalDelayMs: NoteIntervalDelayMs) => void;
  onPause: () => void;
  onPlay: () => void;
  onPlaySong: (songIndex: number) => void;
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
};

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

  if (!experimentalInput.experimentalInputEnabled) {
    const canSeek = isSeekablePlaybackState(previewPlayback.playbackState);

    return {
      ...sharedControls,
      canPlay: previewPlayback.canPlayPreview,
      canSeek,
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
  }

  if (experimentalInput.experimentalInputMode === "foreground") {
    const canSeek = isSeekablePlaybackState(
      experimentalInput.foregroundBottomPlaybackState,
    );

    return {
      ...sharedControls,
      canPlay: experimentalInput.canStartForegroundPlayback,
      canSeek,
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
  }

  const canSeek =
    experimentalInput.selectedWindowHwnd !== null &&
    isSeekablePlaybackState(experimentalInput.experimentalPlaybackState);

  return {
    ...sharedControls,
    canPlay: experimentalInput.canAttemptExperimentalPlayback,
    canSeek,
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

function isSeekablePlaybackState(playbackState: PlaybackState) {
  return (
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished"
  );
}
