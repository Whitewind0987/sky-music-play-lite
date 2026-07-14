import type { Note } from "../types/score";

export const NOTE_HIGHLIGHT_MS = 300;
export const MAX_EXPLICIT_NOTE_DURATION_MS = 60000;

export type ScoreTimingOptions = {
  noteIntervalDelayMs: number;
  playbackSpeed: number;
};

export type ScoreTimingGroup = {
  adjustedStartMs: number;
  explicitHoldEndMs: number;
  maxExplicitDurationMs: number;
  notes: Note[];
  sourceTimeMs: number;
};

export type ScoreTiming = {
  finishMs: number;
  groups: ScoreTimingGroup[];
  lastAdjustedStartMs: number;
  totalMs: number;
};

export function calculateScoreTiming(
  notes: Note[],
  options: ScoreTimingOptions,
): ScoreTiming {
  const groupedNotes = groupNotesByFiniteSourceTime(notes);

  return calculateGroupedScoreTiming(groupedNotes, options);
}

export function calculateScoreTimingFromMetadata(
  noteGroupDelaysMs: number[],
  noteGroupMaxHoldMs: number[],
  options: ScoreTimingOptions,
): ScoreTiming {
  const groupedNotes: Array<{
    maxExplicitDurationMs: number;
    notes: Note[];
    sourceTimeMs: number;
  }> = [];
  let sourceTimeMs = 0;

  noteGroupDelaysMs.forEach((delayMs, index) => {
    sourceTimeMs += Math.max(0, delayMs);
    groupedNotes.push({
      maxExplicitDurationMs: noteGroupMaxHoldMs[index] ?? 0,
      notes: [],
      sourceTimeMs,
    });
  });

  return calculateGroupedScoreTiming(groupedNotes, options);
}

export function groupNotesByFiniteSourceTime(notes: Note[]) {
  const sortedNotes = notes
    .filter((note) => Number.isFinite(note.time))
    .slice()
    .sort((left, right) => left.time - right.time);
  const groups: Array<{
    maxExplicitDurationMs: number;
    notes: Note[];
    sourceTimeMs: number;
  }> = [];

  sortedNotes.forEach((note) => {
    const validDurationMs = isValidExplicitDuration(note.duration)
      ? note.duration
      : 0;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.sourceTimeMs === note.time) {
      lastGroup.notes.push(note);
      lastGroup.maxExplicitDurationMs = Math.max(
        lastGroup.maxExplicitDurationMs,
        validDurationMs,
      );
      return;
    }

    groups.push({
      maxExplicitDurationMs: validDurationMs,
      notes: [note],
      sourceTimeMs: note.time,
    });
  });

  return groups;
}

export function isValidExplicitDuration(
  durationMs: number | undefined,
): durationMs is number {
  return (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    durationMs <= MAX_EXPLICIT_NOTE_DURATION_MS
  );
}

function calculateGroupedScoreTiming(
  groups: Array<{
    maxExplicitDurationMs: number;
    notes: Note[];
    sourceTimeMs: number;
  }>,
  options: ScoreTimingOptions,
): ScoreTiming {
  if (groups.length === 0) {
    return { finishMs: 0, groups: [], lastAdjustedStartMs: 0, totalMs: 0 };
  }

  const playbackSpeed = options.playbackSpeed;
  const timingGroups: ScoreTimingGroup[] = [];
  groups.forEach((group, index) => {
    const adjustedStartMs =
      index === 0
        ? Math.max(0, group.sourceTimeMs) / playbackSpeed
        : (timingGroups[index - 1]?.adjustedStartMs ?? 0) +
          Math.max(
            0,
            (group.sourceTimeMs - groups[index - 1].sourceTimeMs) /
              playbackSpeed +
              options.noteIntervalDelayMs,
          );

    timingGroups.push({
      adjustedStartMs,
      explicitHoldEndMs:
        adjustedStartMs + group.maxExplicitDurationMs / playbackSpeed,
      maxExplicitDurationMs: group.maxExplicitDurationMs,
      notes: group.notes,
      sourceTimeMs: group.sourceTimeMs,
    });
  });
  const lastAdjustedStartMs =
    timingGroups[timingGroups.length - 1]?.adjustedStartMs ?? 0;
  const totalMs = Math.max(
    lastAdjustedStartMs,
    ...timingGroups.map((group) => group.explicitHoldEndMs),
  );
  const finishMs = Math.max(
    totalMs,
    lastAdjustedStartMs + NOTE_HIGHLIGHT_MS / playbackSpeed,
  );

  return { finishMs, groups: timingGroups, lastAdjustedStartMs, totalMs };
}
