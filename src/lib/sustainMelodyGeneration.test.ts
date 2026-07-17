import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import {
  analyzeSustainMelodySource,
  buildSustainMelodyGenerationPlan,
  SustainMelodyGenerationError,
  SUSTAIN_MELODY_STYLE_CONFIG,
  type SustainMelodyStyle,
} from "./sustainMelodyGeneration";

function makeSong(
  groups: ReadonlyArray<{ time: number; keys: readonly string[] }>,
): Song {
  return {
    formatVersion: 1,
    name: "Source",
    bpm: 123,
    bitsPerPage: 9,
    pitchLevel: 2,
    isComposed: true,
    songNotes: groups.flatMap((group) =>
      group.keys.map((key) => ({ time: group.time, key })),
    ),
  };
}

const denseFixture = makeSong([
  { time: 0, keys: ["1Key0", "1Key2", "1Key5"] },
  { time: 78, keys: ["1Key0", "1Key2", "1Key5"] },
  { time: 156, keys: ["1Key0", "1Key2", "1Key5", "1Key12"] },
  { time: 312, keys: ["1Key0", "1Key2", "1Key5", "1Key11"] },
  { time: 468, keys: ["1Key0", "1Key2", "1Key5", "1Key9"] },
  { time: 624, keys: ["1Key0", "1Key2", "1Key5", "1Key8"] },
  { time: 1248, keys: ["1Key3", "1Key10"] },
  { time: 1872, keys: ["1Key4", "1Key12"] },
]);

function plan(source: Song, style: SustainMelodyStyle) {
  return buildSustainMelodyGenerationPlan(source, {
    name: `${style} result`,
    style,
  });
}

