import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import {
  analyzeV1ToV2ScoreProfile,
  convertV1SongToV2,
  getV1ToV2ConversionValidationError,
  previewV1ToV2Conversion,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";

const balanced: V1ToV2ConversionOptions = {
  name: "Converted",
  minimumSustainGapMs: 250,
  releaseLeadMs: 30,
  restGapThresholdMs: 1200,
  maxDurationMs: 1200,
  finalGroupDurationMs: 500,
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

const denseFixture = song([
  { time: 0, key: "1Key0" },
  { time: 160, key: "1Key1" },
  { time: 420, key: "1Key2" },
  { time: 840, key: "1Key3" },
  { time: 1000, key: "1Key4" },
]);

describe("normal V1 to V2 conversion", () => {
  it("has no protected profile mode or adaptive threshold", () => {
    expect(analyzeV1ToV2ScoreProfile(denseFixture)).toEqual({
      typicalGapMs: 210,
      multiNoteGroupRatio: 0,
      isDenseTiming: true,
      isPolyphonic: false,
    });
  });

  it("uses exact visible style values and yields distinct dense counts", () => {
    const styles = {
      conservative: {
        ...balanced,
        minimumSustainGapMs: 400,
        releaseLeadMs: 50,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 300,
      },
      balanced,
      connected: {
        ...balanced,
        minimumSustainGapMs: 150,
        releaseLeadMs: 15,
        restGapThresholdMs: 2000,
        maxDurationMs: 2000,
        finalGroupDurationMs: 800,
      },
    };

    expect(
      Object.values(styles).map(
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

  it("uses the visible thresholds and always ends before the next group", () => {
    const converted = convertV1SongToV2(
      song([
        { time: 0, key: "Key0" },
        { time: 249, key: "Key1" },
        { time: 500, key: "Key2" },
        { time: 1701, key: "Key3" },
      ]),
      balanced,
    );

    expect(converted.songNotes).toEqual([
      { time: 0, key: "Key0" },
      { time: 249, key: "Key1", duration: 221 },
      { time: 500, key: "Key2" },
      { time: 1701, key: "Key3", duration: 500 },
    ]);
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
