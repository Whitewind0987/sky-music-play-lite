import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import {
  convertV1SongToV2,
  DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
  DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
  V1ToV2ConversionError,
  V1_TO_V2_RETRIGGER_SAFETY_MS,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";

const options: V1ToV2ConversionOptions = {
  name: "Test Song (V2 Long Note)",
  minimumSustainGapMs: DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
  releaseLeadMs: DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
  restGapThresholdMs: DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  maxDurationMs: DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  finalGroupDurationMs: DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
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

function convertTimes(
  times: readonly number[],
  customOptions: V1ToV2ConversionOptions = options,
) {
  return convertV1SongToV2(
    createV1Song({
      songNotes: times.map((time, index) => ({
        key: `key-${index}`,
        time,
      })),
    }),
    customOptions,
  );
}

describe("convertV1SongToV2", () => {
  it("uses the conservative bounded-window defaults", () => {
    expect({
      finalGroupDurationMs: DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
      maxDurationMs: DEFAULT_V1_TO_V2_MAX_DURATION_MS,
      minimumSustainGapMs:
        DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
      releaseLeadMs: DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
      restGapThresholdMs: DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
      retriggerSafetyMs: V1_TO_V2_RETRIGGER_SAFETY_MS,
    }).toEqual({
      finalGroupDurationMs: 500,
      maxDurationMs: 1200,
      minimumSustainGapMs: 250,
      releaseLeadMs: 30,
      restGapThresholdMs: 1200,
      retriggerSafetyMs: 10,
    });
  });

  it("validates fields and relationships in the exact required order", () => {
    const everyFieldInvalid = {
      name: " ",
      minimumSustainGapMs: Number.NaN,
      releaseLeadMs: Number.NaN,
      restGapThresholdMs: Number.NaN,
      maxDurationMs: Number.NaN,
      finalGroupDurationMs: Number.NaN,
    };
    const cases = [
      [everyFieldInvalid, "empty-name"],
      [
        { ...everyFieldInvalid, name: "Converted" },
        "invalid-minimum-sustain-gap",
      ],
      [
        {
          ...everyFieldInvalid,
          name: "Converted",
          minimumSustainGapMs: 250,
        },
        "invalid-release-lead",
      ],
      [
        {
          ...everyFieldInvalid,
          name: "Converted",
          minimumSustainGapMs: 250,
          releaseLeadMs: 30,
        },
        "invalid-rest-gap-threshold",
      ],
      [
        {
          ...everyFieldInvalid,
          name: "Converted",
          minimumSustainGapMs: 250,
          releaseLeadMs: 30,
          restGapThresholdMs: 1200,
        },
        "invalid-maximum-duration",
      ],
      [
        {
          ...everyFieldInvalid,
          name: "Converted",
          minimumSustainGapMs: 250,
          releaseLeadMs: 30,
          restGapThresholdMs: 1200,
          maxDurationMs: 1200,
        },
        "invalid-final-duration",
      ],
      [
        {
          ...options,
          minimumSustainGapMs: 1201,
        },
        "minimum-gap-exceeds-rest-threshold",
      ],
      [
        {
          ...options,
          minimumSustainGapMs: 250,
          releaseLeadMs: 226,
        },
        "minimum-gap-too-short-for-release-lead",
      ],
      [
        {
          ...options,
          finalGroupDurationMs: 1201,
        },
        "final-duration-exceeds-maximum",
      ],
    ] as const;

    cases.forEach(([candidate, expected]) => {
      expect(getV1ToV2ConversionValidationError(candidate)).toBe(
        expected,
      );
    });
  });

  it.each([
    [
      { minimumSustainGapMs: 24 },
      "invalid-minimum-sustain-gap",
    ],
    [
      { minimumSustainGapMs: 60001 },
      "invalid-minimum-sustain-gap",
    ],
    [{ releaseLeadMs: 0 }, "invalid-release-lead"],
    [{ releaseLeadMs: 501 }, "invalid-release-lead"],
    [
      { restGapThresholdMs: 24 },
      "invalid-rest-gap-threshold",
    ],
    [
      { restGapThresholdMs: 60001 },
      "invalid-rest-gap-threshold",
    ],
    [{ maxDurationMs: 24 }, "invalid-maximum-duration"],
    [{ maxDurationMs: 60001 }, "invalid-maximum-duration"],
    [{ finalGroupDurationMs: 24 }, "invalid-final-duration"],
    [{ finalGroupDurationMs: 60001 }, "invalid-final-duration"],
    [
      { minimumSustainGapMs: 1201 },
      "minimum-gap-exceeds-rest-threshold",
    ],
    [
      { minimumSustainGapMs: 250, releaseLeadMs: 226 },
      "minimum-gap-too-short-for-release-lead",
    ],
    [
      { finalGroupDurationMs: 1201 },
      "final-duration-exceeds-maximum",
    ],
  ] as const)(
    "rejects invalid option override %s",
    (override, expectedError) => {
      expect(
        getV1ToV2ConversionValidationError({
          ...options,
          ...override,
        }),
      ).toBe(expectedError);
    },
  );

  it("accepts inclusive field bounds when relationships are valid", () => {
    expect(
      getV1ToV2ConversionValidationError({
        ...options,
        minimumSustainGapMs: 26,
        releaseLeadMs: 1,
        restGapThresholdMs: 60000,
        maxDurationMs: 60000,
        finalGroupDurationMs: 25,
      }),
    ).toBeNull();
    expect(
      getV1ToV2ConversionValidationError({
        ...options,
        minimumSustainGapMs: 525,
        releaseLeadMs: 500,
        restGapThresholdMs: 525,
      }),
    ).toBeNull();
  });

  it("rejects V2 input", () => {
    expect(() =>
      convertV1SongToV2(createV1Song({ formatVersion: 2 }), options),
    ).toThrowError(new V1ToV2ConversionError("already-v2"));
  });

  it("rejects an empty score", () => {
    expect(() =>
      convertV1SongToV2(createV1Song({ songNotes: [] }), options),
    ).toThrowError(new V1ToV2ConversionError("empty-score"));
  });

  it("rejects invalid note times", () => {
    expect(() =>
      convertV1SongToV2(
        createV1Song({
          songNotes: [{ key: "bad", time: Number.NaN }],
        }),
        options,
      ),
    ).toThrowError(new V1ToV2ConversionError("invalid-note-time"));
  });

  it("omits duration below the minimum sustain gap", () => {
    expect(convertTimes([0, 249]).songNotes[0]).toEqual({
      key: "key-0",
      time: 0,
    });
  });

  it("includes both boundaries of the sustain window", () => {
    const converted = convertTimes([0, 250, 1450]);

    expect(converted.songNotes).toEqual([
      { key: "key-0", time: 0, duration: 220 },
      { key: "key-1", time: 250, duration: 1170 },
      { key: "key-2", time: 1450, duration: 500 },
    ]);
  });

  it("uses gap minus release lead inside the sustain window", () => {
    expect(convertTimes([0, 624]).songNotes[0]?.duration).toBe(594);
  });

  it("omits duration above the rest threshold", () => {
    expect(convertTimes([0, 1201]).songNotes[0]).toEqual({
      key: "key-0",
      time: 0,
    });
  });

  it("caps a generated non-final duration at the maximum", () => {
    const converted = convertTimes(
      [0, 1000],
      {
        ...options,
        maxDurationMs: 400,
        finalGroupDurationMs: 400,
      },
    );

    expect(converted.songNotes[0]?.duration).toBe(400);
  });

  it("rounds generated durations consistently", () => {
    const converted = convertTimes(
      [0.2, 312.6],
      { ...options, releaseLeadMs: 30.2 },
    );

    expect(converted.songNotes.map((note) => note.duration)).toEqual([
      282,
      500,
    ]);
  });

  it("never ends a generated non-final note at or after the next group", () => {
    const converted = convertTimes([0, 250, 562, 1186]);

    converted.songNotes.slice(0, -1).forEach((note, index) => {
      if (note.duration !== undefined) {
        expect(note.time + note.duration).toBeLessThan(
          converted.songNotes[index + 1]?.time ?? Number.NEGATIVE_INFINITY,
        );
      }
    });
  });

  it.each([
    [
      "Conservative",
      {
        minimumSustainGapMs: 400,
        releaseLeadMs: 50,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 300,
      },
    ],
    [
      "Balanced",
      {
        minimumSustainGapMs: 250,
        releaseLeadMs: 30,
        restGapThresholdMs: 1200,
        maxDurationMs: 1200,
        finalGroupDurationMs: 500,
      },
    ],
    [
      "Connected",
      {
        minimumSustainGapMs: 150,
        releaseLeadMs: 15,
        restGapThresholdMs: 2000,
        maxDurationMs: 2000,
        finalGroupDurationMs: 800,
      },
    ],
  ] as const)(
    "%s always releases eligible non-final notes before the next group",
    (_, preset) => {
      const converted = convertTimes(
        [0, preset.minimumSustainGapMs],
        { ...preset, name: "Converted" },
      );
      const firstNote = converted.songNotes[0];

      expect(firstNote?.duration).toBe(
        preset.minimumSustainGapMs - preset.releaseLeadMs,
      );
      expect((firstNote?.time ?? 0) + (firstNote?.duration ?? 0)).toBeLessThan(
        converted.songNotes[1]?.time ?? Number.NEGATIVE_INFINITY,
      );
    },
  );

  it("limits duration before a same-key retrigger", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { key: "same", time: 0 },
          { key: "same", time: 300 },
        ],
      }),
      {
        ...options,
        minimumSustainGapMs: 100,
        releaseLeadMs: 1,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
      },
    );

    expect(converted.songNotes[0]?.duration).toBe(290);
  });

  it("omits a same-key duration when retrigger safety leaves less than 25 ms", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { key: "same", time: 0 },
          { key: "same", time: 30 },
        ],
      }),
      {
        ...options,
        minimumSustainGapMs: 26,
        releaseLeadMs: 1,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
      },
    );

    expect(converted.songNotes[0]).toEqual({ key: "same", time: 0 });
  });

  it("does not shorten different keys unnecessarily", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { key: "first", time: 0 },
          { key: "different", time: 300 },
        ],
      }),
      {
        ...options,
        minimumSustainGapMs: 100,
        releaseLeadMs: 1,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
      },
    );

    expect(converted.songNotes[0]?.duration).toBe(299);
  });

  it("lets one chord note be shortened independently by retrigger safety", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { key: "repeat", time: 0 },
          { key: "other", time: 0 },
          { key: "repeat", time: 300 },
          { key: "next", time: 300 },
        ],
      }),
      {
        ...options,
        minimumSustainGapMs: 100,
        releaseLeadMs: 1,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
      },
    );

    expect(converted.songNotes.slice(0, 2)).toEqual([
      { key: "repeat", time: 0, duration: 290 },
      { key: "other", time: 0, duration: 299 },
    ]);
  });

  it("normally gives notes in one chord the same base duration", () => {
    const converted = convertV1SongToV2(createV1Song(), options);

    expect(converted.songNotes.slice(0, 2)).toEqual([
      { key: "1Key0", time: 1000, duration: 470 },
      { key: "1Key4", time: 1000, duration: 470 },
    ]);
  });

  it("uses and consistently caps the rounded final-group duration", () => {
    const converted = convertTimes(
      [0, 300],
      {
        ...options,
        finalGroupDurationMs: 500.6,
        maxDurationMs: 500.6,
      },
    );

    expect(
      converted.songNotes[converted.songNotes.length - 1]?.duration,
    ).toBe(500.6);
  });

  it("preserves metadata, output order, and source immutability", () => {
    const source = createV1Song({
      formatVersion: 1,
      songNotes: [
        { time: 1000, key: "late", duration: 9999 },
        { time: 0, key: "first" },
        { time: 500, key: "middle-a" },
        { time: 500, key: "middle-b" },
      ],
    });
    const snapshot = structuredClone(source);
    const converted = convertV1SongToV2(source, {
      ...options,
      name: "  New Name  ",
    });

    expect(converted).toMatchObject({
      bitsPerPage: source.bitsPerPage,
      bpm: source.bpm,
      formatVersion: 2,
      isComposed: source.isComposed,
      name: "New Name",
      pitchLevel: source.pitchLevel,
    });
    expect(converted.songNotes.map((note) => note.key)).toEqual([
      "late",
      "first",
      "middle-a",
      "middle-b",
    ]);
    expect(source).toEqual(snapshot);
    expect(converted).not.toBe(source);
    converted.songNotes.forEach((note, index) => {
      expect(note).not.toBe(source.songNotes[index]);
    });
  });

  it("matches the dense-score synthetic regression fixture", () => {
    const converted = convertTimes([0, 78, 234, 546, 1170, 2730]);

    expect(converted.songNotes.map((note) => note.duration)).toEqual([
      undefined,
      undefined,
      282,
      594,
      undefined,
      500,
    ]);
  });
});
