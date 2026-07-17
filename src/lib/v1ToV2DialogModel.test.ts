import { describe, expect, it } from "vitest";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2ChordSustain,
  editUpgradeScoreToV2FormField,
  formatMillisecondsAsSeconds,
  getReadableSustainTimeValues,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2DialogModel";

const balancedValues = {
  allowChordSustainInProtectedMode: false,
  minimumSustainGapMs: "250",
  releaseLeadMs: "30",
  restGapThresholdMs: "1200",
  maxDurationMs: "1200",
  finalGroupDurationMs: "500",
};

describe("V1 to V2 dialog model", () => {
  it("starts with the exact Balanced values", () => {
    expect(
      createInitialUpgradeScoreToV2FormState("Generated"),
    ).toMatchObject({
      selectedStyle: "balanced",
      values: {
        name: "Generated",
        ...balancedValues,
      },
    });
  });

  it("defines every preset with the exact required numeric values", () => {
    expect(V1_TO_V2_SUSTAIN_STYLE_PRESETS).toEqual({
      conservative: {
        allowChordSustainInProtectedMode: false,
        minimumSustainGapMs: 400,
        releaseLeadMs: 50,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 300,
      },
      balanced: {
        allowChordSustainInProtectedMode: false,
        minimumSustainGapMs: 250,
        releaseLeadMs: 30,
        restGapThresholdMs: 1200,
        maxDurationMs: 1200,
        finalGroupDurationMs: 500,
      },
      connected: {
        allowChordSustainInProtectedMode: false,
        minimumSustainGapMs: 150,
        releaseLeadMs: 15,
        restGapThresholdMs: 2000,
        maxDurationMs: 2000,
        finalGroupDurationMs: 800,
      },
    });
  });

  it.each([
    ["conservative", ["400", "50", "1000", "1000", "300"]],
    ["balanced", ["250", "30", "1200", "1200", "500"]],
    ["connected", ["150", "15", "2000", "2000", "800"]],
  ] as const)("selecting %s applies all numeric values", (style, expected) => {
    const nextState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      style,
    );

    expect(nextState.selectedStyle).toBe(style);
    expect([
      nextState.values.minimumSustainGapMs,
      nextState.values.releaseLeadMs,
      nextState.values.restGapThresholdMs,
      nextState.values.maxDurationMs,
      nextState.values.finalGroupDurationMs,
    ]).toEqual(expected);
  });

  it("selecting Custom preserves the currently active values", () => {
    const currentState = editUpgradeScoreToV2ChordSustain(
      selectV1ToV2SustainStyle(
        createInitialUpgradeScoreToV2FormState("Generated"),
        "connected",
      ),
      true,
    );

    expect(
      selectV1ToV2SustainStyle(currentState, "custom"),
    ).toMatchObject({
      selectedStyle: "custom",
      values: currentState.values,
    });
  });

  it.each(["conservative", "balanced", "connected"] as const)(
    "selecting %s resets protected chord sustain",
    (style) => {
      const customState = editUpgradeScoreToV2ChordSustain(
        createInitialUpgradeScoreToV2FormState("Generated"),
        true,
      );

      expect(
        selectV1ToV2SustainStyle(customState, style).values
          .allowChordSustainInProtectedMode,
      ).toBe(false);
    },
  );

  it("editing protected chord sustain selects Custom and clears errors", () => {
    const currentState = {
      ...createInitialUpgradeScoreToV2FormState("Generated"),
      operationError: "storage failed",
      validationError: "invalid-release-lead" as const,
    };

    expect(
      editUpgradeScoreToV2ChordSustain(currentState, true),
    ).toMatchObject({
      operationError: "",
      selectedStyle: "custom",
      validationError: null,
      values: {
        allowChordSustainInProtectedMode: true,
      },
    });
  });

  it.each([
    "minimumSustainGapMs",
    "releaseLeadMs",
    "restGapThresholdMs",
    "maxDurationMs",
    "finalGroupDurationMs",
  ] as const)(
    "editing the %s numeric field keeps Custom and clears stale errors",
    (field) => {
      const currentState = {
        ...selectV1ToV2SustainStyle(
          createInitialUpgradeScoreToV2FormState("Generated"),
          "custom",
        ),
        operationError: "storage failed",
        validationError: "invalid-minimum-sustain-gap" as const,
      };
      const nextState = editUpgradeScoreToV2FormField(
        currentState,
        field,
        "321",
      );

      expect(nextState).toMatchObject({
        operationError: "",
        selectedStyle: "custom",
        validationError: null,
        values: { [field]: "321" },
      });
    },
  );

  it("editing the score name preserves the selected style", () => {
    const currentState = {
      ...selectV1ToV2SustainStyle(
        createInitialUpgradeScoreToV2FormState("Generated"),
        "connected",
      ),
      operationError: "duplicate",
      validationError: "empty-name" as const,
    };

    expect(
      editUpgradeScoreToV2FormField(currentState, "name", "Renamed"),
    ).toMatchObject({
      operationError: "",
      selectedStyle: "connected",
      validationError: null,
      values: { name: "Renamed" },
    });
  });

  it("restores Balanced, preserves the name, and clears all errors", () => {
    const editedState = {
      ...editUpgradeScoreToV2FormField(
        createInitialUpgradeScoreToV2FormState("Generated"),
        "maxDurationMs",
        "3456",
      ),
      operationError: "duplicate",
      validationError: "invalid-maximum-duration" as const,
      values: {
        ...createInitialUpgradeScoreToV2FormState("Generated").values,
        allowChordSustainInProtectedMode: true,
        name: "Keep this name",
        maxDurationMs: "3456",
      },
    };

    expect(restoreRecommendedUpgradeScoreToV2State(editedState)).toMatchObject({
      operationError: "",
      selectedStyle: "balanced",
      validationError: null,
      values: {
        name: "Keep this name",
        ...balancedValues,
      },
    });
  });

  it("validation and operation errors preserve style and values", () => {
    const presetState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "connected",
    );

    expect(
      applyUpgradeScoreToV2Validation(
        presetState,
        "invalid-minimum-sustain-gap",
      ),
    ).toMatchObject({
      selectedStyle: "connected",
      validationError: "invalid-minimum-sustain-gap",
      values: presetState.values,
    });
    expect(
      applyUpgradeScoreToV2OperationError(presetState, "storage failed"),
    ).toMatchObject({
      operationError: "storage failed",
      selectedStyle: "connected",
      values: presetState.values,
    });
  });

  it("builds the complete conversion option shape", () => {
    const currentState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "connected",
    );

    expect(
      buildV1ToV2OptionsFromDialogValues(currentState.values),
    ).toEqual({
      allowChordSustainInProtectedMode: false,
      name: "Generated",
      minimumSustainGapMs: 150,
      releaseLeadMs: 15,
      restGapThresholdMs: 2000,
      maxDurationMs: 2000,
      finalGroupDurationMs: 800,
    });
  });

  it.each([
    [250, "0.25"],
    [1200, "1.2"],
    [2500, "2.5"],
    ["", null],
    ["not-a-number", null],
  ])("formats %s milliseconds as readable seconds", (value, expected) => {
    expect(formatMillisecondsAsSeconds(value)).toBe(expected);
  });

  it.each([
    [
      "invalid minimum sustain gap",
      { minimumSustainGapMs: "24" },
    ],
    ["invalid release lead", { releaseLeadMs: "0" }],
    ["invalid rest threshold", { restGapThresholdMs: "24" }],
    ["invalid maximum duration", { maxDurationMs: "24" }],
    ["invalid final duration", { finalGroupDurationMs: "24" }],
    [
      "minimum above rest threshold",
      {
        minimumSustainGapMs: "1300",
        restGapThresholdMs: "1200",
      },
    ],
    [
      "minimum too short for release lead",
      { minimumSustainGapMs: "250", releaseLeadMs: "226" },
    ],
    [
      "final duration above maximum",
      { maxDurationMs: "1000", finalGroupDurationMs: "1001" },
    ],
    ["non-finite value", { releaseLeadMs: "Infinity" }],
  ])("returns a neutral-summary signal for %s", (_, overrides) => {
    const values =
      createInitialUpgradeScoreToV2FormState("Generated").values;

    expect(
      getReadableSustainTimeValues({ ...values, ...overrides }),
    ).toBeNull();
  });

  it("ignores an empty score name when numeric values are valid", () => {
    const values =
      createInitialUpgradeScoreToV2FormState("Generated").values;

    expect(getReadableSustainTimeValues({ ...values, name: "" })).toEqual({
      maximumSeconds: "1.2",
      minimumSeconds: "0.25",
      releaseLeadMs: "30",
      restSeconds: "1.2",
    });
  });

  it("formats a valid custom summary after complete validation", () => {
    const values =
      createInitialUpgradeScoreToV2FormState("Generated").values;

    expect(
      getReadableSustainTimeValues({
        ...values,
        minimumSustainGapMs: "300",
        releaseLeadMs: "40",
        restGapThresholdMs: "2500",
        maxDurationMs: "3500",
        finalGroupDurationMs: "750",
      }),
    ).toEqual({
      maximumSeconds: "3.5",
      minimumSeconds: "0.3",
      releaseLeadMs: "40",
      restSeconds: "2.5",
    });
  });
});
