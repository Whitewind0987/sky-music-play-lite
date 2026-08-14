import { useEffect, useMemo, useRef, useState } from "react";
import {
  getScoreVisualPageIndexForGroup,
  paginateScoreVisualGroups,
  parseScoreVisualPageInput,
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
  pageInputAriaLabel: string;
};

export function ScoreTimelineVisualizer({
  activeKeys,
  ariaLabel,
  emptyMessage,
  focusGroupIndex,
  groups,
  markCurrentGroup,
  pageInputAriaLabel,
}: ScoreTimelineVisualizerProps) {
  const pages = useMemo(() => paginateScoreVisualGroups(groups), [groups]);
  const focusedPageIndex = getScoreVisualPageIndexForGroup(
    focusGroupIndex,
    groups.length,
  );
  const automaticPageIndex = focusedPageIndex < 0 ? 0 : focusedPageIndex;
  const [manualPageIndex, setManualPageIndex] = useState<number | null>(null);
  const [pageDraft, setPageDraft] = useState("1");
  const editingPageRef = useRef(false);
  const manualGroupsRef = useRef<readonly ScoreVisualGroupModel[] | null>(null);
  const manualFocusGroupIndexRef = useRef<number | null>(null);
  const previousGroupsRef = useRef(groups);
  const hasValidManualPage =
    manualPageIndex !== null &&
    manualPageIndex >= 0 &&
    manualPageIndex < pages.length &&
    manualGroupsRef.current === groups &&
    manualFocusGroupIndexRef.current === focusGroupIndex;
  const displayedPageIndex = hasValidManualPage
    ? manualPageIndex
    : Math.min(automaticPageIndex, Math.max(pages.length - 1, 0));
  const currentPage = pages[displayedPageIndex];
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    if (manualPageIndex !== null && !hasValidManualPage) {
      setManualPageIndex(null);
    }
  }, [hasValidManualPage, manualPageIndex]);

  useEffect(() => {
    const modelChanged = previousGroupsRef.current !== groups;
    previousGroupsRef.current = groups;

    if (modelChanged || !editingPageRef.current) {
      setPageDraft(String(displayedPageIndex + 1));
    }
  }, [displayedPageIndex, groups]);

  const restoreDisplayedPageDraft = () => {
    setPageDraft(String(displayedPageIndex + 1));
  };

  const commitPageDraft = () => {
    const parsedPageIndex = parseScoreVisualPageInput(
      pageDraft,
      pages.length,
    );
    if (parsedPageIndex === null) {
      restoreDisplayedPageDraft();
      return;
    }

    manualGroupsRef.current = groups;
    manualFocusGroupIndexRef.current = focusGroupIndex;
    setManualPageIndex(parsedPageIndex);
    setPageDraft(String(parsedPageIndex + 1));
  };

  return (
    <div
      className="score-visual-timeline"
      role="group"
      aria-label={ariaLabel}
    >
      {currentPage === undefined ? (
        <p className="score-visual-timeline__empty">{emptyMessage}</p>
      ) : (
        <>
          {pages.length > 1 && (
            <div className="score-visual-timeline__page-indicator">
              <input
                className="score-visual-timeline__page-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                spellCheck={false}
                autoComplete="off"
                aria-label={pageInputAriaLabel}
                value={pageDraft}
                onBlur={() => {
                  editingPageRef.current = false;
                  if (skipNextBlurCommitRef.current) {
                    skipNextBlurCommitRef.current = false;
                    return;
                  }
                  commitPageDraft();
                }}
                onChange={(event) => setPageDraft(event.target.value)}
                onFocus={() => {
                  editingPageRef.current = true;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (event.nativeEvent.isComposing) {
                      return;
                    }
                    event.preventDefault();
                    commitPageDraft();
                    skipNextBlurCommitRef.current = true;
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    restoreDisplayedPageDraft();
                    skipNextBlurCommitRef.current = true;
                    event.currentTarget.blur();
                  }
                }}
              />
              <span aria-hidden="true">/</span>
              <span>{pages.length}</span>
            </div>
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
