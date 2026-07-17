import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import {
  convertV1SongToV2,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
  V1ToV2ConversionError,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";

const options: V1ToV2ConversionOptions = {
  name: "Test Song (V2 Long Note)",
  overlapMs: 40,
  restGapThresholdMs: DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  maxDurationMs: 2000,
  finalGroupDurationMs: 500,
};

function createV1Song(overrides: Partial<Song> = {}): Song {
  return {
    name: "Test Song",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 2,
    isComposed: true,
    songNotes: [
      { time: 1000, key: "1Key0" },
      { time: 1000, key: "1Key4" },
      { time: 1500, key: "1Key2" },
    ],
    ...overrides,
  };
}

describe("convertV1SongToV2", () => {
  it("uses a 2000ms default rest-gap threshold", () => {
    expect(DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS).toBe(2000);
  });

  it("validates overlap before the rest-gap threshold", () => {
    const invalidOptions = {
      ...options,
      overlapMs: Number.NaN,
      restGapThresholdMs: Number.NaN,
    };

    expect(getV1ToV2ConversionValidationError(invalidOptions)).toBe(
      "invalid-overlap",
    );
    expect(
      getV1ToV2ConversionValidationError({
        ...invalidOptions,
        overlapMs: options.overlapMs,
      }),
    ).toBe("invalid-rest-gap-threshold");
  });

  it("creates V2 notes with chord, overlap, and final-group durations", () => {
    const converted = convertV1SongToV2(createV1Song(), options);

    expect(converted.formatVersion).toBe(2);
    expect(converted.songNotes).toEqual([
      { time: 1000, key: "1Key0", duration: 540 },
      { time: 1000, key: "1Key4", duration: 540 },
      { time: 1500, key: "1Key2", duration: 500 },
    ]);
  });

  it("preserves metadata, trims the new name, and does not mutate the source", () => {
    const source = createV1Song({
      formatVersion: 1,
      songNotes: [
        { time: 0, key: "1Key0", duration: 9999 },
        { time: 250, key: "1Key1" },
      ],
    });
    const snapshot = structuredClone(source);
    const converted = convertV1SongToV2(source, {
      ...options,
      name: "  New Name  ",
    });

    expect(converted).toMatchObject({
      name: "New Name",
      bpm: source.bpm,
      bitsPerPage: source.bitsPerPage,
      pitchLevel: source.pitchLevel,
      isComposed: source.isComposed,
    });
    expect(source).toEqual(snapshot);
    expect(converted).not.toBe(source);
    expect(converted.songNotes[0]).not.toBe(source.songNotes[0]);
    expect(converted.songNotes[0]?.duration).toBe(290);
  });

  it("uses sorted unique times while preserving original note order", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { time: 1000, key: "late" },
          { time: 0, key: "first" },
          { time: 500, key: "middle-a" },
          { time: 500, key: "middle-b" },
        ],
      }),
      options,
    );

    expect(converted.songNotes.map((note) => note.key)).toEqual([
      "late",
      "first",
      "middle-a",
      "middle-b",
    ]);
    expect(converted.songNotes.map((note) => note.duration)).toEqual([
      500,
      540,
      540,
      540,
    ]);
  });

  it("caps long groups and applies the 25ms minimum", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { time: 0, key: "long" },
          { time: 5000, key: "short" },
          { time: 5000.4, key: "final" },
        ],
      }),
      {
        ...options,
        overlapMs: 0,
        restGapThresholdMs: 60000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 25,
      },
    );

    expect(converted.songNotes.map((note) => note.duration)).toEqual([
      1000,
      25,
      25,
    ]);
  });

  it("rounds generated durations consistently", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { time: 0.2, key: "a" },
          { time: 100.7, key: "b" },
        ],
      }),
      { ...options, overlapMs: 40.2, finalGroupDurationMs: 500.6 },
    );

    expect(converted.songNotes.map((note) => note.duration)).toEqual([141, 501]);
  });

  it("sustains gaps below or equal to the threshold and omits duration above it", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { time: 0, key: "below" },
          { time: 499, key: "equal" },
          { time: 999, key: "rest" },
          { time: 1500, key: "final" },
        ],
      }),
      { ...options, restGapThresholdMs: 500 },
    );

    expect(converted.songNotes).toEqual([
      { time: 0, key: "below", duration: 539 },
      { time: 499, key: "equal", duration: 540 },
      { time: 999, key: "rest" },
      { time: 1500, key: "final", duration: 500 },
    ]);
  });

  it("omits duration from every note in a rest-classified chord", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { time: 0, key: "rest-a" },
          { time: 0, key: "rest-b" },
          { time: 3000, key: "final" },
        ],
      }),
      options,
    );

    expect(converted.songNotes).toEqual([
      { time: 0, key: "rest-a" },
      { time: 0, key: "rest-b" },
      { time: 3000, key: "final", duration: 500 },
    ]);
  });

  it("keeps the source immutable when a converted group omits duration", () => {
    const source = createV1Song({
      songNotes: [
        { time: 0, key: "rest", duration: 9999 },
        { time: 4000, key: "final" },
      ],
    });
    const snapshot = structuredClone(source);

    const converted = convertV1SongToV2(source, options);

    expect(source).toEqual(snapshot);
    expect(converted.songNotes[0]).toEqual({ time: 0, key: "rest" });
    expect(converted.songNotes[0]).not.toBe(source.songNotes[0]);
  });

  it("rejects V2 input and scores without valid notes", () => {
    expect(() =>
      convertV1SongToV2(createV1Song({ formatVersion: 2 }), options),
    ).toThrowError(new V1ToV2ConversionError("already-v2"));
    expect(() =>
      convertV1SongToV2(createV1Song({ songNotes: [] }), options),
    ).toThrowError(new V1ToV2ConversionError("empty-score"));
    expect(() =>
      convertV1SongToV2(
        createV1Song({ songNotes: [{ key: "bad", time: Number.NaN }] }),
        options,
      ),
    ).toThrowError(new V1ToV2ConversionError("invalid-note-time"));
  });

  it.each([
    [{ ...options, name: " " }, "empty-name"],
    [{ ...options, overlapMs: Number.NaN }, "invalid-overlap"],
    [{ ...options, overlapMs: 501 }, "invalid-overlap"],
    [
      { ...options, restGapThresholdMs: Number.NaN },
      "invalid-rest-gap-threshold",
    ],
    [{ ...options, restGapThresholdMs: 24 }, "invalid-rest-gap-threshold"],
    [{ ...options, restGapThresholdMs: 60001 }, "invalid-rest-gap-threshold"],
    [{ ...options, maxDurationMs: 24 }, "invalid-maximum-duration"],
    [{ ...options, maxDurationMs: 60001 }, "invalid-maximum-duration"],
    [{ ...options, finalGroupDurationMs: 24 }, "invalid-final-duration"],
    [
      { ...options, maxDurationMs: 400, finalGroupDurationMs: 500 },
      "final-duration-exceeds-maximum",
    ],
  ] as const)("rejects invalid options with %s", (invalidOptions, errorCode) => {
    expect(() =>
      convertV1SongToV2(createV1Song(), invalidOptions),
    ).toThrowError(new V1ToV2ConversionError(errorCode));
  });
});
