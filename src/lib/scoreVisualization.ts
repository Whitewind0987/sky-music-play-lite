import {
  getPreviewKeyName,
  skyKeyNames,
  type SkyKeyName,
} from "../types/keyMapping";
import type { Note } from "../types/score";
import type {
  ScoreVisualizationModel,
  ScoreVisualizationOptions,
  ScoreVisualGroup,
  ScoreVisualNote,
  ScoreVisualRenderWindow,
} from "../types/scoreVisualization";
import {
  calculateScoreTiming,
  isValidExplicitDuration,
  NOTE_HIGHLIGHT_MS,
  type ScoreTimingOptions,
} from "./scoreTiming";

export const DEFAULT_VISUAL_CHORD_WINDOW_MS = 30;
export const DEFAULT_VISUAL_GROUPS_BEFORE = 12;
export const DEFAULT_VISUAL_GROUPS_AFTER = 24;

const skyKeyNameSet: ReadonlySet<string> = new Set(skyKeyNames);

function isSkyKeyName(value: string): value is SkyKeyName {
  return skyKeyNameSet.has(value);
}

function normalizeVisualChordWindowMs(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_VISUAL_CHORD_WINDOW_MS;
  }

  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function createVisualGroup(notes: ScoreVisualNote[]): ScoreVisualGroup {
  const sourceTimes = notes.map((note) => note.sourceTimeMs);
  const adjustedStarts = notes.map((note) => note.adjustedStartMs);
  const includedKeys = new Set(notes.map((note) => note.skyKey));

  return {
    notes,
    skyKeys: skyKeyNames.filter((skyKey) => includedKeys.has(skyKey)),
    sourceStartMs: Math.min(...sourceTimes),
    sourceEndMs: Math.max(...sourceTimes),
    adjustedStartMs: Math.min(...adjustedStarts),
    adjustedLastStartMs: Math.max(...adjustedStarts),
    visualEndMs: Math.max(...notes.map((note) => note.visualEndMs)),
  };
}

export function buildScoreVisualization(
  notes: readonly Note[],
  timingOptions: ScoreTimingOptions,
  visualizationOptions: ScoreVisualizationOptions = {},
): ScoreVisualizationModel {
  const timing = calculateScoreTiming(notes.slice(), timingOptions);
  const visualChordWindowMs = normalizeVisualChordWindowMs(
    visualizationOptions.visualChordWindowMs,
  );
  const visualGroups: ScoreVisualGroup[] = [];
  let pendingNotes: ScoreVisualNote[] = [];
  let pendingSourceStartMs = 0;

  const flushPendingGroup = () => {
    if (pendingNotes.length > 0) {
      visualGroups.push(createVisualGroup(pendingNotes));
      pendingNotes = [];
    }
  };

  timing.groups.forEach((timingGroup) => {
    const visualNotes = timingGroup.notes.flatMap((note): ScoreVisualNote[] => {
      const previewKey = getPreviewKeyName(note.key);
      if (!isSkyKeyName(previewKey)) {
        return [];
      }

      const explicitDurationMs = isValidExplicitDuration(note.duration)
        ? note.duration
        : null;
      const visualDurationMs =
        explicitDurationMs ?? NOTE_HIGHLIGHT_MS;

      return [
        {
          skyKey: previewKey,
          sourceKey: note.key,
          sourceTimeMs: timingGroup.sourceTimeMs,
          adjustedStartMs: timingGroup.adjustedStartMs,
          visualEndMs:
            timingGroup.adjustedStartMs +
            visualDurationMs / timingOptions.playbackSpeed,
          explicitDurationMs,
        },
      ];
    });

    if (visualNotes.length === 0) {
      return;
    }

    if (pendingNotes.length === 0) {
      pendingSourceStartMs = timingGroup.sourceTimeMs;
    } else if (
      timingGroup.sourceTimeMs - pendingSourceStartMs >
      visualChordWindowMs
    ) {
      flushPendingGroup();
      pendingSourceStartMs = timingGroup.sourceTimeMs;
    }

    pendingNotes.push(...visualNotes);
  });

  flushPendingGroup();

  return {
    groups: visualGroups,
    totalMs: timing.totalMs,
    finishMs: timing.finishMs,
  };
}

export function getActiveScoreVisualKeys(
  groups: readonly ScoreVisualGroup[],
  currentMs: number,
): SkyKeyName[] {
  if (!Number.isFinite(currentMs)) {
    return [];
  }

  const activeKeys = new Set<SkyKeyName>();
  groups.forEach((group) => {
    group.notes.forEach((note) => {
      if (
        note.adjustedStartMs <= currentMs &&
        currentMs < note.visualEndMs
      ) {
        activeKeys.add(note.skyKey);
      }
    });
  });

  return skyKeyNames.filter((skyKey) => activeKeys.has(skyKey));
}

export function findCurrentScoreVisualGroupIndex(
  groups: readonly ScoreVisualGroup[],
  currentMs: number,
): number {
  if (!Number.isFinite(currentMs)) {
    return -1;
  }

  let currentIndex = -1;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group === undefined || group.adjustedStartMs > currentMs) {
      break;
    }
    currentIndex = index;
  }

  return currentIndex;
}

function normalizeWindowCount(value: number | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function getScoreVisualRenderWindow(
  groups: readonly ScoreVisualGroup[],
  focusIndex: number,
  beforeCount?: number,
  afterCount?: number,
): ScoreVisualRenderWindow {
  if (groups.length === 0) {
    return { startIndex: 0, endIndexExclusive: 0, groups: [] };
  }

  const normalizedFocusIndex = Number.isFinite(focusIndex)
    ? Math.min(Math.max(Math.floor(focusIndex), 0), groups.length - 1)
    : 0;
  const normalizedBeforeCount = normalizeWindowCount(
    beforeCount,
    DEFAULT_VISUAL_GROUPS_BEFORE,
  );
  const normalizedAfterCount = normalizeWindowCount(
    afterCount,
    DEFAULT_VISUAL_GROUPS_AFTER,
  );
  const startIndex = Math.max(
    0,
    normalizedFocusIndex - normalizedBeforeCount,
  );
  const endIndexExclusive = Math.min(
    groups.length,
    normalizedFocusIndex + normalizedAfterCount + 1,
  );

  return {
    startIndex,
    endIndexExclusive,
    groups: groups.slice(startIndex, endIndexExclusive),
  };
}