describe("sustain melody source analysis", () => {
  it("keeps all three extraction and sustain configurations centralized", () => {
    expect(SUSTAIN_MELODY_STYLE_CONFIG).toEqual({
      melody: {
        minimumSelectedGapMs: 140,
        baseReward: 26,
        pitchWeight: 20,
        topNoteBonus: 30,
        prominenceWeight: 20,
        polyphonyPenalty: 4,
        nearbyRepeatPenalty: 12,
        denseOnsetPenalty: 8,
        transitionReward: 12,
        pitchJumpPenaltyPerStep: 2.2,
        rapidSameKeyPenalty: 14,
        phraseBreakMs: 1000,
        restartPenalty: 4,
        minimumSustainGapMs: 250,
        releaseLeadMs: 30,
        restGapThresholdMs: 1400,
        maxDurationMs: 1200,
        finalGroupDurationMs: 500,
      },
      smooth: {
        minimumSelectedGapMs: 220,
        baseReward: 24,
        pitchWeight: 14,
        topNoteBonus: 18,
        prominenceWeight: 12,
        polyphonyPenalty: 5,
        nearbyRepeatPenalty: 14,
        denseOnsetPenalty: 10,
        transitionReward: 12,
        pitchJumpPenaltyPerStep: 5,
        rapidSameKeyPenalty: 16,
        phraseBreakMs: 900,
        restartPenalty: 3,
        minimumSustainGapMs: 220,
        releaseLeadMs: 25,
        restGapThresholdMs: 1600,
        maxDurationMs: 1400,
        finalGroupDurationMs: 600,
      },
      minimal: {
        minimumSelectedGapMs: 420,
        baseReward: 18,
        pitchWeight: 16,
        topNoteBonus: 22,
        prominenceWeight: 16,
        polyphonyPenalty: 8,
        nearbyRepeatPenalty: 22,
        denseOnsetPenalty: 18,
        transitionReward: 8,
        pitchJumpPenaltyPerStep: 3.5,
        rapidSameKeyPenalty: 24,
        phraseBreakMs: 800,
        restartPenalty: 1,
        minimumSustainGapMs: 400,
        releaseLeadMs: 40,
        restGapThresholdMs: 1200,
        maxDurationMs: 1000,
        finalGroupDurationMs: 400,
      },
    });
  });

  it("calculates odd and even medians from positive adjacent gaps", () => {
    expect(
      analyzeSustainMelodySource(
        makeSong([
          { time: 0, keys: ["Key0"] },
          { time: 200, keys: ["Key1"] },
          { time: 500, keys: ["Key2"] },
          { time: 900, keys: ["Key3"] },
        ]),
      ).typicalGapMs,
    ).toBe(300);
    expect(
      analyzeSustainMelodySource(
        makeSong([
          { time: 0, keys: ["Key0"] },
          { time: 200, keys: ["Key1"] },
          { time: 600, keys: ["Key2"] },
        ]),
      ).typicalGapMs,
    ).toBe(300);
  });

  it("returns null median and zero dense ratio when there are no gaps", () => {
    expect(
      analyzeSustainMelodySource(
        makeSong([{ time: 0, keys: ["Key0"] }]),
      ),
    ).toMatchObject({ typicalGapMs: null, denseGapRatio: 0 });
  });

  it("deduplicates normalized keys for polyphony analysis", () => {
    expect(
      analyzeSustainMelodySource(
        makeSong([{ time: 0, keys: ["1Key0", "2Key0"] }]),
      ).multiNoteGroupRatio,
    ).toBe(0);
    expect(
      analyzeSustainMelodySource(
        makeSong([{ time: 0, keys: ["1Key0", "1Key1"] }]),
      ).multiNoteGroupRatio,
    ).toBe(1);
  });

  it("calculates dense-gap ratio exactly", () => {
    expect(
      analyzeSustainMelodySource(
        makeSong([
          { time: 0, keys: ["Key0"] },
          { time: 250, keys: ["Key1"] },
          { time: 750, keys: ["Key2"] },
          { time: 1750, keys: ["Key3"] },
        ]),
      ).denseGapRatio,
    ).toBe(1 / 3);
  });

  it.each([
    [
      "minimal from typical gap",
      [
        { time: 0, keys: ["Key0"] },
        { time: 250, keys: ["Key1"] },
      ],
      "minimal",
    ],
    [
      "minimal from polyphony",
      [
        { time: 0, keys: ["Key0", "Key1"] },
        { time: 1000, keys: ["Key2", "Key3"] },
        { time: 2000, keys: ["Key4"] },
      ],
      "minimal",
    ],
    [
      "minimal from dense ratio",
      [
        { time: 0, keys: ["Key0"] },
        { time: 250, keys: ["Key1"] },
        { time: 1250, keys: ["Key2"] },
      ],
      "minimal",
    ],
    [
      "smooth from typical gap",
      [
        { time: 0, keys: ["Key0"] },
        { time: 400, keys: ["Key1"] },
      ],
      "smooth",
    ],
    [
      "smooth from polyphony",
      [
        { time: 0, keys: ["Key0", "Key1"] },
        { time: 1000, keys: ["Key2"] },
        { time: 2000, keys: ["Key3"] },
        { time: 3000, keys: ["Key4"] },
        { time: 4000, keys: ["Key5"] },
        { time: 5000, keys: ["Key6"] },
      ],
      "smooth",
    ],
    [
      "smooth from dense ratio",
      [
        { time: 0, keys: ["Key0"] },
        { time: 250, keys: ["Key1"] },
        { time: 1250, keys: ["Key2"] },
        { time: 2250, keys: ["Key3"] },
        { time: 3250, keys: ["Key4"] },
      ],
      "smooth",
    ],
    [
      "melody for sparse monophony",
      [
        { time: 0, keys: ["Key0"] },
        { time: 800, keys: ["Key1"] },
        { time: 1600, keys: ["Key2"] },
      ],
      "melody",
    ],
  ] as const)("%s", (_, groups, expected) => {
    expect(analyzeSustainMelodySource(makeSong([...groups])).recommendedStyle)
      .toBe(expected);
  });

  it("uses inclusive recommendation boundaries", () => {
    const minimal = analyzeSustainMelodySource(
      makeSong([
        { time: 0, keys: ["Key0"] },
        { time: 250, keys: ["Key1"] },
      ]),
    );
    const smooth = analyzeSustainMelodySource(
      makeSong([
        { time: 0, keys: ["Key0"] },
        { time: 400, keys: ["Key1"] },
      ]),
    );
    expect(minimal.recommendedStyle).toBe("minimal");
    expect(smooth.recommendedStyle).toBe("smooth");
  });
});

