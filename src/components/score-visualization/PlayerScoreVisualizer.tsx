import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import type { UiText } from "../../i18n/uiText";
import type { PreviewPlaybackProgress } from "../../lib/playbackScheduler";
import {
  buildScoreVisualization,
  findCurrentScoreVisualGroupIndex,
  getActiveScoreVisualKeys,
  resolveScoreVisualizationTimingOptions,
} from "../../lib/scoreVisualization";
import type {
  NoteIntervalDelayMs,
  PlaybackSpeed,
} from "../../types/playbackOptions";
import type { Song } from "../../types/score";
import type { ScoreVisualizationTimingMode } from "../../types/scoreVisualization";
import { ScoreTimelineVisualizer } from "./ScoreTimelineVisualizer";
import { SkyKeyboardVisualizer } from "./SkyKeyboardVisualizer";

type PlayerScoreVisualizerProps = {
  followsProgress: boolean;
  hasLoadFailed: boolean;
  isLoading: boolean;
  isOpen: boolean;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onClose: () => void;
  playbackSpeed: PlaybackSpeed;
  progress: PreviewPlaybackProgress;
  showsActiveKeys: boolean;
  song: Song | null;
  songTitle: string;
  text: UiText["playerScoreVisualization"];
  timingMode: ScoreVisualizationTimingMode;
};

export function PlayerScoreVisualizer({
  followsProgress,
  hasLoadFailed,
  isLoading,
  isOpen,
  noteIntervalDelayMs,
  onClose,
  playbackSpeed,
  progress,
  showsActiveKeys,
  song,
  songTitle,
  text,
  timingMode,
}: PlayerScoreVisualizerProps) {
  const model = useMemo(
    () =>
      song === null
        ? null
        : buildScoreVisualization(
            song.songNotes,
            resolveScoreVisualizationTimingOptions(timingMode, {
              noteIntervalDelayMs,
              playbackSpeed,
            }),
          ),
    [noteIntervalDelayMs, playbackSpeed, song, timingMode],
  );
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

  return (
    <section
      className={`player-score-visualizer${isOpen ? " is-open" : ""}`}
      aria-hidden={!isOpen}
      aria-label={text.aria}
    >
      <button
        className="player-score-visualizer__close"
        type="button"
        aria-label={text.close}
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
      >
        <ChevronDown aria-hidden="true" size={26} strokeWidth={2} />
      </button>

      <div className="player-score-visualizer__content">
        <div className="player-score-visualizer__heading">
          <h2>{songTitle}</h2>
        </div>

        <div className="player-score-visualizer__body">
          {isLoading ? (
            <p className="player-score-visualizer__state">{text.loading}</p>
          ) : hasLoadFailed || song === null || model === null ? (
            <p className="player-score-visualizer__state">{text.unavailable}</p>
          ) : (
            <>
              <div className="player-score-visualizer__column">
                <h3>{text.keyboard}</h3>
                <SkyKeyboardVisualizer
                  activeKeys={activeKeys}
                  ariaLabel={text.keyboardAria}
                />
              </div>
              <div className="player-score-visualizer__column player-score-visualizer__score">
                <h3>{text.score}</h3>
                <ScoreTimelineVisualizer
                  activeKeys={activeKeys}
                  ariaLabel={text.scoreAria}
                  emptyMessage={text.emptyScore}
                  focusGroupIndex={focusGroupIndex}
                  groups={model.groups}
                  markCurrentGroup={followsProgress && focusGroupIndex >= 0}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
