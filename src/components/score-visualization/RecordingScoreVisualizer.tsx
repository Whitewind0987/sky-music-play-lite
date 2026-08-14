import { useMemo } from "react";
import type { UiText } from "../../i18n/uiText";
import {
  buildScoreVisualization,
  getActiveScoreRecordingVisualKeys,
} from "../../lib/scoreVisualization";
import type { ScoreRecordingSession } from "../../types/scoreRecording";
import { ScoreTimelineVisualizer } from "./ScoreTimelineVisualizer";
import { SkyKeyboardVisualizer } from "./SkyKeyboardVisualizer";

type RecordingScoreVisualizerProps = {
  isLive: boolean;
  session: ScoreRecordingSession | null;
  text: UiText["scoreRecording"]["visualization"];
};

const recordingVisualizationTiming = {
  noteIntervalDelayMs: 0,
  playbackSpeed: 1,
} as const;

export function RecordingScoreVisualizer({
  isLive,
  session,
  text,
}: RecordingScoreVisualizerProps) {
  const model = useMemo(
    () =>
      buildScoreVisualization(
        session?.notes ?? [],
        recordingVisualizationTiming,
      ),
    [session],
  );
  const activeKeys = useMemo(
    () =>
      isLive && session !== null
        ? getActiveScoreRecordingVisualKeys(session)
        : [],
    [isLive, session],
  );

  return (
    <section className="panel score-live-visualizer score-recording-visualizer">
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
          emptyMessage={text.emptyTimeline}
          focusGroupIndex={model.groups.length - 1}
          groups={model.groups}
          markCurrentGroup={isLive}
          pageInputAriaLabel={text.pageJumpAria}
        />
      </div>
    </section>
  );
}
