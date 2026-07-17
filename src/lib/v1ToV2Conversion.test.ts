import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import {
  analyzeV1ToV2ScoreProfile,
  convertV1SongToV2,
  DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
  DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
  previewV1ToV2Conversion,
  V1ToV2ConversionError,
  V1_TO_V2_DENSE_TYPICAL_GAP_MS,
  V1_TO_V2_POLYPHONIC_GROUP_RATIO,
  V1_TO_V2_PROTECTED_MINIMUM_GAP_MS,
  V1_TO_V2_RETRIGGER_SAFETY_MS,
  V1_TO_V2_TYPICAL_GAP_MULTIPLIER,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";

const options: V1ToV2ConversionOptions = {
  allowChordSustainInProtectedMode: false,
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

function createGroupedSong(
  groups: readonly {
    keys?: readonly string[];
    time: number;
  }[],
): Song {
  return createV1Song({
    songNotes: groups.flatMap(({ keys = ["1Key0"], time }) =>
      keys.map((key) => ({ key, time })),
    ),
  });
}

describe("analyzeV1ToV2ScoreProfile", () => {
  it("uses the median for an odd number of positive gaps", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { time: 0 },
        { time: 100 },
        { time: 400 },
        { time: 900 },
      ]),
      options,
    );

    expect(profile.typicalGapMs).toBe(300);
  });

  it("averages the middle pair for an even number of positive gaps", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { time: 0 },
        { time: 100 },
        { time: 400 },
      ]),
      options,
    );

    expect(profile.typicalGapMs).toBe(200);
  });

  it("reports null when no positive adjacent gap exists", () => {
    expect(
      analyzeV1ToV2ScoreProfile(
        createGroupedSong([{ time: 0 }]),
        options,
      ).typicalGapMs,
    ).toBeNull();
  });

  it("uses a zero polyphonic ratio for an empty group collection", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createV1Song({ songNotes: [] }),
      options,
    );

    expect(profile).toMatchObject({
      multiNoteGroupRatio: 0,
      typicalGapMs: null,
    });
  });

  it("does not treat duplicate raw keys mapping to one playback key as a chord", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { keys: ["1Key0", "2Key0"], time: 0 },
      ]),
      options,
    );

    expect(profile.multiNoteGroupRatio).toBe(0);
    expect(profile.isPolyphonic).toBe(false);
  });

  it("treats two different normalized playback keys as a chord", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { keys: ["1Key0", "2Key1"], time: 0 },
      ]),
      options,
    );

    expect(profile.multiNoteGroupRatio).toBe(1);
    expect(profile.isPolyphonic).toBe(true);
  });

  it("classifies exactly the dense timing boundary as dense", () => {
    expect(V1_TO_V2_DENSE_TYPICAL_GAP_MS).toBe(250);
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([{ time: 0 }, { time: 250 }]),
      options,
    );

    expect(profile).toMatchObject({
      isDenseTiming: true,
      mode: "protected",
      typicalGapMs: 250,
    });
  });

  it("does not classify a gap above 250 ms as dense by itself", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([{ time: 0 }, { time: 251 }]),
      options,
    );

    expect(profile).toMatchObject({
      isDenseTiming: false,
      isPolyphonic: false,
      mode: "standard",
    });
  });

  it("classifies exactly a 0.35 chord-group ratio as polyphonic", () => {
    expect(V1_TO_V2_POLYPHONIC_GROUP_RATIO).toBe(0.35);
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong(
        Array.from({ length: 20 }, (_, index) => ({
          keys: index < 7 ? ["1Key0", "1Key1"] : ["1Key0"],
          time: index * 1000,
        })),
      ),
      options,
    );

    expect(profile.multiNoteGroupRatio).toBe(0.35);
    expect(profile.isPolyphonic).toBe(true);
    expect(profile.mode).toBe("protected");
  });

  it("keeps a ratio below 0.35 standard when timing is sparse", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong(
        Array.from({ length: 20 }, (_, index) => ({
          keys: index < 6 ? ["1Key0", "1Key1"] : ["1Key0"],
          time: index * 1000,
        })),
      ),
      options,
    );

    expect(profile.multiNoteGroupRatio).toBe(0.3);
    expect(profile).toMatchObject({
      isDenseTiming: false,
      isPolyphonic: false,
      mode: "standard",
    });
  });

  it("selects protected mode from dense timing alone", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { time: 0 },
        { time: 156 },
        { time: 312 },
      ]),
      options,
    );

    expect(profile).toMatchObject({
      isDenseTiming: true,
      isPolyphonic: false,
      mode: "protected",
    });
  });

  it("selects protected mode from polyphonic structure alone", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { keys: ["1Key0", "1Key1"], time: 0 },
        { time: 1000 },
      ]),
      options,
    );

    expect(profile).toMatchObject({
      isDenseTiming: false,
      isPolyphonic: true,
      mode: "protected",
    });
  });

  it("selects standard mode for a sparse monophonic score", () => {
    const profile = analyzeV1ToV2ScoreProfile(
      createGroupedSong([
        { time: 0 },
        { time: 600 },
        { time: 1200 },
      ]),
      options,
    );

    expect(profile).toMatchObject({
      isDenseTiming: false,
      isPolyphonic: false,
      mode: "standard",
    });
  });

  it("uses the configured minimum in standard mode", () => {
    expect(
      analyzeV1ToV2ScoreProfile(
        createGroupedSong([{ time: 0 }, { time: 600 }]),
        { ...options, minimumSustainGapMs: 321 },
      ).effectiveMinimumSustainGapMs,
    ).toBe(321);
  });

  it("uses at least the protected 500 ms minimum", () => {
    expect(V1_TO_V2_PROTECTED_MINIMUM_GAP_MS).toBe(500);
    expect(
      analyzeV1ToV2ScoreProfile(
        createGroupedSong([{ time: 0 }, { time: 156 }]),
        options,
      ).effectiveMinimumSustainGapMs,
    ).toBe(500);
  });

  it("uses typical gap times three when that is larger", () => {
    expect(V1_TO_V2_TYPICAL_GAP_MULTIPLIER).toBe(3);
    expect(
      analyzeV1ToV2ScoreProfile(
        createGroupedSong([{ time: 0 }, { time: 250 }]),
        options,
      ).effectiveMinimumSustainGapMs,
    ).toBe(750);
  });

  it("allows the adaptive minimum to exceed the valid rest threshold", () => {
    const customOptions = {
      ...options,
      restGapThresholdMs: 600,
    };

    expect(getV1ToV2ConversionValidationError(customOptions)).toBeNull();
    expect(
      analyzeV1ToV2ScoreProfile(
        createGroupedSong([{ time: 0 }, { time: 250 }]),
        customOptions,
      ).effectiveMinimumSustainGapMs,
    ).toBe(750);
  });
});

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
      allowChordSustainInProtectedMode: false,
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
        allowChordSustainInProtectedMode: false,
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
        allowChordSustainInProtectedMode: false,
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
        allowChordSustainInProtectedMode: false,
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
      const standardGapMs = 600;
      const converted = convertTimes(
        [0, standardGapMs],
        { ...preset, name: "Converted" },
      );
      const firstNote = converted.songNotes[0];

      expect(firstNote?.duration).toBe(
        standardGapMs - preset.releaseLeadMs,
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
          { key: "repeat", time: 600 },
          { key: "third", time: 1200 },
          { key: "final", time: 1800 },
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
      { key: "repeat", time: 0, duration: 590 },
      { key: "other", time: 0, duration: 599 },
    ]);
  });

  it("normally gives notes in one chord the same base duration", () => {
    const converted = convertV1SongToV2(
      createV1Song({
        songNotes: [
          { key: "1Key0", time: 0 },
          { key: "1Key4", time: 0 },
          { key: "1Key2", time: 600 },
          { key: "1Key3", time: 1200 },
          { key: "1Key5", time: 1800 },
        ],
      }),
      options,
    );

    expect(converted.songNotes.slice(0, 2)).toEqual([
      { key: "1Key0", time: 0, duration: 570 },
      { key: "1Key4", time: 0, duration: 570 },
    ]);
  });

  it("keeps eligible chords sustained in standard mode", () => {
    const source = createGroupedSong([
      { keys: ["1Key0", "1Key1"], time: 0 },
      { time: 600 },
      { time: 1200 },
      { time: 1800 },
    ]);
    const converted = convertV1SongToV2(source, options);

    expect(
      converted.songNotes.slice(0, 2).map((note) => note.duration),
    ).toEqual([570, 570]);
  });

  it("filters an eligible protected-mode chord by default", () => {
    const source = createGroupedSong([
      { keys: ["1Key0", "1Key1"], time: 0 },
      { time: 600 },
      { time: 756 },
      { time: 912 },
      { time: 1068 },
    ]);

    expect(
      analyzeV1ToV2ScoreProfile(source, options).mode,
    ).toBe("protected");
    expect(
      convertV1SongToV2(source, options).songNotes.slice(0, 2),
    ).toEqual([
      { key: "1Key0", time: 0 },
      { key: "1Key1", time: 0 },
    ]);
  });

  it("allows an eligible protected-mode chord when explicitly enabled", () => {
    const source = createGroupedSong([
      { keys: ["1Key0", "1Key1"], time: 0 },
      { time: 600 },
      { time: 756 },
      { time: 912 },
      { time: 1068 },
    ]);
    const converted = convertV1SongToV2(source, {
      ...options,
      allowChordSustainInProtectedMode: true,
    });

    expect(
      converted.songNotes.slice(0, 2).map((note) => note.duration),
    ).toEqual([570, 570]);
  });

  it("filters a protected-mode final chord by default", () => {
    const source = createGroupedSong([
      { time: 0 },
      { time: 156 },
      { time: 312 },
      { keys: ["1Key0", "1Key1"], time: 468 },
    ]);
    const converted = convertV1SongToV2(source, options);

    expect(converted.songNotes.slice(-2)).toEqual([
      { key: "1Key0", time: 468 },
      { key: "1Key1", time: 468 },
    ]);
  });

  it("allows a protected-mode final chord when explicitly enabled", () => {
    const source = createGroupedSong([
      { time: 0 },
      { time: 156 },
      { time: 312 },
      { keys: ["1Key0", "1Key1"], time: 468 },
    ]);
    const converted = convertV1SongToV2(source, {
      ...options,
      allowChordSustainInProtectedMode: true,
    });

    expect(
      converted.songNotes.slice(-2).map((note) => note.duration),
    ).toEqual([500, 500]);
  });

  it("allows a single-note final group in protected mode", () => {
    const source = createGroupedSong([
      { time: 0 },
      { time: 156 },
      { time: 312 },
      { time: 468 },
    ]);

    expect(
      convertV1SongToV2(source, options).songNotes.slice(-1)[0]
        ?.duration,
    ).toBe(500);
  });

  it("uses normalized playback keys for same-key retrigger safety", () => {
    const source = createGroupedSong([
      { keys: ["1Key0"], time: 0 },
      { keys: ["2Key0"], time: 300 },
    ]);
    const customOptions = {
      ...options,
      minimumSustainGapMs: 100,
      releaseLeadMs: 1,
      restGapThresholdMs: 1000,
      maxDurationMs: 1000,
    };
    const converted = convertV1SongToV2(source, customOptions);

    expect(converted.songNotes[0]).toEqual({
      duration: 290,
      key: "1Key0",
      time: 0,
    });
    expect(converted.songNotes[1]?.key).toBe("2Key0");
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

  it("matches the protected dense-score synthetic regression fixture", () => {
    const source = createGroupedSong([
      { keys: ["1Key0", "1Key1"], time: 0 },
      { keys: ["1Key2", "1Key3"], time: 78 },
      { keys: ["1Key4", "1Key5"], time: 234 },
      { keys: ["1Key6", "1Key7"], time: 390 },
      { keys: ["1Key8", "1Key9"], time: 546 },
      { keys: ["1Key10", "1Key11"], time: 702 },
      { time: 858 },
      { time: 1170 },
      { keys: ["1Key0", "1Key1"], time: 1794 },
      { keys: ["1Key2", "1Key3"], time: 3354 },
    ]);
    const preview = previewV1ToV2Conversion(source, options);
    const converted = convertV1SongToV2(source, options);

    expect(preview.profile).toMatchObject({
      effectiveMinimumSustainGapMs: 500,
      mode: "protected",
      typicalGapMs: 156,
    });
    expect(converted.songNotes.find((note) => note.time === 858)?.duration)
      .toBeUndefined();
    expect(converted.songNotes.find((note) => note.time === 1170)?.duration)
      .toBe(594);
    expect(converted.songNotes.find((note) => note.time === 1794)?.duration)
      .toBeUndefined();
    expect(preview.generatedSustainCount).toBe(1);
  });

  it("keeps an eligible 624 ms protected chord as taps by default", () => {
    const source = createGroupedSong([
      { time: 0 },
      { time: 156 },
      { time: 312 },
      { keys: ["1Key0", "1Key1"], time: 468 },
      { time: 1092 },
      { time: 1248 },
    ]);
    const converted = convertV1SongToV2(source, options);

    expect(
      converted.songNotes.filter((note) => note.time === 468),
    ).toEqual([
      { key: "1Key0", time: 468 },
      { key: "1Key1", time: 468 },
    ]);
  });

  it("counts generated normalized playback events and shares decisions with preview", () => {
    const source = createGroupedSong([
      { keys: ["1Key0", "2Key0"], time: 0 },
      { keys: ["1Key1"], time: 600 },
      { keys: ["1Key2"], time: 1200 },
      { keys: ["1Key3"], time: 1800 },
    ]);
    const snapshot = structuredClone(source);
    const preview = previewV1ToV2Conversion(source, options);
    const converted = convertV1SongToV2(source, options);
    const durationNoteCount = converted.songNotes.filter(
      (note) => note.duration !== undefined,
    ).length;

    expect(durationNoteCount).toBe(5);
    expect(preview.generatedSustainCount).toBe(4);
    expect(
      converted.songNotes.map((note) => note.duration !== undefined),
    ).toEqual([true, true, true, true, true]);
    expect(source).toEqual(snapshot);
  });
});
