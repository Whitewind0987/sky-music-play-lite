import type { Song } from "../types/score";
import { getPreviewKeyName } from "../types/keyMapping";
import { MAX_EXPLICIT_NOTE_DURATION_MS } from "./scoreTiming";

export const DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS = 250;
export const DEFAULT_V1_TO_V2_RELEASE_LEAD_MS = 30;
export const DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS = 1200;
export const DEFAULT_V1_TO_V2_MAX_DURATION_MS = 1200;
export const DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS = 500;
export const MIN_V2_NOTE_DURATION_MS = 25;
export const V1_TO_V2_RETRIGGER_SAFETY_MS = 10;
export const V1_TO_V2_DENSE_TYPICAL_GAP_MS = 250;
export const V1_TO_V2_POLYPHONIC_GROUP_RATIO = 0.35;

export type V1ToV2ConversionOptions = {
  name: string;
  minimumSustainGapMs: number;
  releaseLeadMs: number;
  restGapThresholdMs: number;
  maxDurationMs: number;
  finalGroupDurationMs: number;
};

export type V1ToV2ScoreProfile = {
  typicalGapMs: number | null;
  multiNoteGroupRatio: number;
  isDenseTiming: boolean;
  isPolyphonic: boolean;
};

export type V1ToV2ConversionPreview = {
  profile: V1ToV2ScoreProfile;
  generatedSustainCount: number;
};

type V1ToV2NoteGroup = {
  noteIndexes: number[];
  time: number;
  uniqueNormalizedKeys: string[];
};

type V1ToV2DurationPlan = V1ToV2ConversionPreview & {
  durationsByNoteIndex: Map<number, number>;
};

export type V1ToV2ConversionValidationError =
  | "empty-name"
  | "invalid-minimum-sustain-gap"
  | "invalid-release-lead"
  | "invalid-rest-gap-threshold"
  | "invalid-maximum-duration"
  | "invalid-final-duration"
  | "minimum-gap-exceeds-rest-threshold"
  | "minimum-gap-too-short-for-release-lead"
  | "final-duration-exceeds-maximum";

export class V1ToV2ConversionError extends Error {
  constructor(
    public readonly code:
      | V1ToV2ConversionValidationError
      | "already-v2"
      | "empty-score"
      | "invalid-note-time",
  ) {
    super(code);
    this.name = "V1ToV2ConversionError";
  }
}

export function getV1ToV2ConversionValidationError(
  options: V1ToV2ConversionOptions,
): V1ToV2ConversionValidationError | null {
  if (options.name.trim().length === 0) {
    return "empty-name";
  }

  if (
    !isFiniteNumberInRange(
      options.minimumSustainGapMs,
      MIN_V2_NOTE_DURATION_MS,
      MAX_EXPLICIT_NOTE_DURATION_MS,
    )
  ) {
    return "invalid-minimum-sustain-gap";
  }

  if (!isFiniteNumberInRange(options.releaseLeadMs, 1, 500)) {
    return "invalid-release-lead";
  }

  if (
    !isFiniteNumberInRange(
      options.restGapThresholdMs,
      MIN_V2_NOTE_DURATION_MS,
      MAX_EXPLICIT_NOTE_DURATION_MS,
    )
  ) {
    return "invalid-rest-gap-threshold";
  }

  if (
    !isFiniteNumberInRange(
      options.maxDurationMs,
      MIN_V2_NOTE_DURATION_MS,
      MAX_EXPLICIT_NOTE_DURATION_MS,
    )
  ) {
    return "invalid-maximum-duration";
  }

  if (
    !isFiniteNumberInRange(
      options.finalGroupDurationMs,
      MIN_V2_NOTE_DURATION_MS,
      MAX_EXPLICIT_NOTE_DURATION_MS,
    )
  ) {
    return "invalid-final-duration";
  }

  if (options.minimumSustainGapMs > options.restGapThresholdMs) {
    return "minimum-gap-exceeds-rest-threshold";
  }

  if (
    options.minimumSustainGapMs - options.releaseLeadMs <
    MIN_V2_NOTE_DURATION_MS
  ) {
    return "minimum-gap-too-short-for-release-lead";
  }

  if (options.finalGroupDurationMs > options.maxDurationMs) {
    return "final-duration-exceeds-maximum";
  }

  return null;
}

