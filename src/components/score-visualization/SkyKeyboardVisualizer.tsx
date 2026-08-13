import { skyVisualKeyDefinitions } from "../../lib/scoreVisualization";
import type { SkyKeyName } from "../../types/keyMapping";

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
      {skyVisualKeyDefinitions.map(({ motif, noteLabel, skyKey }) => (
        <span
          className={`sky-visual-key sky-visual-key--${motif}${
            activeKeySet.has(skyKey) ? " is-active" : ""
          }`}
          aria-hidden="true"
          key={skyKey}
        >
          {motif !== "diamond" && (
            <span className="sky-visual-key__shape sky-visual-key__circle" />
          )}
          {motif !== "circle" && (
            <span className="sky-visual-key__shape sky-visual-key__diamond" />
          )}
          <span className="sky-visual-key__label">{noteLabel}</span>
        </span>
      ))}
    </div>
  );
}
