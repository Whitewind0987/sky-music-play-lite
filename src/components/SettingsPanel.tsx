import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  languageOptions,
  type LanguageCode,
  type UiText,
} from "../i18n/uiText";
import type { PreviewPlaybackProgress } from "../lib/playbackScheduler";
import type { AppRuntimeInfo } from "../lib/tauriApi";
import {
  applyPlaybackShortcutRecordingOutcome,
  clearPlaybackShortcutNotice,
  formatPlaybackShortcut,
  getPlaybackShortcutNotice,
  getShortcutRecordingDecision,
  isUnsafeGlobalPlaybackShortcut,
  resolvePlaybackShortcutRecordingOutcome,
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
  isTargetWindowSelectionLocked: boolean;
  isRefreshingWindows: boolean;
  lastError: string | null;
  skyMonitorStatus: "inactive" | "waiting" | "connected" | "reconnecting" | "manual-target";
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
  confirmBeforeExit: boolean;
  isConfirmBeforeExitSaving: boolean;
  experimentalInput: ExperimentalInputPanelState;
  keyMapping: KeyMapping;
  language: LanguageCode;
  listeningSkyKey: SkyKeyName | null;
  listeningShortcutAction: PlaybackShortcutAction | null;
  onShortcutNoticeClear: (action?: PlaybackShortcutAction) => void;
  onKeyMappingListenStart: (skyKey: SkyKeyName) => void;
  onConfirmBeforeExitChange: (confirmBeforeExit: boolean) => void;
  onLanguageChange: (language: LanguageCode) => void;
  onOpenLogDirectory: () => void;
  onPlaybackShortcutsChange: (playbackShortcuts: PlaybackShortcuts) => void;
  onShortcutRecordingEnd: () => Promise<void>;
  onShortcutRecordingStart: (
    action: PlaybackShortcutAction,
  ) => Promise<boolean>;
  pendingShortcutRecordingAction: PlaybackShortcutAction | null;
  playbackShortcuts: PlaybackShortcuts;
  shortcutNotice: PlaybackShortcutNotices;
  text: UiText["settings"];
};

