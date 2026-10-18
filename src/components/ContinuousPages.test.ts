import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { uiText, type LanguageCode } from "../i18n/uiText";
import { defaultKeyMapping } from "../types/keyMapping";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import type { Song } from "../types/score";
import { PlaybackLog } from "./LogPanel";
import { ScoreRecordingPage } from "./ScoreRecordingPage";
import { SettingsPlaceholder } from "./SettingsPanel";
import { PlaybackScorePreview } from "./score-visualization/PlaybackScorePreview";

const progress = { currentMs: 100, percent: 10, totalMs: 1000 };
const song: Song = {
  name: "Test score",
  bpm: 120,
  bitsPerPage: 16,
  pitchLevel: 0,
  isComposed: false,
  songNotes: [{ key: "1Key0", time: 0, duration: 500 }],
};

function settingsProps(language: LanguageCode): ComponentProps<typeof SettingsPlaceholder> {
  return {
    accentColor: "#4287F5",
    appRuntimeInfo: null,
    confirmBeforeExit: true,
    isConfirmBeforeExitSaving: false,
    experimentalInput: {
      candidateWindows: [],
      experimentalInputEnabled: true,
      experimentalInputMode: "target-window-message",
      experimentalPlaybackProgress: progress,
      foregroundCountdown: null,
      foregroundPlaybackState: "idle",
      isDetectingSkyWindow: false,
      isExperimentalPlaybackRunning: false,
      isTargetWindowSelectionLocked: false,
      isRefreshingWindows: false,
      lastError: null,
      skyMonitorStatus: "waiting",
      onDetectSkyWindow: vi.fn(),
      onExperimentalInputEnabledChange: vi.fn(),
      onExperimentalInputModeChange: vi.fn(),
      onRefreshWindows: vi.fn(),
      onSelectedWindowChange: vi.fn(),
      onTargetWindowCompatibilityProfileChange: vi.fn(),
      selectedWindowHwnd: null,
      selectedWindowSnapshot: undefined,
      targetWindowCompatibilityProfile: "legacy-activate-scan-lparam",
    },
    keyMapping: defaultKeyMapping,
    language,
    listeningSkyKey: null,
    listeningShortcutAction: null,
    onShortcutNoticeClear: vi.fn(),
    onAccentColorChange: vi.fn(),
    onAccentColorReset: vi.fn(),
    onUiScaleChange: vi.fn(),
    uiScale: 1.2,
    onKeyMappingListenStart: vi.fn(),
    onConfirmBeforeExitChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onOpenLogDirectory: vi.fn(),
    onPlaybackShortcutsChange: vi.fn(),
    onShortcutRecordingEnd: vi.fn(async () => {}),
    onShortcutRecordingUnchanged: vi.fn(() => false),
    onShortcutRecordingStart: vi.fn(async () => true),
    pendingShortcutRecordingAction: null,
    playbackShortcuts: defaultPlaybackShortcuts,
    shortcutNotice: {},
    text: uiText[language].settings,
  };
}

