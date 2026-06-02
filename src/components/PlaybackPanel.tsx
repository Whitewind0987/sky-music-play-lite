import type { UiText } from "../i18n/uiText";
import {
  getPreviewKeyName,
  skyKeyNames,
  type KeyMapping,
} from "../types/keyMapping";
import { PanelHeader } from "./PanelHeader";

type KeyboardPreviewProps = {
  activeKeys: string[];
  keyMapping: KeyMapping;
  text: UiText["keyboard"];
};

export function KeyboardPreview({
  activeKeys,
  keyMapping,
  text,
}: KeyboardPreviewProps) {
  const activePreviewKeys = activeKeys.map((activeKey) =>
    getPreviewKeyName(activeKey),
  );

  return (
    <section
      className="panel keyboard-panel"
      aria-labelledby="keyboard-preview-title"
    >
      <PanelHeader
        id="keyboard-preview-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <div className="keyboard-grid" aria-label={text.previewAria}>
        {skyKeyNames.map((skyKey) => (
          <button
            className={`key-button${
              activePreviewKeys.includes(skyKey) ? " is-active" : ""
            }`}
            type="button"
            disabled
            key={skyKey}
          >
            <span className="sky-key-label">{skyKey}</span>
            <span className="keyboard-key-label">{keyMapping[skyKey]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
