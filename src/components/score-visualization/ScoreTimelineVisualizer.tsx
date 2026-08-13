import { useMemo } from "react";
import {
  getScoreVisualPageIndexForGroup,
  paginateScoreVisualGroups,
} from "../../lib/scoreVisualization";
import type { SkyKeyName } from "../../types/keyMapping";
import type {
  ScoreVisualGroup as ScoreVisualGroupModel,
} from "../../types/scoreVisualization";
import { ScoreVisualGroup } from "./ScoreVisualGroup";

type ScoreTimelineVisualizerProps = {
  activeKeys: readonly SkyKeyName[];
  ariaLabel: string;
  emptyMessage: string;
  focusGroupIndex: number;
  groups: readonly ScoreVisualGroupModel[];
  markCurrentGroup: boolean;
};

export function ScoreTimelineVisualizer({
  activeKeys,
  ariaLabel,
  emptyMessage,
  focusGroupIndex,
  groups,
  markCurrentGroup,
}: ScoreTimelineVisualizerProps) {
  const pages = useMemo(() => paginateScoreVisualGroups(groups), [groups]);
  const focusedPageIndex = getScoreVisualPageIndexForGroup(
    focusGroupIndex,
    groups.length,
  );
  const currentPage = pages[focusedPageIndex < 0 ? 0 : focusedPageIndex];

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
                  isCurrent={
                    markCurrentGroup && groupIndex === focusGroupIndex
                  }
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
