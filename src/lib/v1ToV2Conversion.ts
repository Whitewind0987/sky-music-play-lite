import type { Song } from "../types/score";
import { MAX_EXPLICIT_NOTE_DURATION_MS } from "./scoreTiming";

export const DEFAULT_V1_TO_V2_OVERLAP_MS = 40;
export const DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS = 2000;
export const DEFAULT_V1_TO_V2_MAX_DURATION_MS = 2000;
export const DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS = 500;
export const MIN_V2_NOTE_DURATION_MS = 25;
export const MAX_V1_TO_V2_OVERLAP_MS = 500;

export type V1ToV2ConversionOptions = {
  name: string;
  overlapMs: number;
  restGapThresholdMs: number;
  maxDurationMs: number;
  finalGroupDurationMs: number;
};

export type V1ToV2ConversionValidationError =
  | "empty-name"
  | "invalid-overlap"
  | "invalid-rest-gap-threshold"
  | "invalid-maximum-duration"
  | "invalid-final-duration"
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
      options.restGapThresholdMs,
      MIN_V2_NOTE_DURATION_MS,
      MAX_EXPLICIT_NOTE_DURATION_MS,
    )
  ) {
    return "invalid-rest-gap-threshold";
  }

  if (
    !isFiniteNumberInRange(
      options.overlapMs,
      0,
      MAX_V1_TO_V2_OVERLAP_MS,
    )
  ) {
    return "invalid-overlap";
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

  const durationsByTime = new Map<number, number>();

  groupTimes.forEach((groupTime, groupIndex) => {
    const nextGroupTime = groupTimes[groupIndex + 1];
    const gapMs =
      nextGroupTime === undefined ? null : nextGroupTime - groupTime;

    if (gapMs !== null && gapMs > options.restGapThresholdMs) {
      return;
    }

    const rawDuration =
      gapMs === null
        ? options.finalGroupDurationMs
        : gapMs + options.overlapMs;

    durationsByTime.set(
      groupTime,
      clamp(
        Math.round(rawDuration),
        MIN_V2_NOTE_DURATION_MS,
        options.maxDurationMs,
      ),
    );
  });

  return {
    formatVersion: 2,
    name: options.name.trim(),
    bpm: sourceSong.bpm,
    bitsPerPage: sourceSong.bitsPerPage,
    pitchLevel: sourceSong.pitchLevel,
    isComposed: sourceSong.isComposed,
    songNotes: sourceSong.songNotes.map((note) => {
      const duration = durationsByTime.get(note.time);

      return duration === undefined
        ? { time: note.time, key: note.key }
        : { time: note.time, key: note.key, duration };
    }),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isFiniteNumberInRange(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
