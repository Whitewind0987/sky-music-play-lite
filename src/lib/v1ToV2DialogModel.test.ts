import { describe, expect, it } from "vitest";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2FormField,
  formatMillisecondsAsSeconds,
  getReadableSustainTimeValues,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2DialogModel";

const balancedValues = {
  overlapMs: "40",
  restGapThresholdMs: "2000",
  maxDurationMs: "2000",
  finalGroupDurationMs: "500",
};

describe("V1 to V2 dialog model", () => {
  it("starts with Balanced and has no Advanced Settings state", () => {
    const state = createInitialUpgradeScoreToV2FormState("Generated");

    expect(state).toMatchObject({
      selectedStyle: "balanced",
      values: {
        name: "Generated",
        ...balancedValues,
      },
    });
    expect(state).not.toHaveProperty("isAdvancedOpen");
  });

  it("defines every preset with the exact required numeric values", () => {
    expect(V1_TO_V2_SUSTAIN_STYLE_PRESETS).toEqual({
      conservative: {
        overlapMs: 20,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 300,
      },
      balanced: {
        overlapMs: 40,
        restGapThresholdMs: 2000,
        maxDurationMs: 2000,
        finalGroupDurationMs: 500,
      },
      connected: {
        overlapMs: 80,
        restGapThresholdMs: 4000,
        maxDurationMs: 3000,
        finalGroupDurationMs: 800,
      },
    });
  });

  it.each([
    ["conservative", ["20", "1000", "1000", "300"]],
    ["balanced", ["40", "2000", "2000", "500"]],
    ["connected", ["80", "4000", "3000", "800"]],
  ] as const)("selecting %s applies all numeric values", (style, expected) => {
    const nextState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      style,
    );

    expect(nextState.selectedStyle).toBe(style);
    expect([
      nextState.values.overlapMs,
      nextState.values.restGapThresholdMs,
      nextState.values.maxDurationMs,
      nextState.values.finalGroupDurationMs,
    ]).toEqual(expected);
  });

  it("selecting Custom preserves current numeric values", () => {
    const currentState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "connected",
    );

    expect(
      selectV1ToV2SustainStyle(currentState, "custom"),
    ).toMatchObject({
      selectedStyle: "custom",
      values: currentState.values,
    });
  });

  it.each([
    "overlapMs",
    "restGapThresholdMs",
    "maxDurationMs",
    "finalGroupDurationMs",
  ] as const)(
    "editing the %s numeric field selects Custom and clears stale errors",
    (field) => {
      const currentState = {
        ...createInitialUpgradeScoreToV2FormState("Generated"),
        operationError: "storage failed",
        validationError: "invalid-overlap" as const,
      };
      const nextState = editUpgradeScoreToV2FormField(
        currentState,
        field,
        "123",
      );

      expect(nextState).toMatchObject({
        operationError: "",
        selectedStyle: "custom",
        validationError: null,
        values: { [field]: "123" },
      });
    },
  );

  it("keeps Custom selected when another numeric value is edited", () => {
    const customState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "custom",
    );

    expect(
      editUpgradeScoreToV2FormField(
        customState,
        "finalGroupDurationMs",
        "650",
      ),
    ).toMatchObject({
      selectedStyle: "custom",
      values: {
        finalGroupDurationMs: "650",
      },
    });
  });

  it("editing the score name preserves the selected preset", () => {
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

  it("restores Balanced values, preserves the name, and clears errors", () => {
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

  it("validation and operation errors preserve the selected style", () => {
    const presetState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "connected",
    );

    expect(
      applyUpgradeScoreToV2Validation(presetState, "invalid-overlap"),
    ).toMatchObject({
      selectedStyle: "connected",
      validationError: "invalid-overlap",
    });
    expect(
      applyUpgradeScoreToV2OperationError(presetState, "storage failed"),
    ).toMatchObject({
      operationError: "storage failed",
      selectedStyle: "connected",
    });
  });

  it("keeps selected values intact after valid validation", () => {
    const currentState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "connected",
    );

    expect(applyUpgradeScoreToV2Validation(currentState, null)).toMatchObject({
      selectedStyle: "connected",
      values: currentState.values,
    });
    expect(buildV1ToV2OptionsFromDialogValues(currentState.values)).toEqual({
      name: "Generated",
      overlapMs: 80,
      restGapThresholdMs: 4000,
      maxDurationMs: 3000,
      finalGroupDurationMs: 800,
    });
  });

  it.each([
    [1000, "1"],
    [2000, "2"],
    [2500, "2.5"],
    ["", null],
    ["not-a-number", null],
  ])("formats %s milliseconds as readable seconds", (value, expected) => {
    expect(formatMillisecondsAsSeconds(value)).toBe(expected);
  });

  it.each([
    ["invalid overlap", { overlapMs: "501" }],
    ["invalid rest-gap threshold", { restGapThresholdMs: "24" }],
    ["invalid maximum duration", { maxDurationMs: "24" }],
    ["invalid final-group duration", { finalGroupDurationMs: "24" }],
    [
      "final duration above maximum",
      { maxDurationMs: "1000", finalGroupDurationMs: "1500" },
    ],
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
      maxSeconds: "2",
      restSeconds: "2",
    });
    expect(
      getReadableSustainTimeValues({
        ...values,
        name: "",
        overlapMs: "501",
      }),
    ).toBeNull();
  });

  it("formats valid custom values after complete numeric validation", () => {
    const values =
      createInitialUpgradeScoreToV2FormState("Generated").values;

    expect(
      getReadableSustainTimeValues({
        ...values,
        overlapMs: "60",
        restGapThresholdMs: "2500",
        maxDurationMs: "3500",
        finalGroupDurationMs: "750",
      }),
    ).toEqual({
      maxSeconds: "3.5",
      restSeconds: "2.5",
    });
  });
});
