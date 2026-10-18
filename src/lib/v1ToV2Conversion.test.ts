// SPDX-FileCopyrightText: 2026 Whitewind0987
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { getPreviewKeyName } from "../types/keyMapping";
import type { Song } from "../types/score";
import {
  analyzeV1ToV2ScoreProfile,
  convertV1SongToV2,
  getV1ToV2ConversionValidationError,
  MIN_V2_NOTE_DURATION_MS,
  previewV1ToV2Conversion,
  V1_TO_V2_RETRIGGER_SAFETY_MS,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";
import { V1_TO_V2_SUSTAIN_STYLE_PRESETS } from "./v1ToV2UpgradePreferences";

const balanced: V1ToV2ConversionOptions = {
  name: "Converted",
  minimumSustainGapMs: 250,
  releaseLeadMs: 30,
  restGapThresholdMs: 1200,
  maxDurationMs: 1200,
  finalGroupDurationMs: 500,
};

// Numeric-only options keep the pre-existing direct-caller regression coverage.
const styles = {
  conservative: {
    name: "Converted",
    ...V1_TO_V2_SUSTAIN_STYLE_PRESETS.conservative,
  },
  balanced,
  connected: {
    name: "Converted",
    ...V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
  },
  custom: {
    name: "Custom",
    minimumSustainGapMs: 200,
    releaseLeadMs: 40,
    restGapThresholdMs: 1600,
    maxDurationMs: 3500,
    finalGroupDurationMs: 450,
  },
} satisfies Record<string, V1ToV2ConversionOptions>;

const explicitlyConnected: V1ToV2ConversionOptions = {
  ...styles.connected,
  selectedStyle: "connected",
};

function song(
  songNotes: Song["songNotes"] = [
    { time: 0, key: "1Key0" },
    { time: 500, key: "1Key1" },
  ],
): Song {
  return {
    formatVersion: 1,
    name: "Source",
    bpm: 123,
    bitsPerPage: 9,
    pitchLevel: 2,
    isComposed: true,
    songNotes,
  };
}

function songAtTimes(times: number[]): Song {
  return song(
    times.map((time, index) => ({ time, key: `1Key${index % 15}` })),
  );
}

function songWithGaps(gaps: number[]): Song {
  const times = [0];
  gaps.forEach((gap) => times.push(times[times.length - 1] + gap));
  return songAtTimes(times);
}

const denseFixture = song([
  { time: 0, key: "1Key0" },
  { time: 160, key: "1Key1" },
  { time: 420, key: "1Key2" },
  { time: 840, key: "1Key3" },
  { time: 1000, key: "1Key4" },
]);

describe("normal V1 to V2 conversion", () => {
  it("preserves the existing score profile metadata", () => {
    expect(analyzeV1ToV2ScoreProfile(denseFixture)).toEqual({
      typicalGapMs: 210,
      multiNoteGroupRatio: 0,
      isDenseTiming: true,
      isPolyphonic: false,
    });
  });

  it("uses exact visible style values and yields distinct dense counts", () => {
    expect(
      [styles.conservative, styles.balanced, styles.connected].map(
        (options) =>
          previewV1ToV2Conversion(denseFixture, options)
            .generatedSustainCount,
      ),
    ).toEqual([2, 3, 5]);
  });

  it("uses one duration plan for preview and final conversion", () => {
    const preview = previewV1ToV2Conversion(denseFixture, balanced);
    const converted = convertV1SongToV2(denseFixture, balanced);

    expect(
      converted.songNotes.filter((note) => note.duration !== undefined)
        .length,
    ).toBe(preview.generatedSustainCount);
  });

  it("preserves note order, times, raw keys, metadata, and source immutability", () => {
    const source = song([
      { time: 600, key: "2Key0", duration: 999 },
      { time: 0, key: "1Key12" },
      { time: 300, key: "odd-key" },
    ]);
    const snapshot = structuredClone(source);
    const converted = convertV1SongToV2(source, balanced);

    expect(converted).toMatchObject({
      formatVersion: 2,
      name: "Converted",
      bpm: 123,
      bitsPerPage: 9,
      pitchLevel: 2,
      isComposed: true,
    });
    expect(converted.songNotes.map(({ time, key }) => ({ time, key }))).toEqual(
      source.songNotes.map(({ time, key }) => ({ time, key })),
    );
    expect(source).toEqual(snapshot);
  });

  it("keeps the minimum gap and bounds a probable rest before the next group", () => {
    const converted = convertV1SongToV2(
      song([
        { time: 0, key: "Key0" },
        { time: 249, key: "Key1" },
        { time: 500, key: "Key2" },
        { time: 1701, key: "Key3" },
      ]),
      balanced,
    );

    expect(converted.songNotes.slice(0, 2)).toEqual([
      { time: 0, key: "Key0" },
      { time: 249, key: "Key1", duration: 221 },
    ]);
    expect(converted.songNotes[2]?.duration)
      .toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
    expect(converted.songNotes[2]?.duration).toBeLessThan(600);
    expect(converted.songNotes[3]).toEqual({
      time: 1701, key: "Key3", duration: 500,
    });
    expect(
      (converted.songNotes[1]?.time ?? 0) +
        (converted.songNotes[1]?.duration ?? 0),
    ).toBeLessThan(converted.songNotes[2]?.time ?? 0);
  });

  it("normalizes raw key prefixes for same-key retrigger safety", () => {
    const converted = convertV1SongToV2(
      song([
        { time: 0, key: "1Key0" },
        { time: 500, key: "2Key0" },
      ]),
      {
        ...balanced,
        minimumSustainGapMs: 26,
        releaseLeadMs: 1,
      },
    );

    expect(converted.songNotes[0]).toEqual({
      time: 0,
      key: "1Key0",
      duration: 490,
    });
    expect(converted.songNotes[1]?.key).toBe("2Key0");
  });

  it("preserves every chord note instead of filtering dense groups", () => {
    const converted = convertV1SongToV2(
      song([
        { time: 0, key: "Key0" },
        { time: 0, key: "Key4" },
        { time: 500, key: "Key8" },
      ]),
      balanced,
    );

    expect(converted.songNotes).toHaveLength(3);
    expect(converted.songNotes.slice(0, 2).every((note) => note.duration === 470))
      .toBe(true);
  });

  it("keeps validation ranges and ordering", () => {
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        name: "",
        minimumSustainGapMs: 0,
      }),
    ).toBe("empty-name");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        minimumSustainGapMs: 24,
      }),
    ).toBe("invalid-minimum-sustain-gap");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        releaseLeadMs: 501,
      }),
    ).toBe("invalid-release-lead");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        restGapThresholdMs: 24,
      }),
    ).toBe("invalid-rest-gap-threshold");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        maxDurationMs: 60001,
      }),
    ).toBe("invalid-maximum-duration");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        finalGroupDurationMs: 60001,
      }),
    ).toBe("invalid-final-duration");
    expect(
      getV1ToV2ConversionValidationError({
        ...balanced,
        minimumSustainGapMs: 1300,
      }),
    ).toBe("minimum-gap-exceeds-rest-threshold");
  });
});

