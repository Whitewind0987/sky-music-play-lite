import {
  languageOptions,
  type LanguageCode,
  type UiText,
} from "../i18n/uiText";
import type { CandidateWindow } from "../types/experimentalInput";
import {
  skyKeyNames,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";
import { PanelHeader } from "./PanelHeader";

type ExperimentalInputPanelState = {
  canSendTestKey: boolean;
  candidateWindows: CandidateWindow[];
  experimentalInputEnabled: boolean;
  isDetectingSkyWindow: boolean;
  isRefreshingWindows: boolean;
  isSendingTestKey: boolean;
  lastError: string | null;
  onDetectSkyWindow: () => void;
  onExperimentalInputEnabledChange: (enabled: boolean) => void;
  onRefreshWindows: () => void;
  onSelectedWindowChange: (hwnd: string) => void;
  onSendTestKey: () => void;
  selectedWindowHwnd: string | null;
  testMappedKey: string;
  testSkyKey: string;
};

type SettingsPlaceholderProps = {
  experimentalInput: ExperimentalInputPanelState;
  keyMapping: KeyMapping;
  language: LanguageCode;
  listeningSkyKey: SkyKeyName | null;
  onKeyMappingListenStart: (skyKey: SkyKeyName) => void;
  onLanguageChange: (language: LanguageCode) => void;
  text: UiText["settings"];
};

export function SettingsPlaceholder({
  experimentalInput,
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

      <article className="panel settings-panel experimental-input-panel">
        <PanelHeader
          id="settings-experimental-input-title"
          title={text.experimentalInputTitle}
          description={text.experimentalInputDescription}
        />
        <p className="experimental-warning">{text.experimentalInputWarning}</p>
        <div className="experimental-input-actions">
          <button
            className="language-option"
            type="button"
            disabled={experimentalInput.isRefreshingWindows}
            onClick={experimentalInput.onRefreshWindows}
          >
            {experimentalInput.isRefreshingWindows
              ? text.experimentalInputRefreshing
              : text.experimentalInputRefreshWindows}
          </button>
          <button
            className="language-option"
            type="button"
            disabled={experimentalInput.isDetectingSkyWindow}
            onClick={experimentalInput.onDetectSkyWindow}
          >
            {experimentalInput.isDetectingSkyWindow
              ? text.experimentalInputDetecting
              : text.experimentalInputDetectSkyWindow}
          </button>
        </div>
        <div className="setting-row">
          <span>{text.experimentalInputEnable}</span>
          <button
            className={`experimental-toggle${
              experimentalInput.experimentalInputEnabled ? " is-on" : ""
            }`}
            type="button"
            aria-pressed={experimentalInput.experimentalInputEnabled}
            onClick={() =>
              experimentalInput.onExperimentalInputEnabledChange(
                !experimentalInput.experimentalInputEnabled,
              )
            }
          >
            <span className="visually-hidden">
              {text.experimentalInputEnable}
            </span>
          </button>
        </div>
        <div className="experimental-target-summary">
          <span>{text.experimentalInputTestKeyLabel}</span>
          <strong>
            {experimentalInput.testSkyKey} - {experimentalInput.testMappedKey}
          </strong>
        </div>
        <div className="experimental-window-list">
          {experimentalInput.candidateWindows.length === 0 ? (
            <p>{text.experimentalInputNoWindows}</p>
          ) : (
            experimentalInput.candidateWindows.map((window) => (
              <button
                className={`experimental-window-row${
                  experimentalInput.selectedWindowHwnd === window.hwnd
                    ? " is-selected"
                    : ""
                }`}
                key={window.hwnd}
                type="button"
                aria-pressed={
                  experimentalInput.selectedWindowHwnd === window.hwnd
                }
                onClick={() =>
                  experimentalInput.onSelectedWindowChange(window.hwnd)
                }
              >
                <span className="experimental-window-title">
                  {window.title || text.experimentalInputUntitledWindow}
                </span>
                <span className="experimental-window-meta">
                  {window.process_name ?? text.experimentalInputUnknownProcess}
                  {" / "}
                  {window.class_name || text.experimentalInputUnknownClass}
                  {" / HWND "}
                  {window.hwnd}
                </span>
              </button>
            ))
          )}
        </div>
        {experimentalInput.lastError !== null ? (
          <p className="parse-error">{experimentalInput.lastError}</p>
        ) : null}
        <button
          className="parse-button"
          type="button"
          disabled={!experimentalInput.canSendTestKey}
          onClick={experimentalInput.onSendTestKey}
        >
          {experimentalInput.isSendingTestKey
            ? text.experimentalInputTesting
            : text.experimentalInputTestSingleKey}
        </button>
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
