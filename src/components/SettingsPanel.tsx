import {
  languageOptions,
  type LanguageCode,
  type UiText,
} from "../i18n/uiText";
import { skyKeyNames, type KeyMapping, type SkyKeyName } from "../types/keyMapping";
import { PanelHeader } from "./PanelHeader";

type SettingsPlaceholderProps = {
  keyMapping: KeyMapping;
  language: LanguageCode;
  listeningSkyKey: SkyKeyName | null;
  onKeyMappingListenStart: (skyKey: SkyKeyName) => void;
  onLanguageChange: (language: LanguageCode) => void;
  text: UiText["settings"];
};

export function SettingsPlaceholder({
  keyMapping,
  language,
  listeningSkyKey,
  onKeyMappingListenStart,
  onLanguageChange,
  text,
}: SettingsPlaceholderProps) {
  return (
    <section className="settings-grid" aria-label={text.aria}>
      <article className="panel settings-panel">
        <PanelHeader
          id="settings-system-title"
          title={text.systemTitle}
          description={text.systemDescription}
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>{text.language}</span>
            <div className="language-options">
              {languageOptions.map((option) => (
                <button
                  className={`language-option${
                    language === option.code ? " is-selected" : ""
                  }`}
                  key={option.code}
                  type="button"
                  aria-pressed={language === option.code}
                  onClick={() => onLanguageChange(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>{text.theme}</span>
            <span className="fake-segment">{text.systemTheme}</span>
          </div>
          <div className="setting-row">
            <span>{text.defaultPage}</span>
            <span className="fake-select">{text.home}</span>
          </div>
        </div>
      </article>

      <article className="panel settings-panel">
        <PanelHeader
          id="settings-preview-title"
          title={text.previewTitle}
          description={text.previewDescription}
        />
        <div className="setting-placeholder-list">
          <div className="setting-row">
            <span>{text.detailedLogs}</span>
            <span className="fake-toggle is-on" />
          </div>
          <div className="setting-row">
            <span>{text.realKeyboardMode}</span>
            <span className="fake-toggle" />
          </div>
          <div className="setting-row">
            <span>{text.manual}</span>
            <span className="fake-link">{text.openLater}</span>
          </div>
        </div>
      </article>

      <article className="panel settings-panel key-mapping-panel">
        <PanelHeader
          id="settings-key-mapping-title"
          title={text.keyMappingTitle}
          description={text.keyMappingDescription}
        />
        <div className="key-mapping-grid">
          {skyKeyNames.map((skyKey) => {
            const isListening = listeningSkyKey === skyKey;

            return (
              <button
                className={`key-binding-card${
                  isListening ? " is-listening" : ""
                }`}
                key={skyKey}
                type="button"
                aria-pressed={isListening}
                onClick={() => onKeyMappingListenStart(skyKey)}
              >
                <span className="key-binding-name">{skyKey}</span>
                <span className="key-binding-value">
                  {isListening ? text.keyMappingListening : keyMapping[skyKey]}
                </span>
                <span className="key-binding-helper">
                  {isListening
                    ? text.keyMappingCancelHint
                    : text.keyMappingClickHint}
                </span>
              </button>
            );
          })}
        </div>
      </article>
    </section>
  );
}