describe("sustain melody extraction", () => {
  it("deduplicates normalized candidates and preserves the first raw key", () => {
    const generated = plan(
      makeSong([
        { time: 0, keys: ["1Key0", "2Key0", "unsupported"] },
        { time: 700, keys: ["1Key1"] },
      ]),
      "melody",
    ).generatedSong;

    expect(generated.songNotes[0]?.key).toBe("1Key0");
    expect(generated.songNotes).toHaveLength(2);
  });

  it("ignores unsupported keys and throws a typed error when none remain", () => {
    expect(
      plan(
        makeSong([
          { time: 0, keys: ["unsupported", "Key15"] },
          { time: 500, keys: ["Key1"] },
        ]),
        "melody",
      ).generatedSong.songNotes,
    ).toHaveLength(1);
    expect(() =>
      plan(makeSong([{ time: 0, keys: ["bad", "Key15"] }]), "melody"),
    ).toThrowError(SustainMelodyGenerationError);
    try {
      plan(makeSong([{ time: 0, keys: ["bad"] }]), "melody");
    } catch (error) {
      expect((error as SustainMelodyGenerationError).code).toBe(
        "no-supported-keys",
      );
    }
  });

  it("selects at most one note per source group and returns sorted output", () => {
    const generated = plan(denseFixture, "melody").generatedSong;
    const times = generated.songNotes.map((note) => note.time);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it("prefers the high contour over repeated low accompaniment", () => {
    const keys = plan(denseFixture, "melody").generatedSong.songNotes.map(
      (note) => note.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining(["1Key12", "1Key11", "1Key9", "1Key8"]),
    );
    expect(keys.filter((key) => key === "1Key0").length).toBeLessThan(4);
  });

  it("Minimal retains fewer events than Melody Priority on dense input", () => {
    expect(plan(denseFixture, "minimal").stats.selectedMelodyNoteCount)
      .toBeLessThan(plan(denseFixture, "melody").stats.selectedMelodyNoteCount);
  });

  it.each([
    ["minimal", 420],
    ["smooth", 220],
    ["melody", 140],
  ] as const)("%s respects its %d ms selected-gap minimum", (style, minimum) => {
    const notes = plan(denseFixture, style).generatedSong.songNotes;
    for (let index = 1; index < notes.length; index += 1) {
      expect((notes[index]?.time ?? 0) - (notes[index - 1]?.time ?? 0))
        .toBeGreaterThanOrEqual(minimum);
    }
    expect(SUSTAIN_MELODY_STYLE_CONFIG[style].minimumSelectedGapMs).toBe(
      minimum,
    );
  });

  it("Smooth favors a smaller pitch jump when local candidates compete", () => {
    const source = makeSong([
      { time: 0, keys: ["Key7"] },
      { time: 300, keys: ["Key8", "Key14"] },
      { time: 600, keys: ["Key9"] },
    ]);
    const keys = plan(source, "smooth").generatedSong.songNotes.map(
      (note) => note.key,
    );
    expect(keys).toContain("Key8");
  });

  it("starts a new phrase after the detailed lookback window", () => {
    const generated = plan(
      makeSong([
        { time: 0, keys: ["Key14"] },
        { time: 6000, keys: ["Key0"] },
      ]),
      "smooth",
    ).generatedSong;
    expect(generated.songNotes.map((note) => note.key)).toEqual([
      "Key14",
      "Key0",
    ]);
  });

  it("falls back to one deterministic candidate when every path is negative", () => {
    const keys = Array.from({ length: 15 }, (_, index) => `Key${index}`);
    const generated = plan(makeSong([{ time: 0, keys }]), "minimal")
      .generatedSong;
    expect(generated.songNotes).toHaveLength(1);
  });

  it("preserves source metadata and immutability while producing V2", () => {
    const source = structuredClone(denseFixture);
    const snapshot = structuredClone(source);
    const generated = plan(source, "minimal").generatedSong;

    expect(source).toEqual(snapshot);
    expect(generated).toMatchObject({
      formatVersion: 2,
      bpm: 123,
      bitsPerPage: 9,
      pitchLevel: 2,
      isComposed: true,
    });
    expect(generated.songNotes.length).toBeLessThan(source.songNotes.length);
  });

  it("generates exact statistics from the same output plan", () => {
    const generatedPlan = plan(denseFixture, "smooth");
    const output = generatedPlan.generatedSong.songNotes;
    expect(generatedPlan.stats).toEqual({
      originalNoteCount: denseFixture.songNotes.length,
      selectedMelodyNoteCount: output.length,
      removedNoteCount: denseFixture.songNotes.length - output.length,
      removedPercent:
        Math.round(
          ((denseFixture.songNotes.length - output.length) /
            denseFixture.songNotes.length) *
            1000,
        ) / 10,
      generatedSustainCount: output.filter(
        (note) => note.duration !== undefined,
      ).length,
    });
  });

  it("keeps generated durations before the next melody event", () => {
    const notes = plan(denseFixture, "melody").generatedSong.songNotes;
    notes.slice(0, -1).forEach((note, index) => {
      if (note.duration !== undefined) {
        expect(note.time + note.duration).toBeLessThan(
          notes[index + 1]?.time ?? 0,
        );
      }
    });
  });

  it("applies normalized same-key retrigger safety without rewriting raw keys", () => {
    const generated = plan(
      makeSong([
        { time: 0, keys: ["1Key0"] },
        { time: 500, keys: ["2Key0"] },
      ]),
      "melody",
    ).generatedSong;
    expect(generated.songNotes).toEqual([
      { time: 0, key: "1Key0", duration: 470 },
      { time: 500, key: "2Key0", duration: 500 },
    ]);
  });
});
