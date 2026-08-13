import {
  getPreviewKeyName,
  skyKeyNames,
  type SkyKeyName,
} from "../types/keyMapping";
import type { Note } from "../types/score";
import type { ScoreRecordingSession } from "../types/scoreRecording";
import type {
  ScoreVisualizationModel,
  ScoreVisualizationOptions,
  ScoreVisualGroup,
  ScoreVisualNote,
  ScoreVisualPage,
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
export const SCORE_VISUAL_PAGE_COLUMNS = 5;
export const SCORE_VISUAL_PAGE_ROWS = 3;
export const SCORE_VISUAL_GROUPS_PER_PAGE =
  SCORE_VISUAL_PAGE_COLUMNS * SCORE_VISUAL_PAGE_ROWS;

export type SkyVisualNoteLabel =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G";
export type SkyVisualKeyMotif = "circle" | "diamond" | "circle-diamond";

export type SkyVisualKeyDefinition = {
  skyKey: SkyKeyName;
  noteLabel: SkyVisualNoteLabel;
  motif: SkyVisualKeyMotif;
};

export const skyVisualKeyDefinitions = [
  { skyKey: "Key0", noteLabel: "C", motif: "circle-diamond" },
  { skyKey: "Key1", noteLabel: "D", motif: "diamond" },
  { skyKey: "Key2", noteLabel: "E", motif: "circle" },
  { skyKey: "Key3", noteLabel: "F", motif: "diamond" },
  { skyKey: "Key4", noteLabel: "G", motif: "circle" },
  { skyKey: "Key5", noteLabel: "A", motif: "circle" },
  { skyKey: "Key6", noteLabel: "B", motif: "diamond" },
  { skyKey: "Key7", noteLabel: "C", motif: "circle-diamond" },
  { skyKey: "Key8", noteLabel: "D", motif: "diamond" },
  { skyKey: "Key9", noteLabel: "E", motif: "circle" },
  { skyKey: "Key10", noteLabel: "F", motif: "circle" },
  { skyKey: "Key11", noteLabel: "G", motif: "diamond" },
  { skyKey: "Key12", noteLabel: "A", motif: "circle" },
  { skyKey: "Key13", noteLabel: "B", motif: "diamond" },
  { skyKey: "Key14", noteLabel: "C", motif: "circle-diamond" },
] as const satisfies readonly SkyVisualKeyDefinition[];

const skyKeyNameSet: ReadonlySet<string> = new Set(skyKeyNames);

function isSkyKeyName(value: string): value is SkyKeyName {
  return skyKeyNameSet.has(value);
}

function getVisualSkyKey(sourceKey: string): SkyKeyName | null {
  const previewKey = getPreviewKeyName(sourceKey);

  return isSkyKeyName(previewKey) ? previewKey : null;
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
      const skyKey = getVisualSkyKey(note.key);
      if (skyKey === null) {
        return [];
      }

      const explicitDurationMs = isValidExplicitDuration(note.duration)
        ? note.duration
        : null;
      const visualDurationMs =
        explicitDurationMs ?? NOTE_HIGHLIGHT_MS;

      return [
        {
          skyKey,
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

export function getActiveScoreRecordingVisualKeys(
  session: ScoreRecordingSession,
): SkyKeyName[] {
  if (session.finished || session.activePresses.size === 0) {
    return [];
  }

  const activeKeys = new Set<SkyKeyName>();
  session.activePresses.forEach((activePress) => {
    const note = session.notes[activePress.noteIndex];
    if (note === undefined) {
      return;
    }

    const skyKey = getVisualSkyKey(note.key);
    if (skyKey !== null) {
      activeKeys.add(skyKey);
    }
  });

  return skyKeyNames.filter((skyKey) => activeKeys.has(skyKey));
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

export function paginateScoreVisualGroups(
  groups: readonly ScoreVisualGroup[],
): readonly ScoreVisualPage[] {
  const pages: ScoreVisualPage[] = [];

  for (
    let startGroupIndex = 0;
    startGroupIndex < groups.length;
    startGroupIndex += SCORE_VISUAL_GROUPS_PER_PAGE
  ) {
    pages.push({
      pageIndex: pages.length,
      startGroupIndex,
      groups: groups.slice(
        startGroupIndex,
        startGroupIndex + SCORE_VISUAL_GROUPS_PER_PAGE,
      ),
    });
  }

  return pages;
}

export function getScoreVisualPageIndexForGroup(
  groupIndex: number,
  totalGroupCount: number,
): number {
  if (
    !Number.isInteger(groupIndex) ||
    !Number.isInteger(totalGroupCount) ||
    groupIndex < 0 ||
    totalGroupCount <= 0 ||
    groupIndex >= totalGroupCount
  ) {
    return -1;
  }

  return Math.floor(groupIndex / SCORE_VISUAL_GROUPS_PER_PAGE);
}
