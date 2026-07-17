import type { Song } from "../types/score";
import { MAX_EXPLICIT_NOTE_DURATION_MS } from "./scoreTiming";

export const DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS = 250;
export const DEFAULT_V1_TO_V2_RELEASE_LEAD_MS = 30;
export const DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS = 1200;
export const DEFAULT_V1_TO_V2_MAX_DURATION_MS = 1200;
export const DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS = 500;
export const MIN_V2_NOTE_DURATION_MS = 25;
export const V1_TO_V2_RETRIGGER_SAFETY_MS = 10;

export type V1ToV2ConversionOptions = {
  name: string;
  minimumSustainGapMs: number;
  releaseLeadMs: number;
  restGapThresholdMs: number;
  maxDurationMs: number;
  finalGroupDurationMs: number;
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

  const groupTimes = Array.from(
    new Set(sourceSong.songNotes.map((note) => note.time)),
  ).sort((left, right) => left - right);

  if (groupTimes.length === 0) {
    throw new V1ToV2ConversionError("empty-score");
  }

  const baseDurationsByTime = new Map<number, number>();
  const finalGroupTime = groupTimes[groupTimes.length - 1];

  groupTimes.forEach((groupTime, groupIndex) => {
    const nextGroupTime = groupTimes[groupIndex + 1];

    if (nextGroupTime === undefined) {
      baseDurationsByTime.set(
        groupTime,
        Math.min(
          Math.round(options.finalGroupDurationMs),
          options.maxDurationMs,
        ),
      );
      return;
    }

    const gapMs = nextGroupTime - groupTime;

    if (
      gapMs < options.minimumSustainGapMs ||
      gapMs > options.restGapThresholdMs
    ) {
      return;
    }

    const baseDurationMs = Math.min(
      gapMs - options.releaseLeadMs,
      options.maxDurationMs,
    );

    if (baseDurationMs >= MIN_V2_NOTE_DURATION_MS) {
      baseDurationsByTime.set(groupTime, baseDurationMs);
    }
  });

  const timesByKey = collectSortedUniqueTimesByKey(sourceSong);

  return {
    formatVersion: 2,
    name: options.name.trim(),
    bpm: sourceSong.bpm,
    bitsPerPage: sourceSong.bitsPerPage,
    pitchLevel: sourceSong.pitchLevel,
    isComposed: sourceSong.isComposed,
    songNotes: sourceSong.songNotes.map((note) => {
      const baseDuration = baseDurationsByTime.get(note.time);

      if (baseDuration === undefined) {
        return { time: note.time, key: note.key };
      }

      if (note.time === finalGroupTime) {
        return {
          time: note.time,
          key: note.key,
          duration: baseDuration,
        };
      }

      const nextSameKeyTime = findNextStrictlyLaterTime(
        timesByKey.get(note.key) ?? [],
        note.time,
      );
      const duration =
        nextSameKeyTime === undefined
          ? baseDuration
          : Math.min(
              baseDuration,
              nextSameKeyTime -
                note.time -
                V1_TO_V2_RETRIGGER_SAFETY_MS,
            );

      return duration < MIN_V2_NOTE_DURATION_MS
        ? { time: note.time, key: note.key }
        : {
            time: note.time,
            key: note.key,
            duration: Math.min(
              Math.round(duration),
              options.maxDurationMs,
            ),
          };
    }),
  };
}

function collectSortedUniqueTimesByKey(sourceSong: Song) {
  const timesByKey = new Map<string, Set<number>>();

  sourceSong.songNotes.forEach((note) => {
    const times = timesByKey.get(note.key) ?? new Set<number>();
    times.add(note.time);
    timesByKey.set(note.key, times);
  });

  return new Map(
    Array.from(timesByKey, ([key, times]) => [
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
