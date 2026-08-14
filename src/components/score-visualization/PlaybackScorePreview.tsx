import { useMemo } from "react";
import type { UiText } from "../../i18n/uiText";
import type { PreviewPlaybackProgress } from "../../lib/playbackScheduler";
import {
  buildScoreVisualization,
  findCurrentScoreVisualGroupIndex,
  getActiveScoreVisualKeys,
} from "../../lib/scoreVisualization";
import type { PlaybackState } from "../../types/playback";
import type {
  NoteIntervalDelayMs,
  PlaybackSpeed,
} from "../../types/playbackOptions";
import type { Song } from "../../types/score";
import { ScoreTimelineVisualizer } from "./ScoreTimelineVisualizer";
import { SkyKeyboardVisualizer } from "./SkyKeyboardVisualizer";

type PlaybackScorePreviewProps = {
  hasLoadFailed: boolean;
  isLoading: boolean;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackSpeed: PlaybackSpeed;
  playbackState: PlaybackState;
  progress: PreviewPlaybackProgress;
  song: Song | null;
  text: UiText["playbackScorePreview"];
};

export function PlaybackScorePreview({
  hasLoadFailed,
  isLoading,
  noteIntervalDelayMs,
  playbackSpeed,
  playbackState,
  progress,
  song,
  text,
}: PlaybackScorePreviewProps) {
  const model = useMemo(
    () =>
      song === null
        ? null
        : buildScoreVisualization(song.songNotes, {
            noteIntervalDelayMs,
            playbackSpeed,
          }),
    [noteIntervalDelayMs, playbackSpeed, song],
  );
  const followsProgress =
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished";
  const showsActiveKeys =
    playbackState === "playing" || playbackState === "paused";
  const focusGroupIndex =
    model !== null && followsProgress
      ? findCurrentScoreVisualGroupIndex(model.groups, progress.currentMs)
      : -1;
  const activeKeys = useMemo(
    () =>
      model !== null && showsActiveKeys
        ? getActiveScoreVisualKeys(model.groups, progress.currentMs)
        : [],
    [model, progress.currentMs, showsActiveKeys],
  );
  const emptyTimeline = isLoading
    ? text.loadingTimeline
    : hasLoadFailed
      ? text.unavailableTimeline
      : text.emptyTimeline;

  return (
    <section className="panel score-live-visualizer playback-score-preview">
      <div className="score-live-visualizer__column">
        <h2>{text.keyboard}</h2>
        <SkyKeyboardVisualizer
          activeKeys={activeKeys}
          ariaLabel={text.keyboardAria}
        />
      </div>

      <div className="score-live-visualizer__column score-live-visualizer__flow">
        <h2>{text.timeline}</h2>
        <ScoreTimelineVisualizer
          activeKeys={activeKeys}
          ariaLabel={text.timelineAria}
          emptyMessage={emptyTimeline}
          focusGroupIndex={focusGroupIndex}
          groups={model?.groups ?? []}
          markCurrentGroup={followsProgress && focusGroupIndex >= 0}
          pageInputAriaLabel={text.pageJumpAria}
        />
      </div>
    </section>
  );
}
