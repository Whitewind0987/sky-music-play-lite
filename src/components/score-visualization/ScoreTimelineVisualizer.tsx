import { paginateScoreVisualGroups } from "../../lib/scoreVisualization";
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
  const pages = paginateScoreVisualGroups(groups);
  const currentPage = pages[pages.length - 1];

  return (
    <div
      className="score-visual-timeline"
      role="img"
      aria-label={ariaLabel}
    >
      {currentPage === undefined ? (
        <p className="score-visual-timeline__empty">{emptyMessage}</p>
      ) : (
        <>
          {pages.length > 1 && (
            <span className="score-visual-timeline__page-indicator">
              {currentPage.pageIndex + 1} / {pages.length}
            </span>
          )}
          <div className="score-visual-page" aria-hidden="true">
            {currentPage.groups.map((group, localIndex) => {
              const groupIndex = currentPage.startGroupIndex + localIndex;

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
        </>
      )}
    </div>
  );
}
