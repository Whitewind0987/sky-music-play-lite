import {
  skyKeyNames,
  type SkyKeyName,
} from "../../types/keyMapping";
import type {
  ScoreVisualGroup as ScoreVisualGroupModel,
} from "../../types/scoreVisualization";

type ScoreVisualGroupProps = {
  activeKeys: readonly SkyKeyName[];
  group: ScoreVisualGroupModel;
  isCurrent: boolean;
};

export function ScoreVisualGroup({
  activeKeys,
  group,
  isCurrent,
}: ScoreVisualGroupProps) {
  const markedKeySet = new Set(group.skyKeys);
  const activeKeySet = new Set(activeKeys);

  return (
    <div
      className={`score-visual-group${isCurrent ? " is-current" : ""}`}
      aria-hidden="true"
    >
      {skyKeyNames.map((skyKey) => {
        const isMarked = markedKeySet.has(skyKey);
        const isHeld = isCurrent && isMarked && activeKeySet.has(skyKey);

        return (
          <span
            className={`score-visual-group__cell${
              isMarked ? " is-marked" : ""
            }${isHeld ? " is-held" : ""}`}
            key={skyKey}
          />
        );
      })}
    </div>
  );
}
