import { describe, expect, it } from "vitest";
import {
  createDefaultV1ToV2UpgradePreferences,
  DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES,
  sanitizeV1ToV2UpgradePreferences,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2UpgradePreferences";

const validCustomValues = {
  minimumSustainGapMs: 333,
  releaseLeadMs: 22,
  restGapThresholdMs: 1444,
  maxDurationMs: 1333,
  finalGroupDurationMs: 444,
};

describe("V1 to V2 upgrade preference defaults", () => {
  it("uses Connected and fresh Connected values", () => {
    const first = createDefaultV1ToV2UpgradePreferences();
    const second = createDefaultV1ToV2UpgradePreferences();

    expect(first).toEqual({
      selectedStyle: "connected",
      customValues: V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
    expect(DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES).toEqual(first);
    expect(first).not.toBe(second);
    expect(first.customValues).not.toBe(second.customValues);
  });
});

describe("sanitizeV1ToV2UpgradePreferences", () => {
  it.each(["conservative", "balanced", "connected"] as const)(
    "preserves a valid %s preset and remembered Custom values",
    (selectedStyle) => {
      expect(
        sanitizeV1ToV2UpgradePreferences({
          selectedStyle,
          customValues: validCustomValues,
        }),
      ).toEqual({ selectedStyle, customValues: validCustomValues });
    },
  );

  it("preserves valid Custom and all five values", () => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "custom",
        customValues: validCustomValues,
      }),
    ).toEqual({
      selectedStyle: "custom",
      customValues: validCustomValues,
    });
  });

  it.each([undefined, null, "bad", 42, []])(
    "uses Connected defaults for non-object input %p",
    (rawPreferences) => {
      expect(
        sanitizeV1ToV2UpgradePreferences(rawPreferences),
      ).toEqual(createDefaultV1ToV2UpgradePreferences());
    },
  );

  it("falls back an invalid selected style to Connected", () => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "recommended",
        customValues: validCustomValues,
      }),
    ).toEqual({
      selectedStyle: "connected",
      customValues: validCustomValues,
    });
  });

  it("uses default Custom values when fields are missing", () => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "balanced",
        customValues: {
          minimumSustainGapMs: 333,
        },
      }),
    ).toEqual({
      selectedStyle: "balanced",
      customValues: V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["string", "333"],
    ["null", null],
  ])("rejects a %s Custom field", (_, invalidValue) => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "balanced",
        customValues: {
          ...validCustomValues,
          minimumSustainGapMs: invalidValue,
        },
      }),
    ).toEqual({
      selectedStyle: "balanced",
      customValues: V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
  });

  it.each([
    ["minimum", { minimumSustainGapMs: 24 }],
    ["release lead", { releaseLeadMs: 501 }],
    ["rest threshold", { restGapThresholdMs: 60001 }],
    ["maximum", { maxDurationMs: 60001 }],
    ["final duration", { finalGroupDurationMs: 60001 }],
  ])("rejects an out-of-range %s value", (_, override) => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "connected",
        customValues: { ...validCustomValues, ...override },
      }).customValues,
    ).toEqual(V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected);
  });

  it.each([
    [
      "minimum above rest threshold",
      { minimumSustainGapMs: 1500, restGapThresholdMs: 1400 },
    ],
    [
      "minimum too close to release lead",
      { minimumSustainGapMs: 40, releaseLeadMs: 20 },
    ],
    [
      "final duration above maximum",
      { finalGroupDurationMs: 1400, maxDurationMs: 1300 },
    ],
  ])("rejects the invalid relationship %s", (_, override) => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "balanced",
        customValues: { ...validCustomValues, ...override },
      }),
    ).toEqual({
      selectedStyle: "balanced",
      customValues: V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
  });

  it("falls back completely when Custom is selected with invalid values", () => {
    expect(
      sanitizeV1ToV2UpgradePreferences({
        selectedStyle: "custom",
        customValues: {
          ...validCustomValues,
          finalGroupDurationMs: 1400,
          maxDurationMs: 1300,
        },
      }),
    ).toEqual(createDefaultV1ToV2UpgradePreferences());
  });

  it("does not mutate input and returns fresh nested values", () => {
    const input = {
      selectedStyle: "custom",
      customValues: { ...validCustomValues },
    };
    const snapshot = structuredClone(input);
    const result = sanitizeV1ToV2UpgradePreferences(input);

    expect(input).toEqual(snapshot);
    expect(result).not.toBe(input);
    expect(result.customValues).not.toBe(input.customValues);
  });
});
