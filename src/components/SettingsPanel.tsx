import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  languageOptions,
  type LanguageCode,
  type UiText,
} from "../i18n/uiText";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { AppRuntimeInfo } from "../lib/tauriApi";
import {
  formatShortcutCode,
  isUnsafeGlobalStopShortcut,
} from "../lib/playbackShortcuts";
import type {
  CandidateWindow,
  ExperimentalInputMode,
  ForegroundPlaybackState,
  TargetWindowCompatibilityProfile,
} from "../types/experimentalInput";
import {
  skyKeyNames,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";
import {
  defaultPlaybackShortcuts,
  playbackShortcutActions,
  type PlaybackShortcutAction,
  type PlaybackShortcutNotices,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";
import { PanelHeader } from "./PanelHeader";

type ExperimentalInputPanelState = {
  candidateWindows: CandidateWindow[];
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  experimentalPlaybackProgress: PreviewPlaybackProgress;
  foregroundCountdown: number | null;
  foregroundPlaybackState: ForegroundPlaybackState;
  isDetectingSkyWindow: boolean;
  isExperimentalPlaybackRunning: boolean;
  isRefreshingWindows: boolean;
  lastError: string | null;
  onDetectSkyWindow: () => void;
  onExperimentalInputEnabledChange: (enabled: boolean) => void;
  onExperimentalInputModeChange: (mode: ExperimentalInputMode) => void;
  onRefreshWindows: () => void;
  onSelectedWindowChange: (hwnd: string) => void;
  onTargetWindowCompatibilityProfileChange: (
    profile: TargetWindowCompatibilityProfile,
  ) => void;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot:
    | {
        className: string;
        hwnd: string;
        processName?: string;
        title: string;
      }
    | undefined;
  targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
};

type SettingsPlaceholderProps = {
  appRuntimeInfo: AppRuntimeInfo | null;
  experimentalInput: ExperimentalInputPanelState;
  keyMapping: KeyMapping;
  language: LanguageCode;
  listeningSkyKey: SkyKeyName | null;
  onShortcutNoticeClear: () => void;
  onKeyMappingListenStart: (skyKey: SkyKeyName) => void;
  onLanguageChange: (language: LanguageCode) => void;
  onOpenLogDirectory: () => void;
  onPlaybackShortcutsChange: (playbackShortcuts: PlaybackShortcuts) => void;
  playbackShortcuts: PlaybackShortcuts;
  shortcutNotice: PlaybackShortcutNotices;
  text: UiText["settings"];
};

export function SettingsPlaceholder({
  appRuntimeInfo,
  experimentalInput,
  keyMapping,
  language,
  listeningSkyKey,
  onShortcutNoticeClear,
  onKeyMappingListenStart,
  onLanguageChange,
  onOpenLogDirectory,
  onPlaybackShortcutsChange,
  playbackShortcuts,
  shortcutNotice,
  text,
}: SettingsPlaceholderProps) {
  const [listeningShortcutAction, setListeningShortcutAction] =
    useState<PlaybackShortcutAction | null>(null);
  const [shortcutConflictNotices, setShortcutConflictNotices] =
    useState<PlaybackShortcutNotices>({});
  const experimentalPlaybackPercent = Math.round(
    experimentalInput.experimentalPlaybackProgress.percent,
  );
  const restoredSelectedWindow =
    experimentalInput.selectedWindowHwnd !== null &&
    !experimentalInput.candidateWindows.some(
      (window) => window.hwnd === experimentalInput.selectedWindowHwnd,
    )
      ? {
          hwnd: experimentalInput.selectedWindowHwnd,
          label: getRestoredTargetLabel(
            experimentalInput.selectedWindowSnapshot,
            experimentalInput.selectedWindowHwnd,
            text,
          ),
        }
      : null;
  const selectedWindowIsAvailable =
    experimentalInput.selectedWindowHwnd !== null &&
    experimentalInput.candidateWindows.some(
      (window) => window.hwnd === experimentalInput.selectedWindowHwnd,
    );

  useEffect(() => {
    if (listeningSkyKey !== null) {
      setListeningShortcutAction(null);
      setShortcutConflictNotices({});
    }
  }, [listeningSkyKey]);

  useEffect(() => {
    if (listeningShortcutAction === null) {
      return;
    }

    const currentAction = listeningShortcutAction;

    function handleShortcutKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        setListeningShortcutAction(null);
        setShortcutConflictNotices({});
        return;
      }

      const duplicateAction = playbackShortcutActions.find(
        (action) =>
          action !== currentAction &&
          playbackShortcuts[action].code === event.code,
      );

      if (duplicateAction !== undefined) {
        setShortcutConflictNotices({
          [currentAction]: text.keyboardShortcutDuplicate,
        });
        return;
      }

      if (
        playbackShortcuts[currentAction].scope === "global" &&
        currentAction === "stop" &&
        isUnsafeGlobalStopShortcut(event.code)
      ) {
        setShortcutConflictNotices({
          [currentAction]: text.keyboardShortcutUnsafeGlobalStop,
        });
        return;
      }

      onPlaybackShortcutsChange({
        ...playbackShortcuts,
        [currentAction]: {
          ...playbackShortcuts[currentAction],
          code: event.code,
        },
      });
      setListeningShortcutAction(null);
      setShortcutConflictNotices({});
    }

    window.addEventListener("keydown", handleShortcutKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [
    listeningShortcutAction,
    onPlaybackShortcutsChange,
    playbackShortcuts,
    text.keyboardShortcutDuplicate,
    text.keyboardShortcutUnsafeGlobalStop,
  ]);

  return (
    <section className="settings-grid" aria-label={text.aria}>
      <article className="panel settings-panel experimental-input-panel">
        <PanelHeader
          id="settings-experimental-input-title"
          title={text.experimentalInputTitle}
          description={text.experimentalInputDescription}
        />
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
        <p className="experimental-setting-description">
          {experimentalInput.experimentalInputEnabled
            ? text.experimentalInputOnDescription
            : text.experimentalInputOffDescription}
        </p>
        {experimentalInput.experimentalInputEnabled ? (
          <>
            <p className="experimental-warning">
              {text.experimentalInputWarning}
            </p>
            <div className="setting-row">
              <span>{text.experimentalPlaybackMethod}</span>
            </div>
            <div className="experimental-mode-options">
              <button
                className={`experimental-mode-card${
                  experimentalInput.experimentalInputMode ===
                  "target-window-message"
                    ? " is-selected"
                    : ""
                }`}
                type="button"
                aria-pressed={
                  experimentalInput.experimentalInputMode ===
                  "target-window-message"
                }
                onClick={() =>
                  experimentalInput.onExperimentalInputModeChange(
                    "target-window-message",
                  )
                }
              >
                <strong>{text.experimentalTargetWindowMode}</strong>
                <span>{text.experimentalTargetWindowModeDescription}</span>
              </button>
              <button
                className={`experimental-mode-card${
                  experimentalInput.experimentalInputMode === "foreground"
                    ? " is-selected"
                    : ""
                }`}
                type="button"
                aria-pressed={
                  experimentalInput.experimentalInputMode === "foreground"
                }
                onClick={() =>
                  experimentalInput.onExperimentalInputModeChange("foreground")
                }
              >
                <strong>{text.experimentalForegroundMode}</strong>
                <span>{text.experimentalForegroundModeDescription}</span>
              </button>
            </div>
            {experimentalInput.experimentalInputMode ===
            "target-window-message" ? (
              <>
                <p className="experimental-setting-description">
                  {text.experimentalTargetWindowModeHelp}
                </p>
                <div className="setting-row">
                  <span>
                    {text.experimentalTargetWindowCompatibilityProfile}
                  </span>
                  <div className="language-options">
                    {(
                      [
                        "legacy-activate-scan-lparam",
                        "grouped-legacy",
                      ] as TargetWindowCompatibilityProfile[]
                    ).map((profile) => (
                      <button
                        className={`language-option${
                          experimentalInput.targetWindowCompatibilityProfile ===
                          profile
                            ? " is-selected"
                            : ""
                        }`}
                        key={profile}
                        type="button"
                        aria-pressed={
                          experimentalInput.targetWindowCompatibilityProfile ===
                          profile
                        }
                        onClick={() =>
                          experimentalInput.onTargetWindowCompatibilityProfileChange(
                            profile,
                          )
                        }
                      >
                        {
                          text.experimentalTargetWindowCompatibilityProfiles[
                            profile
                          ]
                        }
                      </button>
                    ))}
                  </div>
                </div>
                <p className="experimental-setting-description">
                  {text.experimentalTargetWindowCompatibilityHint}
                </p>
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
                <p className="experimental-setting-description">
                  {text.experimentalTargetWindowListHint}
                </p>
                <div className="experimental-window-list">
                  {restoredSelectedWindow !== null ? (
                    <button
                      className="experimental-window-row is-selected"
                      type="button"
                      aria-pressed
                      onClick={() =>
                        experimentalInput.onSelectedWindowChange(
                          restoredSelectedWindow.hwnd,
                        )
                      }
                    >
                      <span className="experimental-window-title">
                        {text.experimentalSavedTargetWindowLabel}
                      </span>
                      <span className="experimental-window-meta">
                        {restoredSelectedWindow.label}
                      </span>
                      <span className="experimental-window-status">
                        {text.experimentalSavedTargetWindowMissingHint}
                      </span>
                    </button>
                  ) : null}
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
                          {experimentalInput.selectedWindowHwnd === window.hwnd &&
                          selectedWindowIsAvailable
                            ? text.experimentalCurrentTargetWindowLabel
                            : window.title || text.experimentalInputUntitledWindow}
                        </span>
                        <span className="experimental-window-meta">
                          {experimentalInput.selectedWindowHwnd === window.hwnd &&
                          selectedWindowIsAvailable
                            ? `${window.title || text.experimentalInputUntitledWindow} / `
                            : ""}
                          {window.process_name ??
                            text.experimentalInputUnknownProcess}
                          {" / "}
                          {window.class_name ||
                            text.experimentalInputUnknownClass}
                          {" / HWND "}
                          {window.hwnd}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="experimental-playback-controls">
                  <div className="experimental-target-summary">
                    <span>{text.experimentalPlaybackStatusLabel}</span>
                    <strong>
                      {experimentalInput.isExperimentalPlaybackRunning
                        ? text.experimentalPlaybackRunning
                        : text.experimentalPlaybackIdle}
                      {" / "}
                      {experimentalPlaybackPercent}%
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="experimental-setting-description">
                  {text.experimentalForegroundModeHelp}
                </p>
                <div className="experimental-playback-controls">
                  <div className="experimental-target-summary">
                    <span>{text.experimentalForegroundStatusLabel}</span>
                    <strong>
                      {experimentalInput.foregroundPlaybackState ===
                        "countdown" &&
                      experimentalInput.foregroundCountdown !== null
                        ? experimentalInput.foregroundCountdown
                        : text.experimentalForegroundStates[
                            experimentalInput.foregroundPlaybackState
                          ]}
                    </strong>
                  </div>
                </div>
              </>
            )}
            {experimentalInput.lastError !== null ? (
              <p className="parse-error">{experimentalInput.lastError}</p>
            ) : null}
          </>
        ) : null}
      </article>

      <article className="panel settings-panel key-mapping-panel">
        <PanelHeader
          id="settings-key-mapping-title"
          title={text.keyMappingTitle}
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

      <article className="panel settings-panel settings-system-panel">
        <PanelHeader
          id="settings-system-title"
          title={text.systemTitle}
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

      <article className="panel settings-panel settings-app-info-panel">
        <PanelHeader
          id="settings-app-info-title"
          title={text.appInfoTitle}
        />
        <div className="settings-plain-row-list">
          <button
            className="settings-plain-row settings-plain-row-action"
            type="button"
            disabled={appRuntimeInfo === null}
            title={appRuntimeInfo?.logDirectory}
            onClick={onOpenLogDirectory}
          >
            <span>{text.logDirectory}</span>
            <ChevronRight
              className="settings-row-chevron"
              aria-hidden="true"
            />
          </button>
          <div className="settings-plain-row">
            <span>{text.appVersion}</span>
            <span className="settings-version-value">
              {formatAppVersion(appRuntimeInfo?.version)}
            </span>
          </div>
        </div>
      </article>

      <article className="panel settings-panel settings-shortcuts-panel">
        <PanelHeader
          id="settings-shortcuts-title"
          title={text.keyboardShortcutsTitle}
        />
        <p className="shortcut-warning">{text.keyboardShortcutWarning}</p>
        <div className="setting-placeholder-list">
          {playbackShortcutActions.map((action) => {
            const isListening = listeningShortcutAction === action;
            const isDisabled = listeningSkyKey !== null;
            const rowShortcutNotice =
              shortcutConflictNotices[action] ?? shortcutNotice[action];

            return (
              <div className="setting-row" key={action}>
                <div className="shortcut-action-label">
                  <span>{text.keyboardShortcutActions[action]}</span>
                  <button
                    type="button"
                    disabled={isListening || isDisabled}
                    aria-pressed={playbackShortcuts[action].scope === "global"}
                    aria-label={
                      playbackShortcuts[action].scope === "global"
                        ? text.keyboardShortcutScopes.inApp
                        : text.keyboardShortcutScopes.global
                    }
                    title={
                      playbackShortcuts[action].scope === "global"
                        ? text.keyboardShortcutScopes.inApp
                        : text.keyboardShortcutScopes.global
                    }
                    onClick={() => {
                      onShortcutNoticeClear();
                      onPlaybackShortcutsChange({
                        ...playbackShortcuts,
                        [action]: {
                          ...playbackShortcuts[action],
                          scope:
                            playbackShortcuts[action].scope === "global"
                              ? "in-app"
                              : "global",
                        },
                      });
                    }}
                    className={`shortcut-scope-badge ${
                      playbackShortcuts[action].scope === "global"
                        ? "is-global"
                        : "is-in-app"
                    }`}
                  >
                    {
                      text.keyboardShortcutScopes[
                        playbackShortcuts[action].scope === "global"
                          ? "global"
                          : "inApp"
                      ]
                    }
                  </button>
                  {rowShortcutNotice ? (
                    <span
                      className="shortcut-conflict-badge"
                      title={rowShortcutNotice}
                      aria-label={rowShortcutNotice}
                    >
                      {text.keyboardShortcutConflictBadge}
                    </span>
                  ) : null}
                </div>
                <button
                  className={`shortcut-binding-button${
                    isListening ? " is-listening" : ""
                  }`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onShortcutNoticeClear();
                    setListeningShortcutAction(action);
                    setShortcutConflictNotices({});
                  }}
                >
                  {isListening
                    ? text.keyboardShortcutListening
                    : formatShortcutCode(playbackShortcuts[action].code)}
                </button>
              </div>
            );
          })}
          {listeningSkyKey !== null ? (
            <p className="shortcut-helper-note">
              {text.keyboardShortcutMappingActive}
            </p>
          ) : null}
          <div className="setting-row">
            <span>{text.keyboardShortcutResetLabel}</span>
            <button
              className="shortcut-reset-button"
              type="button"
              onClick={() => {
                onShortcutNoticeClear();
                onPlaybackShortcutsChange(defaultPlaybackShortcuts);
                setListeningShortcutAction(null);
                setShortcutConflictNotices({});
              }}
            >
              {text.keyboardShortcutReset}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

function formatAppVersion(version: string | undefined) {
  if (!version) {
    return "v--";
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function getRestoredTargetLabel(
  snapshot: ExperimentalInputPanelState["selectedWindowSnapshot"],
  hwnd: string,
  text: UiText["settings"],
) {
  if (snapshot?.title) {
    return `${snapshot.title} / HWND ${hwnd}`;
  }

  if (snapshot?.className) {
    return `${snapshot.className} / HWND ${hwnd}`;
  }

  return `${text.experimentalInputHwndLabel} ${hwnd}`;
}