describe("adaptive V1 to V2 sustain timing", () => {
  const fastWithRest = songAtTimes([0, 300, 600, 900, 3400, 3700]);
  const naturallySlow = songAtTimes([0, 1800, 3800, 6100, 8600, 10800]);

  it.each(Object.entries(styles))(
    "%s distinguishes a fast passage's rest from naturally slow intervals",
    (_, options) => {
      const fast = convertV1SongToV2(fastWithRest, options);
      const slow = convertV1SongToV2(naturallySlow, options);
      const beforeRest = fast.songNotes[3]?.duration ?? 0;

      expect(beforeRest).toBeGreaterThan(300);
      expect(beforeRest).toBeLessThan(2500 / 2);
      slow.songNotes.slice(0, -1).forEach((note) => {
        expect(note.duration).toBeGreaterThan(beforeRest);
        expect(note.duration).toBeLessThanOrEqual(options.maxDurationMs);
      });
      expect(slow.songNotes[slow.songNotes.length - 1]?.duration)
        .toBe(options.finalGroupDurationMs);
    },
  );

  it.each(Object.entries(styles))(
    "%s has continuous explicit holds across its configured rest threshold",
    (_, options) => {
      const threshold = options.restGapThresholdMs;
      const durations = [-1, 0, 1].map((offset) =>
        convertV1SongToV2(
          songWithGaps([
            threshold, threshold, threshold + offset, threshold, threshold,
          ]),
          options,
        ).songNotes[2]?.duration ?? 0,
      );

      durations.forEach((duration) => expect(duration).toBeGreaterThan(500));
      expect(Math.max(...durations) - Math.min(...durations))
        .toBeLessThanOrEqual(2);
    },
  );

  it.each([300, 1800])(
    "keeps threshold continuity in a passage with %ims surrounding intervals",
    (normalGap) => {
      const options = {
        ...balanced, restGapThresholdMs: 2000, maxDurationMs: 5000,
      };
      const durations = [1999, 2001].map((gap) =>
        convertV1SongToV2(
          songWithGaps([normalGap, normalGap, gap, normalGap, normalGap]),
          options,
        ).songNotes[2]?.duration ?? 0,
      );

      expect(durations[0]).toBeGreaterThan(normalGap);
      expect(durations[1]).toBeGreaterThanOrEqual(durations[0]);
      expect(durations[1] - durations[0]).toBeLessThanOrEqual(2);
      expect(durations[1]).toBeLessThan(normalGap === 300 ? 1000 : 2001);
    },
  );

  it("allows a longer interval consistent with the surrounding passage", () => {
    const converted = convertV1SongToV2(
      songWithGaps([600, 600, 900, 600, 600]),
      styles.custom,
    );
    expect(converted.songNotes[2]?.duration)
      .toBe(900 - styles.custom.releaseLeadMs);
    expect(converted.songNotes[2]?.duration)
      .toBeGreaterThan(converted.songNotes[0]?.duration ?? 0);
  });

  it("uses local timing in a slow section even when the global median is fast", () => {
    const source = songWithGaps([
      ...Array<number>(30).fill(300),
      ...Array<number>(8).fill(2400),
    ]);
    const converted = convertV1SongToV2(source, styles.custom);

    expect(analyzeV1ToV2ScoreProfile(source).typicalGapMs).toBe(300);
    expect(converted.songNotes[10]?.duration)
      .toBe(300 - styles.custom.releaseLeadMs);
    expect(converted.songNotes[34]?.duration).toBeGreaterThan(2000);
    expect(converted.songNotes[34]?.duration)
      .toBeLessThanOrEqual(2400 - styles.custom.releaseLeadMs);
  });

  it("keeps a fast section's rest bounded even when the global median is slow", () => {
    const source = songWithGaps([
      ...Array<number>(8).fill(300),
      2500,
      ...Array<number>(8).fill(300),
      ...Array<number>(40).fill(2400),
    ]);
    const converted = convertV1SongToV2(source, styles.custom);

    expect(analyzeV1ToV2ScoreProfile(source).typicalGapMs).toBe(2400);
    expect(converted.songNotes[8]?.duration).toBeGreaterThan(300);
    expect(converted.songNotes[8]?.duration).toBeLessThan(1000);
  });

  it("uses the global profile as a bounded timing reference", () => {
    const nearbyGaps = [300, 300, 300, 2500, 300, 300, 300];
    const fast = convertV1SongToV2(
      songWithGaps([...nearbyGaps, ...Array<number>(20).fill(300)]),
      styles.custom,
    );
    const slow = convertV1SongToV2(
      songWithGaps([...nearbyGaps, ...Array<number>(20).fill(2400)]),
      styles.custom,
    );

    expect(slow.songNotes[3]?.duration)
      .toBeGreaterThan(fast.songNotes[3]?.duration ?? 0);
    expect(slow.songNotes[3]?.duration).toBeLessThan(1000);
  });

  it("does not let an isolated rest's length distort its own timing estimate", () => {
    const durations = [2500, 25000].map((gap) =>
      convertV1SongToV2(
        songWithGaps([300, 300, 300, gap, 300, 300, 300]),
        styles.custom,
      ).songNotes[3]?.duration,
    );
    expect(durations[0]).toBeGreaterThan(300);
    expect(durations[1]).toBe(durations[0]);
  });

  it("bounds consecutive outlier gaps but sustains a consistently slow passage", () => {
    const source = songWithGaps([
      300, 300, 300, 2500, 2500, 300, 300, 300,
    ]);
    const converted = convertV1SongToV2(source, styles.connected);
    [3, 4].forEach((index) => {
      expect(converted.songNotes[index]?.duration).toBeGreaterThan(300);
      expect(converted.songNotes[index]?.duration).toBeLessThan(1000);
    });
    const slow = convertV1SongToV2(
      songWithGaps([2500, 2500, 2500, 2500]), styles.connected,
    );
    slow.songNotes.slice(0, -1)
      .forEach((note) => expect(note.duration).toBe(2000));
  });

  it.each([
    { times: [0] },
    { times: [0, 10000] },
    { times: [0, 300, 10300] },
  ])(
    "uses a deterministic conservative fallback with insufficient context: $times",
    ({ times }) => {
      const source = songAtTimes(times);
      const converted = convertV1SongToV2(source, balanced);
      expect(convertV1SongToV2(source, balanced)).toEqual(converted);
      converted.songNotes.slice(0, -1).forEach((note, index) => {
        expect(note.duration).toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
        expect(note.duration).toBeLessThanOrEqual(
          balanced.restGapThresholdMs - balanced.releaseLeadMs,
        );
        expect(note.duration).toBeLessThanOrEqual(
          times[index + 1] - note.time - balanced.releaseLeadMs,
        );
      });
      expect(converted.songNotes[converted.songNotes.length - 1]?.duration)
        .toBe(balanced.finalGroupDurationMs);
    },
  );

  it("keeps the rest reference meaningful with otherwise identical Custom values", () => {
    const source = songWithGaps([1000, 1000, 5000, 1000, 1000]);
    const durations = [500, 1500].map((restGapThresholdMs) =>
      convertV1SongToV2(source, { ...styles.custom, restGapThresholdMs })
        .songNotes[2]?.duration ?? 0,
    );
    expect(durations[0]).toBeGreaterThan(500);
    expect(durations[1]).toBeGreaterThan(durations[0]);
    expect(durations[1]).toBeLessThan(2500);
  });

  it("keeps Conservative, Balanced, and Connected sustains meaningfully ordered", () => {
    const durations = [styles.conservative, styles.balanced, styles.connected]
      .map((options) =>
        convertV1SongToV2(fastWithRest, options).songNotes[3]?.duration ?? 0,
      );
    expect(durations[0]).toBeGreaterThan(300);
    expect(durations[0]).toBeLessThan(durations[1]);
    expect(durations[1]).toBeLessThan(durations[2]);
  });

  it.each([25, 700, 700.5, 60000])(
    "respects an explicit maximum of %ims",
    (maxDurationMs) => {
      const converted = convertV1SongToV2(naturallySlow, {
        ...styles.custom,
        maxDurationMs,
        finalGroupDurationMs: MIN_V2_NOTE_DURATION_MS,
      });
      converted.songNotes.forEach((note) => {
        expect(Number.isFinite(note.duration)).toBe(true);
        expect(note.duration).toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
        expect(note.duration).toBeLessThanOrEqual(maxDurationMs);
      });
    },
  );

  it("preserves the minimum sustain gap even with a slow timing profile", () => {
    const source = songWithGaps([249, 250, 2400, 2400, 2400, 2400]);
    const converted = convertV1SongToV2(source, balanced);
    expect(converted.songNotes[0]?.duration).toBeUndefined();
    expect(converted.songNotes[1]?.duration).toBe(250 - balanced.releaseLeadMs);
  });

  it("honors release lead and the minimum duration at their valid boundary", () => {
    const options = {
      ...balanced, minimumSustainGapMs: 55, releaseLeadMs: 30,
    };
    const converted = convertV1SongToV2(songAtTimes([0, 54, 109]), options);
    expect(converted.songNotes).toEqual([
      { time: 0, key: "1Key0" },
      { time: 54, key: "1Key1", duration: MIN_V2_NOTE_DURATION_MS },
      { time: 109, key: "1Key2", duration: 500 },
    ]);
    expect(getV1ToV2ConversionValidationError({
      ...options, minimumSustainGapMs: 54,
    })).toBe("minimum-gap-too-short-for-release-lead");
    expect(getV1ToV2ConversionValidationError({
      ...options, maxDurationMs: 499,
    })).toBe("final-duration-exceeds-maximum");
  });

  it.each(["1Key0", "1Key1"])(
    "preserves fractional release and retrigger margins before %s",
    (nextKey) => {
      const source = song([
        { time: 0, key: "2Key0" }, { time: 500.8, key: nextKey },
      ]);
      const duration = convertV1SongToV2(source, {
        ...balanced, minimumSustainGapMs: 27, releaseLeadMs: 1.1,
      }).songNotes[0]?.duration ?? 0;
      expect(duration).toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
      expect(duration).toBeLessThanOrEqual(500.8 - 1.1);
      if (nextKey === "1Key0") {
        expect(duration)
          .toBeLessThanOrEqual(500.8 - V1_TO_V2_RETRIGGER_SAFETY_MS);
      }
    },
  );

  it("omits unsafe repeated-key holds instead of violating minimum duration", () => {
    const converted = convertV1SongToV2(
      song([{ time: 0, key: "1Key0" }, { time: 30, key: "2Key0" }]),
      { ...balanced, minimumSustainGapMs: 26, releaseLeadMs: 1 },
    );
    expect(converted.songNotes[0]?.duration).toBeUndefined();
    expect(converted.songNotes[1]?.duration).toBe(500);
  });

  it.each(Object.entries(styles))(
    "%s keeps every generated hold within release and duration limits",
    (_, options) => {
      const converted = convertV1SongToV2(songWithGaps([
        80, 400.8, 2500, 300, 2500, 2500, 26.4, 60000, 300, 300, 300,
      ]), options);

      converted.songNotes.forEach((note, index) => {
        if (note.duration === undefined) {
          return;
        }
        expect(Number.isFinite(note.duration)).toBe(true);
        expect(note.duration).toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
        expect(note.duration).toBeLessThanOrEqual(options.maxDurationMs);
        const nextNote = converted.songNotes[index + 1];
        if (nextNote !== undefined) {
          expect(note.duration).toBeLessThanOrEqual(
            nextNote.time - note.time - options.releaseLeadMs,
          );
        }
      });
    },
  );

  it.each(Object.entries(styles))(
    "%s shares the preview plan and preserves chords, metadata, and the source",
    (_, options) => {
      const source = song([
        { time: 900, key: "1Key4" },
        { time: 0, key: "1Key0" },
        { time: 300, key: "1Key1" },
        { time: 900, key: "2Key4" },
        { time: 600, key: "1Key2" },
        { time: 900, key: "1Key8" },
        { time: 3400, key: "1Key4" },
        { time: 3700, key: "1Key10" },
        { time: 3700, key: "1Key12" },
      ]);
      const snapshot = structuredClone(source);
      const converted = convertV1SongToV2(source, options);
      const sustainedKeys = new Set(
        converted.songNotes
          .filter((note) => note.duration !== undefined)
          .map((note) => `${note.time}:${getPreviewKeyName(note.key)}`),
      );
      expect(previewV1ToV2Conversion(source, options).generatedSustainCount)
        .toBe(sustainedKeys.size);
      expect(convertV1SongToV2(source, options)).toEqual(converted);
      expect(source).toEqual(snapshot);
      const { songNotes: sourceNotes, ...sourceMetadata } = snapshot;
      const { songNotes: convertedNotes, ...convertedMetadata } = converted;
      expect(convertedMetadata).toEqual({
        ...sourceMetadata, formatVersion: 2, name: options.name,
      });
      expect(convertedNotes.map(({ time, key }) => ({ time, key })))
        .toEqual(sourceNotes);
      const chord = converted.songNotes.filter((note) => note.time === 900);
      expect(chord).toHaveLength(3);
      expect(new Set(chord.map((note) => note.duration)).size).toBe(1);
      expect(chord[0]?.duration).toBeGreaterThan(300);
      converted.songNotes.filter((note) => note.time === 3700)
        .forEach((note) =>
          expect(note.duration).toBe(options.finalGroupDurationMs),
        );
    },
  );

  it("keeps fractional final-group duration behavior unchanged", () => {
    expect(convertV1SongToV2(songAtTimes([0]), {
      ...balanced, finalGroupDurationMs: 500.7, maxDurationMs: 500.75,
    }).songNotes[0]?.duration).toBe(500.75);
  });

  it.each([
    ["already-v2", { ...naturallySlow, formatVersion: 2 as const }],
    ["empty-score", song([])],
    ["invalid-note-time", song([{ time: Number.NaN, key: "Key0" }])],
    ["invalid-note-time", song([{ time: Infinity, key: "Key0" }])],
  ])("preserves %s validation without changing the source", (code, source) => {
    const snapshot = structuredClone(source);
    expect(() => convertV1SongToV2(source, balanced)).toThrow(code);
    expect(() => previewV1ToV2Conversion(source, balanced)).toThrow(code);
    expect(source).toEqual(snapshot);
  });
});