export function convertV1SongToV2(
  sourceSong: Song,
  options: V1ToV2ConversionOptions,
): Song {
  assertConvertibleV1Song(sourceSong, options);
  const plan = buildV1ToV2DurationPlan(sourceSong, options);

  return {
    formatVersion: 2,
    name: options.name.trim(),
    bpm: sourceSong.bpm,
    bitsPerPage: sourceSong.bitsPerPage,
    pitchLevel: sourceSong.pitchLevel,
    isComposed: sourceSong.isComposed,
    songNotes: sourceSong.songNotes.map((note, noteIndex) => {
      const duration = plan.durationsByNoteIndex.get(noteIndex);

      return duration === undefined
        ? { time: note.time, key: note.key }
        : { time: note.time, key: note.key, duration };
    }),
  };
}

export function previewV1ToV2Conversion(
  sourceSong: Song,
  options: V1ToV2ConversionOptions,
): V1ToV2ConversionPreview {
  assertConvertibleV1Song(sourceSong, options);
  const { generatedSustainCount, profile } =
    buildV1ToV2DurationPlan(sourceSong, options);

  return { generatedSustainCount, profile };
}

export function analyzeV1ToV2ScoreProfile(
  sourceSong: Song,
): V1ToV2ScoreProfile {
  return createV1ToV2ScoreProfile(buildV1ToV2NoteGroups(sourceSong));
}

function assertConvertibleV1Song(
  sourceSong: Song,
  options: V1ToV2ConversionOptions,
) {
  if (sourceSong.formatVersion === 2) {
    throw new V1ToV2ConversionError("already-v2");
  }

  const validationError = getV1ToV2ConversionValidationError(options);

  if (validationError !== null) {
    throw new V1ToV2ConversionError(validationError);
  }

  if (sourceSong.songNotes.length === 0) {
    throw new V1ToV2ConversionError("empty-score");
  }

  if (sourceSong.songNotes.some((note) => !Number.isFinite(note.time))) {
    throw new V1ToV2ConversionError("invalid-note-time");
  }
}

function buildV1ToV2DurationPlan(
  sourceSong: Song,
  options: V1ToV2ConversionOptions,
): V1ToV2DurationPlan {
  const groups = buildV1ToV2NoteGroups(sourceSong);
  const profile = createV1ToV2ScoreProfile(groups);
  const timesByNormalizedKey =
    collectSortedUniqueTimesByNormalizedKey(sourceSong);
  const durationsByNoteIndex = new Map<number, number>();
  const sustainedNormalizedKeysByTime = new Map<number, Set<string>>();

  groups.forEach((group, groupIndex) => {
    const nextGroup = groups[groupIndex + 1];

    const baseDurationMs =
      nextGroup === undefined
        ? Math.min(
            Math.round(options.finalGroupDurationMs),
            options.maxDurationMs,
          )
        : getEligibleNonFinalBaseDuration(
            group.time,
            nextGroup.time,
            options,
          );

    if (
      baseDurationMs === null ||
      baseDurationMs < MIN_V2_NOTE_DURATION_MS
    ) {
      return;
    }

    group.noteIndexes.forEach((noteIndex) => {
      const note = sourceSong.songNotes[noteIndex];

      if (!note) {
        return;
      }

      const normalizedKey = getPreviewKeyName(note.key);
      const nextSameKeyTime =
        nextGroup === undefined
          ? undefined
          : findNextStrictlyLaterTime(
              timesByNormalizedKey.get(normalizedKey) ?? [],
              note.time,
            );
      const retriggerSafeDurationMs =
        nextSameKeyTime === undefined
          ? baseDurationMs
          : Math.min(
              baseDurationMs,
              nextSameKeyTime -
                note.time -
                V1_TO_V2_RETRIGGER_SAFETY_MS,
            );

      if (retriggerSafeDurationMs < MIN_V2_NOTE_DURATION_MS) {
        return;
      }

      durationsByNoteIndex.set(
        noteIndex,
        Math.min(
          Math.round(retriggerSafeDurationMs),
          options.maxDurationMs,
        ),
      );
      const sustainedKeys =
        sustainedNormalizedKeysByTime.get(note.time) ?? new Set<string>();
      sustainedKeys.add(normalizedKey);
      sustainedNormalizedKeysByTime.set(note.time, sustainedKeys);
    });
  });

  return {
    durationsByNoteIndex,
    generatedSustainCount: Array.from(
      sustainedNormalizedKeysByTime.values(),
    ).reduce((count, keys) => count + keys.size, 0),
    profile,
  };
}

