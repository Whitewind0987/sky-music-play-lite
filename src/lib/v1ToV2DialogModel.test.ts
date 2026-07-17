import { describe, expect, it } from "vitest";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2FormField,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2DialogModel";

describe("V1 to V2 dialog model", () => {
  it("starts with the exact Balanced preset", () => {
    const state = createInitialUpgradeScoreToV2FormState("New");
    expect(state.selectedStyle).toBe("balanced");
    expect(buildV1ToV2OptionsFromDialogValues(state.values)).toEqual({
      name: "New",
      minimumSustainGapMs: 250,
      releaseLeadMs: 30,
      restGapThresholdMs: 1200,
      maxDurationMs: 1200,
      finalGroupDurationMs: 500,
    });
  });

  it("exposes exact Conservative, Balanced, and Connected presets", () => {
    expect(V1_TO_V2_SUSTAIN_STYLE_PRESETS).toEqual({
      conservative: {
        minimumSustainGapMs: 400,
        releaseLeadMs: 50,
        restGapThresholdMs: 1000,
        maxDurationMs: 1000,
        finalGroupDurationMs: 300,
      },
      balanced: {
        minimumSustainGapMs: 250,
        releaseLeadMs: 30,
        restGapThresholdMs: 1200,
        maxDurationMs: 1200,
        finalGroupDurationMs: 500,
      },
      connected: {
        minimumSustainGapMs: 150,
        releaseLeadMs: 15,
        restGapThresholdMs: 2000,
        maxDurationMs: 2000,
        finalGroupDurationMs: 800,
      },
    });
  });

  it("style selection updates values and clears stale errors", () => {
    const state = {
      ...createInitialUpgradeScoreToV2FormState("New"),
      operationError: "old operation",
      validationError: "invalid-release-lead" as const,
    };
    const next = selectV1ToV2SustainStyle(state, "connected");

    expect(next.selectedStyle).toBe("connected");
    expect(next.operationError).toBe("");
    expect(next.validationError).toBeNull();
    expect(next.values.minimumSustainGapMs).toBe("150");
  });

  it("editing any numeric field selects Custom and clears both errors", () => {
    const state = applyUpgradeScoreToV2OperationError(
      applyUpgradeScoreToV2Validation(
        createInitialUpgradeScoreToV2FormState("New"),
        "invalid-release-lead",
      ),
      "failed",
    );
    const next = editUpgradeScoreToV2FormField(
      state,
      "releaseLeadMs",
      "44",
    );

    expect(next.selectedStyle).toBe("custom");
    expect(next.operationError).toBe("");
    expect(next.validationError).toBeNull();
  });

  it("editing the name keeps the selected style and clears stale errors", () => {
    const state = {
      ...createInitialUpgradeScoreToV2FormState("New"),
      selectedStyle: "connected" as const,
      operationError: "failed",
    };
    const next = editUpgradeScoreToV2FormField(state, "name", "Renamed");

    expect(next.selectedStyle).toBe("connected");
    expect(next.operationError).toBe("");
  });

  it("Custom sends exactly five entered numeric fields", () => {
    const options = buildV1ToV2OptionsFromDialogValues({
      name: "Custom",
      minimumSustainGapMs: "333",
      releaseLeadMs: "22",
      restGapThresholdMs: "1444",
      maxDurationMs: "1333",
      finalGroupDurationMs: "444",
    });

    expect(options).toEqual({
      name: "Custom",
      minimumSustainGapMs: 333,
      releaseLeadMs: 22,
      restGapThresholdMs: 1444,
      maxDurationMs: 1333,
      finalGroupDurationMs: 444,
    });
    expect(Object.keys(options)).toHaveLength(6);
  });

  it("restores Balanced while preserving the edited name", () => {
    const custom = editUpgradeScoreToV2FormField(
      createInitialUpgradeScoreToV2FormState("New"),
      "maxDurationMs",
      "999",
    );
    const restored = restoreRecommendedUpgradeScoreToV2State({
      ...custom,
      values: { ...custom.values, name: "Keep me" },
    });

    expect(restored.selectedStyle).toBe("balanced");
    expect(restored.values.name).toBe("Keep me");
    expect(restored.values.maxDurationMs).toBe("1200");
  });
});