describe("explicit Connected sustain selection", () => {
  // The four long-gap onset pairs are supplied from the real score. Nearby
  // 342ms groups provide representative timing context without moving them.
  const intervals = [
    { start: 3420, end: 3762, before: 327, after: 327 },
    { start: 3420, end: 4104, before: 669, after: 669 },
    { start: 69426, end: 70794, before: 669, after: 1163 },
    { start: 74898, end: 76779, before: 669, after: 1599 },
    { start: 94905, end: 96957, before: 669, after: 1744 },
    { start: 65322, end: 68058, before: 669, after: 2000 },
  ];

  it.each(intervals)(
    "sustains $start to $end with $after ms while retaining a rest",
    ({ start, end, before, after }) => {
      const source = songAtTimes([
        start - 1026, start - 684, start - 342, start,
        end, end + 342, end + 684, end + 1026,
      ]);
      const baseline = convertV1SongToV2(source, styles.connected);
      const converted = convertV1SongToV2(source, explicitlyConnected);

      expect(analyzeV1ToV2ScoreProfile(source).typicalGapMs).toBe(342);
      expect(baseline.songNotes[3]?.duration).toBe(before);
      expect(converted.songNotes[3]).toEqual({
        time: start, key: "1Key3", duration: after,
      });
      expect(converted.songNotes[4]?.time).toBe(end);
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeLessThanOrEqual(2000);
      expect(end - start - after)
        .toBeGreaterThanOrEqual(explicitlyConnected.releaseLeadMs);
    },
  );

  it("grows with long intervals, caps at 2000ms, and preserves long rests", () => {
    const source = songWithGaps([
      342, 342, 1368, 342, 342, 1881, 342, 342, 2052,
      342, 342, 2736, 342, 342, 30000, 342, 342,
    ]);
    const converted = convertV1SongToV2(source, explicitlyConnected);
    const durations = [2, 5, 8, 11, 14]
      .map(index => converted.songNotes[index]?.duration ?? 0);
    expect(durations).toEqual([1163, 1599, 1744, 2000, 2000]);
    expect(2736 - durations[3]).toBe(736);
    expect(30000 - durations[4]).toBe(28000);
  });

  it.each(["conservative", "balanced", "custom"] as const)(
    "keeps %s on the adaptive baseline, including Custom matching Connected",
    selectedStyle => {
      const options = selectedStyle === "custom"
        ? styles.connected : styles[selectedStyle];
      const source = songWithGaps([342, 342, 2736, 342, 342, 2500]);
      expect(convertV1SongToV2(source, { ...options, selectedStyle }))
        .toEqual(convertV1SongToV2(source, options));
      expect(convertV1SongToV2(source, { ...options, selectedStyle })
        .songNotes[2]?.duration).toBeLessThan(1000);
    },
  );

  it("leaves numeric-only direct callers unchanged", () => {
    const source = songWithGaps([342, 342, 2736, 342, 342]);
    expect(convertV1SongToV2(source, styles.connected).songNotes[2]?.duration)
      .toBe(669);
    expect(convertV1SongToV2(source, explicitlyConnected).songNotes[2]?.duration)
      .toBe(2000);
  });

  it("preserves minimum-gap eligibility and ordinary short holds", () => {
    const source = songWithGaps([149, 150, 342, 684, 342, 342]);
    const converted = convertV1SongToV2(source, explicitlyConnected);
    expect(converted.songNotes[0]?.duration).toBeUndefined();
    expect(converted.songNotes[1]?.duration).toBe(135);
    expect(converted.songNotes[2]?.duration).toBe(327);
  });

  it.each([1.1, 15, 500])(
    "respects a %ims release lead and normalized same-key safety at fractional times",
    releaseLeadMs => {
      const source = song([
        { time: 0, key: "1Key0" },
        { time: 525.8, key: "2Key0" },
      ]);
      const options = {
        ...explicitlyConnected, minimumSustainGapMs: 525, releaseLeadMs,
      };
      const duration = convertV1SongToV2(source, options)
        .songNotes[0]?.duration ?? 0;
      expect(duration).toBeGreaterThanOrEqual(MIN_V2_NOTE_DURATION_MS);
      expect(duration).toBeLessThanOrEqual(525.8 - releaseLeadMs);
      expect(duration)
        .toBeLessThanOrEqual(525.8 - V1_TO_V2_RETRIGGER_SAFETY_MS);
    },
  );

  it("does not raise a configured maximum or change final-group rounding", () => {
    const source = songWithGaps([342, 342, 2736, 342, 342]);
    const options = {
      ...explicitlyConnected, maxDurationMs: 700.75, finalGroupDurationMs: 700.7,
    };
    const converted = convertV1SongToV2(source, options);
    expect(converted.songNotes[2]?.duration).toBeLessThanOrEqual(700.75);
    expect(converted.songNotes[converted.songNotes.length - 1]?.duration)
      .toBe(700.75);
  });

  it("omits a repeated-key hold when the safe interval is below the minimum", () => {
    const converted = convertV1SongToV2(
      song([{ time: 0, key: "1Key0" }, { time: 30.8, key: "2Key0" }]),
      { ...explicitlyConnected, minimumSustainGapMs: 26, releaseLeadMs: 1 },
    );
    expect(converted.songNotes[0]?.duration).toBeUndefined();
    expect(converted.songNotes[1]?.duration).toBe(800);
  });

  it("preserves chords, source data, deterministic plans, and preview counts", () => {
    const source = song([
      { time: 342, key: "1Key0" },
      { time: 0, key: "1Key1" },
      { time: 684, key: "1Key2" },
      { time: 342, key: "2Key0" },
      { time: 684, key: "1Key3" },
      { time: 3420, key: "1Key2" },
      { time: 3762, key: "1Key4" },
      { time: 4104, key: "1Key5" },
    ]);
    const snapshot = structuredClone(source);
    const converted = convertV1SongToV2(source, explicitlyConnected);
    const { songNotes: sourceNotes, ...metadata } = snapshot;
    const { songNotes: notes, ...convertedMetadata } = converted;
    expect(convertedMetadata).toEqual({
      ...metadata, formatVersion: 2, name: explicitlyConnected.name,
    });
    expect(notes.map(({ time, key }) => ({ time, key }))).toEqual(sourceNotes);
    expect(notes.filter(note => note.time === 684)
      .map(note => note.duration)).toEqual([2000, 2000]);
    const sustainedKeys = new Set(notes
      .filter(note => note.duration !== undefined)
      .map(note => `${note.time}:${getPreviewKeyName(note.key)}`));
    expect(previewV1ToV2Conversion(source, explicitlyConnected)
      .generatedSustainCount).toBe(sustainedKeys.size);
    expect(notes[notes.length - 1]?.duration).toBe(800);
    expect(convertV1SongToV2(source, explicitlyConnected)).toEqual(converted);
    expect(source).toEqual(snapshot);
  });
});
