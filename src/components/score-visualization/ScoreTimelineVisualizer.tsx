import { getScoreVisualRenderWindow } from "../../lib/scoreVisualization";
import type { SkyKeyName } from "../../types/keyMapping";
import type {
  ScoreVisualGroup as ScoreVisualGroupModel,
} from "../../types/scoreVisualization";
import { ScoreVisualGroup } from "./ScoreVisualGroup";

type ScoreTimelineVisualizerProps = {
  activeKeys: readonly SkyKeyName[];
  ariaLabel: string;
  emptyMessage: string;
  groups: readonly ScoreVisualGroupModel[];
  isLive: boolean;
};

export function ScoreTimelineVisualizer({
  activeKeys,
  ariaLabel,
  emptyMessage,
  groups,
  isLive,
}: ScoreTimelineVisualizerProps) {
  const focusIndex = groups.length - 1;
  const renderWindow = getScoreVisualRenderWindow(
    groups,
    focusIndex,
    11,
    0,
  );

  return (
    <div
      className="score-visual-timeline"
      role="img"
      aria-label={ariaLabel}
    >
      {renderWindow.groups.length === 0 ? (
        <p className="score-visual-timeline__empty">{emptyMessage}</p>
      ) : (
        <div className="score-visual-timeline__groups" aria-hidden="true">
          {renderWindow.groups.map((group, localIndex) => {
            const groupIndex = renderWindow.startIndex + localIndex;

            return (
              <ScoreVisualGroup
                activeKeys={activeKeys}
                group={group}
                isCurrent={isLive && groupIndex === focusIndex}
                key={groupIndex}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