describe.each<LanguageCode>(["zh-CN", "en-US"])("continuous pages (%s)", (language) => {
  const text = uiText[language];
  const renderRecording = (
    overrides: Partial<ComponentProps<typeof ScoreRecordingPage>> = {},
  ) => renderToStaticMarkup(createElement(ScoreRecordingPage, {
    completedName: "Practice score",
    completedNoteCount: null,
    completedSession: null,
    isSaving: false,
    lifecycle: "idle",
    liveSession: null,
    onCancel: vi.fn(),
    onCompletedNameChange: vi.fn(),
    onSave: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    recordedNoteCount: 1,
    text: text.scoreRecording,
    ...overrides,
  }));
  const renderPreview = (
    overrides: Partial<ComponentProps<typeof PlaybackScorePreview>> = {},
  ) => renderToStaticMarkup(createElement(PlaybackScorePreview, {
    followsProgress: true,
    hasLoadFailed: false,
    isLoading: false,
    noteIntervalDelayMs: 0,
    playbackSpeed: 1,
    progress,
    showsActiveKeys: true,
    song,
    text: text.playbackScorePreview,
    timingMode: "source",
    ...overrides,
  }));

  it("keeps all settings sections, scale choices, accent controls, and warnings", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPlaceholder, settingsProps(language)));
    const headings = [
      text.settings.experimentalInputTitle,
      text.settings.keyMappingTitle,
      text.settings.systemTitle,
      text.settings.appInfoTitle,
      text.settings.keyboardShortcutsTitle,
    ];
    const headingPositions = headings.map((title) => markup.indexOf(`>${title}</h2>`));
    expect(headingPositions.every((position) => position >= 0)).toBe(true);
    expect(headingPositions).toEqual([...headingPositions].sort((a, b) => a - b));
    expect(markup.match(/role="radio"/g)).toHaveLength(3);
    expect(markup).toContain('role="radio" aria-checked="true"');
    expect(markup).toContain('class="accent-color-picker" type="color"');
    expect(markup).toContain('class="accent-color-hex-input" type="text"');
    expect(markup).toContain(text.settings.experimentalInputWarning);
    expect(markup).toContain(text.settings.keyboardShortcutWarning);
    expect(markup.match(/class="key-binding-card"/g)).toHaveLength(15);
  });

  it("retains listening feedback, shortcut validation, and reset controls", () => {
    const props = settingsProps(language);
    const markup = renderToStaticMarkup(createElement(SettingsPlaceholder, {
      ...props,
      listeningShortcutAction: "pauseResume",
      shortcutNotice: { next: "Shortcut validation feedback" },
    }));
    expect(markup).toContain('class="shortcut-binding-button is-listening"');
    expect(markup).toContain(text.settings.keyboardShortcutListening);
    expect(markup).toContain('aria-live="polite">Shortcut validation feedback</p>');
    expect(markup).toContain(text.settings.keyboardShortcutReset);

    const keyMarkup = renderToStaticMarkup(createElement(SettingsPlaceholder, {
      ...props,
      listeningSkyKey: "Key0",
    }));
    expect(keyMarkup).toContain('class="key-binding-card is-listening" type="button" aria-pressed="true"');
    expect(keyMarkup).toContain(text.settings.keyMappingCancelHint);
  });

  it("keeps recording controls, visualizations, and guidance in reading order", () => {
    const markup = renderRecording();
    expect(markup).toContain(`>${text.scoreRecording.start}</button>`);
    expect(markup.indexOf('aria-labelledby="score-recording-title"'))
      .toBeLessThan(markup.indexOf('aria-label="' + text.scoreRecording.visualization.keyboardAria + '"'));
    expect(markup.indexOf('aria-label="' + text.scoreRecording.visualization.timelineAria + '"'))
      .toBeLessThan(markup.indexOf('aria-labelledby="score-recording-guide-title"'));
    expect(markup).toContain(text.scoreRecording.visualization.emptyTimeline);
  });

  it("retains the live recording indicator, Stop/Cancel, and held-key feedback", () => {
    const markup = renderRecording({
      lifecycle: "recording",
      liveSession: {
        sessionId: 1,
        activePresses: new Map([["y", { noteIndex: 0, startedAtMs: 0 }]]),
        notes: song.songNotes,
        firstAcceptedNoteTimeMs: 0,
        lastAcceptedEventTimeMs: 0,
        finished: false,
      },
    });
    expect(markup).toContain('class="score-recording-status is-active" aria-live="polite"');
    expect(markup).toContain(`>${text.scoreRecording.stop}</button>`);
    expect(markup).toContain(`>${text.scoreRecording.cancel}</button>`);
    expect(markup).toMatch(/class="sky-visual-key [^"]* is-active"/);
    expect(markup).not.toContain('disabled=""');
  });

  it.each(["starting", "stopping", "cancelling"] as const)("disables recording actions while %s", (lifecycle) => {
    const markup = renderRecording({ lifecycle });
    expect(markup).toContain(`>${text.scoreRecording[lifecycle]}</button>`);
    expect(markup).toContain('type="button" disabled=""');
  });

  it("retains completed recording naming and disables save actions while saving", () => {
    const markup = renderRecording({ completedNoteCount: 1, isSaving: true });
    expect(markup).toContain('<label for="score-recording-name">');
    expect(markup).toContain('value="Practice score"');
    expect(markup).toContain(text.scoreRecording.completedInMemory);
    expect(markup).toContain(`disabled="">${text.scoreRecording.saving}</button>`);
    expect(markup).toContain(`disabled="">${text.scoreRecording.recordAgain}</button>`);
  });

  it("retains preview highlighting and progress-following states", () => {
    expect(renderPreview()).toContain('class="score-visual-group is-current"');
    expect(renderPreview()).toContain('class="score-visual-group__cell is-marked is-held"');
    const markup = renderPreview({ followsProgress: false, showsActiveKeys: false });
    expect(markup).not.toContain(' is-current');
    expect(markup).not.toContain(' is-active');
    expect(markup).not.toContain(' is-held');
    expect(markup).toContain(`aria-label="${text.playbackScorePreview.keyboardAria}"`);
    expect(markup).toContain(`aria-label="${text.playbackScorePreview.timelineAria}"`);
  });

  it("retains preview loading and failure messages", () => {
    expect(renderPreview({ song: null, isLoading: true }))
      .toContain(text.playbackScorePreview.loadingTimeline);
    expect(renderPreview({ song: null, hasLoadFailed: true }))
      .toContain(text.playbackScorePreview.unavailableTimeline);
  });

  it("keeps native collapsible log groups, complete messages, and within-group order", () => {
    const entries = ["System ready", "Import first", "Import second", "Preview started", `Target hwnd: ${"1234567890".repeat(80)}`];
    const markup = renderToStaticMarkup(createElement(PlaybackLog, { entries, text: text.logs }));
    expect(markup.match(/<details class="log-group" open="">/g)).toHaveLength(4);
    expect(markup.match(/<summary>/g)).toHaveLength(4);
    expect(markup.indexOf("Import first")).toBeLessThan(markup.indexOf("Import second"));
    for (const entry of entries) expect(markup).toContain(`<li>${entry}</li>`);
    expect(markup).toContain('aria-live="polite"');
  });

  it("keeps the log empty state accessible", () => {
    const markup = renderToStaticMarkup(createElement(PlaybackLog, { entries: [], text: text.logs }));
    expect(markup).toContain('aria-labelledby="playback-log-title"');
    expect(markup).toContain(`<p class="log-empty">${text.logs.emptyState}</p>`);
    expect(markup).not.toContain("<details");
  });
});
