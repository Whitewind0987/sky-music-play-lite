import { describe, expect, it } from "vitest";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2FormField,
  getUpgradeScoreToV2Preferences,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  shouldShowV1ToV2DenseWarning,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2DialogModel";
import { createDefaultV1ToV2UpgradePreferences } from "./v1ToV2UpgradePreferences";
import type {
  V1ToV2SustainStyle,
  V1ToV2UpgradePreferences,
} from "../types/v1ToV2Upgrade";

const rememberedCustomValues = {
  minimumSustainGapMs: 333,
  releaseLeadMs: 22,
  restGapThresholdMs: 1444,
  maxDurationMs: 1333,
  finalGroupDurationMs: 444,
};

function preferences(
  selectedStyle: V1ToV2SustainStyle,
): V1ToV2UpgradePreferences {
  return {
    selectedStyle,
    customValues: { ...rememberedCustomValues },
  };
}

describe("V1 to V2 dialog model defaults and presets", () => {
  it("starts with the exact Connected preset on first use", () => {
    const state = createInitialUpgradeScoreToV2FormState("New");

    expect(state.selectedStyle).toBe("connected");
    expect(buildV1ToV2OptionsFromDialogValues(state.values)).toEqual({
      name: "New",
      ...V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
    expect(state.rememberedCustomValues).toEqual(
      V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    );
  });

  it("keeps the exact Conservative, Balanced, and Connected values", () => {
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

  it.each(["conservative", "balanced", "connected"] as const)(
    "opens persisted %s visibly selected with exact preset values",
    (selectedStyle) => {
      const state = createInitialUpgradeScoreToV2FormState(
        "New",
        preferences(selectedStyle),
      );

      expect(state.selectedStyle).toBe(selectedStyle);
      expect(buildV1ToV2OptionsFromDialogValues(state.values)).toEqual({
        name: "New",
        ...V1_TO_V2_SUSTAIN_STYLE_PRESETS[selectedStyle],
      });
      expect(state.rememberedCustomValues).toEqual(
        rememberedCustomValues,
      );
    },
  );

  it("opens persisted Custom with all five saved values", () => {
    const state = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );

    expect(state.selectedStyle).toBe("custom");
    expect(buildV1ToV2OptionsFromDialogValues(state.values)).toEqual({
      name: "New",
      ...rememberedCustomValues,
    });
  });
});

describe("V1 to V2 dialog model preference transitions", () => {
  it("selecting each preset uses its exact visible values and keeps Custom memory", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );

    for (const selectedStyle of [
      "conservative",
      "balanced",
      "connected",
    ] as const) {
      const next = selectV1ToV2SustainStyle(initial, selectedStyle);

      expect(next.selectedStyle).toBe(selectedStyle);
      expect(buildV1ToV2OptionsFromDialogValues(next.values)).toEqual({
        name: "New",
        ...V1_TO_V2_SUSTAIN_STYLE_PRESETS[selectedStyle],
      });
      expect(next.rememberedCustomValues).toEqual(
        rememberedCustomValues,
      );
    }
  });

  it("selecting Custom restores the last saved Custom values", () => {
    const custom = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );
    const connected = selectV1ToV2SustainStyle(custom, "connected");
    const restoredCustom = selectV1ToV2SustainStyle(
      connected,
      "custom",
    );

    expect(restoredCustom.selectedStyle).toBe("custom");
    expect(buildV1ToV2OptionsFromDialogValues(restoredCustom.values)).toEqual({
      name: "New",
      ...rememberedCustomValues,
    });
  });

  it("a valid Custom edit becomes the last persistable value", () => {
    const state = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );
    const next = editUpgradeScoreToV2FormField(
      state,
      "minimumSustainGapMs",
      "350",
    );

    expect(getUpgradeScoreToV2Preferences(next)).toEqual({
      selectedStyle: "custom",
      customValues: {
        ...rememberedCustomValues,
        minimumSustainGapMs: 350,
      },
    });
  });

  it("an invalid Custom edit remains visible without replacing the last valid values", () => {
    const state = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );
    const next = editUpgradeScoreToV2FormField(
      state,
      "minimumSustainGapMs",
      "",
    );

    expect(next.values.minimumSustainGapMs).toBe("");
    expect(getUpgradeScoreToV2Preferences(next)).toEqual({
      selectedStyle: "custom",
      customValues: rememberedCustomValues,
    });
  });

  it("name editing changes neither selected style nor Custom memory", () => {
    const state = createInitialUpgradeScoreToV2FormState(
      "Song A",
      preferences("balanced"),
    );
    const next = editUpgradeScoreToV2FormField(
      state,
      "name",
      "Song B",
    );

    expect(next.selectedStyle).toBe("balanced");
    expect(next.rememberedCustomValues).toEqual(rememberedCustomValues);
    expect(next.values.name).toBe("Song B");
  });

  it("Restore Recommended selects Connected, keeps the name and preserves Custom memory", () => {
    const state = createInitialUpgradeScoreToV2FormState(
      "Keep me",
      preferences("custom"),
    );
    const restored = restoreRecommendedUpgradeScoreToV2State(state);

    expect(restored.selectedStyle).toBe("connected");
    expect(restored.values.name).toBe("Keep me");
    expect(restored.rememberedCustomValues).toEqual(
      rememberedCustomValues,
    );
    expect(buildV1ToV2OptionsFromDialogValues(restored.values)).toEqual({
      name: "Keep me",
      ...V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
    });
  });

  it("style and field edits still clear stale validation and operation errors", () => {
    const state = applyUpgradeScoreToV2OperationError(
      applyUpgradeScoreToV2Validation(
        createInitialUpgradeScoreToV2FormState(
          "New",
          createDefaultV1ToV2UpgradePreferences(),
        ),
        "invalid-release-lead",
      ),
      "failed",
    );
    const next = editUpgradeScoreToV2FormField(
      state,
      "releaseLeadMs",
      "44",
    );
    const selected = selectV1ToV2SustainStyle(next, "connected");

    expect(next.selectedStyle).toBe("custom");
    expect(next.operationError).toBe("");
    expect(next.validationError).toBeNull();
    expect(selected.operationError).toBe("");
    expect(selected.validationError).toBeNull();
  });

  it("Custom sends exactly five entered numeric settings plus the generated name", () => {
    const options = buildV1ToV2OptionsFromDialogValues({
      name: "Custom",
      minimumSustainGapMs: "333",
      releaseLeadMs: "22",
      restGapThresholdMs: "1444",
      maxDurationMs: "1333",
      finalGroupDurationMs: "444",
    });

    expect(options).toEqual({ name: "Custom", ...rememberedCustomValues });
    expect(Object.keys(options)).toHaveLength(6);
  });
});

describe("V1 to V2 dense warning decision", () => {
  it("depends only on dense onset timing", () => {
    expect(
      shouldShowV1ToV2DenseWarning({
        isDenseTiming: true,
        isPolyphonic: false,
        multiNoteGroupRatio: 0,
        typicalGapMs: 160,
      }),
    ).toBe(true);
    expect(
      shouldShowV1ToV2DenseWarning({
        isDenseTiming: false,
        isPolyphonic: true,
        multiNoteGroupRatio: 1,
        typicalGapMs: 1000,
      }),
    ).toBe(false);
  });
});
