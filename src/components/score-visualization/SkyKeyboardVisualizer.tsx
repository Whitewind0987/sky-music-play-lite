import {
  skyKeyNames,
  type SkyKeyName,
} from "../../types/keyMapping";

type SkyKeyboardVisualizerProps = {
  activeKeys: readonly SkyKeyName[];
  ariaLabel: string;
};

export function SkyKeyboardVisualizer({
  activeKeys,
  ariaLabel,
}: SkyKeyboardVisualizerProps) {
  const activeKeySet = new Set(activeKeys);

  return (
    <div
      className="sky-keyboard-visualizer"
      role="img"
      aria-label={ariaLabel}
    >
      {skyKeyNames.map((skyKey, index) => {
        const motif =
          index < 5 ? "circle" : index < 10 ? "diamond" : "accent";

        return (
          <span
            className={`sky-visual-key sky-visual-key--${motif}${
              activeKeySet.has(skyKey) ? " is-active" : ""
            }`}
            aria-hidden="true"
            key={skyKey}
          >
            <span className="sky-visual-key__motif" />
            {motif === "accent" && (
              <span className="sky-visual-key__accent" />
            )}
          </span>
        );
      })}
    </div>
  );
}