export function SettingsPlaceholder({
  appRuntimeInfo,
  confirmBeforeExit,
  isConfirmBeforeExitSaving,
  experimentalInput,
  keyMapping,
  language,
  listeningSkyKey,
  listeningShortcutAction,
  onShortcutNoticeClear,
  onKeyMappingListenStart,
  onConfirmBeforeExitChange,
  onLanguageChange,
  onOpenLogDirectory,
  onPlaybackShortcutsChange,
  onShortcutRecordingEnd,
  onShortcutRecordingStart,
  pendingShortcutRecordingAction,
  playbackShortcuts,
  shortcutNotice,
  text,
}: SettingsPlaceholderProps) {
  const [shortcutConflictNotices, setShortcutConflictNotices] =
    useState<PlaybackShortcutNotices>({});
  const shortcutBindingRefs = useRef<
    Partial<Record<PlaybackShortcutAction, HTMLButtonElement | null>>
  >({});
  const shortcutRecordingSessionAction =
    listeningShortcutAction ?? pendingShortcutRecordingAction;
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
      void onShortcutRecordingEnd();
      if (shortcutRecordingSessionAction !== null) {
        setShortcutConflictNotices((current) =>
          clearPlaybackShortcutNotice(
            current,
            shortcutRecordingSessionAction,
          ),
        );
      }
    }
  }, [
    listeningSkyKey,
    onShortcutRecordingEnd,
    shortcutRecordingSessionAction,
  ]);

  useEffect(
    () => () => {
      void onShortcutRecordingEnd();
    },
    [onShortcutRecordingEnd],
  );

  useLayoutEffect(() => {
    if (shortcutRecordingSessionAction === null) {
      return;
    }
    const sessionAction = shortcutRecordingSessionAction;

    function cancelRecording() {
      setShortcutConflictNotices((current) =>
        clearPlaybackShortcutNotice(current, sessionAction),
      );
      void onShortcutRecordingEnd();
    }

    function handlePointerDown(event: PointerEvent) {
      const activeButton = shortcutBindingRefs.current[sessionAction];
      if (
        event.target instanceof Node &&
        activeButton?.contains(event.target)
      ) {
        return;
      }
      cancelRecording();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        cancelRecording();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const activeButton = shortcutBindingRefs.current[sessionAction];
      if (
        event.target instanceof Node &&
        !activeButton?.contains(event.target)
      ) {
        cancelRecording();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", cancelRecording);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", cancelRecording);
    };
  }, [shortcutRecordingSessionAction, onShortcutRecordingEnd]);

  useEffect(() => {
    if (listeningShortcutAction === null) {
      return;
    }

    const currentAction = listeningShortcutAction;

    function handleShortcutKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      const recordingOutcome = resolvePlaybackShortcutRecordingOutcome(
        playbackShortcuts,
        currentAction,
        getShortcutRecordingDecision(
          event,
          playbackShortcuts[currentAction].scope,
        ),
      );

      if (recordingOutcome.type === "ignore") {
        return;
      }

      if (recordingOutcome.type === "cancel") {
        setShortcutConflictNotices((current) =>
          clearPlaybackShortcutNotice(current, currentAction),
        );
      } else if (recordingOutcome.type === "duplicate") {
        setShortcutConflictNotices((current) => ({
          ...current,
          [currentAction]: text.keyboardShortcutDuplicate,
        }));
      } else if (recordingOutcome.type === "unchanged") {
        setShortcutConflictNotices((current) =>
          clearPlaybackShortcutNotice(current, currentAction),
        );
      } else {
        onPlaybackShortcutsChange(
          applyPlaybackShortcutRecordingOutcome(
            playbackShortcuts,
            currentAction,
            recordingOutcome,
          ),
        );
        setShortcutConflictNotices((current) => {
          const remaining = clearPlaybackShortcutNotice(
            current,
            currentAction,
          );
          return recordingOutcome.fellBackToInApp
            ? {
                ...remaining,
                [currentAction]: text.keyboardShortcutUnsafeGlobal,
              }
            : remaining;
        });
      }

      void onShortcutRecordingEnd();
    }

    window.addEventListener("keydown", handleShortcutKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [
    listeningShortcutAction,
    onPlaybackShortcutsChange,
    onShortcutRecordingEnd,
    playbackShortcuts,
    text.keyboardShortcutDuplicate,
    text.keyboardShortcutUnsafeGlobal,
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
                <p className="experimental-setting-description" aria-live="polite">
                  {text.experimentalSkyMonitorStatuses[experimentalInput.skyMonitorStatus]}
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
                    disabled={
                      experimentalInput.isDetectingSkyWindow ||
                      experimentalInput.isTargetWindowSelectionLocked
                    }
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
                      disabled={experimentalInput.isTargetWindowSelectionLocked}
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
                        disabled={experimentalInput.isTargetWindowSelectionLocked}
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
                onClick={() => {
                  void onShortcutRecordingEnd();
                  onKeyMappingListenStart(skyKey);
                }}
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
            <div>
              <span>{text.confirmBeforeExit}</span>
              <p className="experimental-setting-description">
                {text.confirmBeforeExitDescription}
              </p>
            </div>
            <button
              className={`experimental-toggle${
                confirmBeforeExit ? " is-on" : ""
              }`}
              type="button"
              aria-label={text.confirmBeforeExit}
              aria-pressed={confirmBeforeExit}
              aria-busy={isConfirmBeforeExitSaving}
              disabled={isConfirmBeforeExitSaving}
              onClick={() => onConfirmBeforeExitChange(!confirmBeforeExit)}
            >
              <span className="visually-hidden">{text.confirmBeforeExit}</span>
            </button>
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
            const isPending = pendingShortcutRecordingAction === action;
            const isDisabled =
              listeningSkyKey !== null ||
              (pendingShortcutRecordingAction !== null && !isPending);
            const rowShortcutNotice = getPlaybackShortcutNotice(
              action,
              shortcutConflictNotices,
              shortcutNotice,
            );

            return (
              <div className="shortcut-setting-item" key={action}>
                <div className="setting-row">
                  <div className="shortcut-action-label">
                    <span>{text.keyboardShortcutActions[action]}</span>
                    <button
                      type="button"
                      disabled={isListening || isDisabled}
                      aria-pressed={
                        playbackShortcuts[action].scope === "global"
                      }
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
                        onShortcutNoticeClear(action);
                        const isRequestingUnsafeGlobal =
                          playbackShortcuts[action].scope === "in-app" &&
                          isUnsafeGlobalPlaybackShortcut(
                            playbackShortcuts[action],
                          );
                        onPlaybackShortcutsChange({
                          ...playbackShortcuts,
                          [action]: {
                            ...playbackShortcuts[action],
                            scope:
                              playbackShortcuts[action].scope === "global" ||
                              isRequestingUnsafeGlobal
                                ? "in-app"
                                : "global",
                          },
                        });
                        setShortcutConflictNotices((current) => {
                          const remaining = clearPlaybackShortcutNotice(
                            current,
                            action,
                          );
                          return isRequestingUnsafeGlobal
                            ? {
                                ...remaining,
                                [action]: text.keyboardShortcutUnsafeGlobal,
                              }
                            : remaining;
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
                  </div>
                  <button
                    ref={(element) => {
                      shortcutBindingRefs.current[action] = element;
                    }}
                    className={`shortcut-binding-button${
                      isListening ? " is-listening" : ""
                    }`}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onShortcutNoticeClear(action);
                      setShortcutConflictNotices((current) =>
                        clearPlaybackShortcutNotice(current, action),
                      );
                      void onShortcutRecordingStart(action);
                    }}
                  >
                    {isListening
                      ? text.keyboardShortcutListening
                      : formatPlaybackShortcut(playbackShortcuts[action])}
                  </button>
                </div>
                {rowShortcutNotice ? (
                  <p className="shortcut-inline-notice" aria-live="polite">
                    {rowShortcutNotice}
                  </p>
                ) : null}
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
                void onShortcutRecordingEnd();
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