function getEligibleNonFinalBaseDuration(
  currentTime: number,
  nextTime: number,
  options: V1ToV2ConversionOptions,
) {
  const gapMs = nextTime - currentTime;

  if (
    gapMs < options.minimumSustainGapMs ||
    gapMs > options.restGapThresholdMs
  ) {
    return null;
  }

  const baseDurationMs = Math.min(
    gapMs - options.releaseLeadMs,
    options.maxDurationMs,
  );

  return baseDurationMs < MIN_V2_NOTE_DURATION_MS
    ? null
    : baseDurationMs;
}

function buildV1ToV2NoteGroups(sourceSong: Song): V1ToV2NoteGroup[] {
  const noteIndexesByTime = new Map<number, number[]>();

  sourceSong.songNotes.forEach((note, noteIndex) => {
    if (!Number.isFinite(note.time)) {
      return;
    }

    const noteIndexes = noteIndexesByTime.get(note.time) ?? [];
    noteIndexes.push(noteIndex);
    noteIndexesByTime.set(note.time, noteIndexes);
  });

  return Array.from(noteIndexesByTime, ([time, noteIndexes]) => ({
    noteIndexes,
    time,
    uniqueNormalizedKeys: Array.from(
      new Set(
        noteIndexes.map((noteIndex) =>
          getPreviewKeyName(
            sourceSong.songNotes[noteIndex]?.key ?? "",
          ),
        ),
      ),
    ),
  })).sort((left, right) => left.time - right.time);
}

function createV1ToV2ScoreProfile(
  groups: readonly V1ToV2NoteGroup[],
): V1ToV2ScoreProfile {
  const positiveGaps = groups
    .slice(1)
    .map((group, index) => group.time - (groups[index]?.time ?? group.time))
    .filter((gapMs) => gapMs > 0)
    .sort((left, right) => left - right);
  const typicalGapMs = getMedian(positiveGaps);
  const multiNoteGroupCount = groups.filter(
    (group) => group.uniqueNormalizedKeys.length > 1,
  ).length;
  const multiNoteGroupRatio =
    groups.length === 0 ? 0 : multiNoteGroupCount / groups.length;
  const isDenseTiming =
    typicalGapMs !== null &&
    typicalGapMs <= V1_TO_V2_DENSE_TYPICAL_GAP_MS;
  const isPolyphonic =
    multiNoteGroupRatio >= V1_TO_V2_POLYPHONIC_GROUP_RATIO;

  return {
    isDenseTiming,
    isPolyphonic,
    multiNoteGroupRatio,
    typicalGapMs,
  };
}

function getMedian(sortedValues: readonly number[]) {
  if (sortedValues.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 1
    ? (sortedValues[middleIndex] ?? null)
    : ((sortedValues[middleIndex - 1] ?? 0) +
        (sortedValues[middleIndex] ?? 0)) /
        2;
}

function collectSortedUniqueTimesByNormalizedKey(sourceSong: Song) {
  const timesByNormalizedKey = new Map<string, Set<number>>();

  sourceSong.songNotes.forEach((note) => {
    const normalizedKey = getPreviewKeyName(note.key);
    const times =
      timesByNormalizedKey.get(normalizedKey) ?? new Set<number>();
    times.add(note.time);
    timesByNormalizedKey.set(normalizedKey, times);
  });

  return new Map(
    Array.from(timesByNormalizedKey, ([key, times]) => [
      key,
      Array.from(times).sort((left, right) => left - right),
    ]),
  );
}

function findNextStrictlyLaterTime(
  sortedTimes: readonly number[],
  currentTime: number,
) {
  let lowerBound = 0;
  let upperBound = sortedTimes.length;

  while (lowerBound < upperBound) {
    const middle = Math.floor((lowerBound + upperBound) / 2);

    if ((sortedTimes[middle] ?? currentTime) <= currentTime) {
      lowerBound = middle + 1;
    } else {
      upperBound = middle;
    }
  }

  return sortedTimes[lowerBound];
}

function isFiniteNumberInRange(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
