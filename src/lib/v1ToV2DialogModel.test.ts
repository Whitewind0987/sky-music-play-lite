import { describe, expect, it } from "vitest";
import { uiText } from "../i18n/uiText";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState as createModelState,
  editUpgradeScoreToV2FormField as editModelField,
  getUpgradeScoreToV2Preferences,
  restoreRecommendedUpgradeScoreToV2State as restoreModelState,
  selectV1ToV2SustainStyle as selectModelStyle,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2DialogModel";
import { createDefaultV1ToV2UpgradePreferences } from "./v1ToV2UpgradePreferences";
import type {
  V1ToV2SustainStyle,
  V1ToV2UpgradePreferences,
} from "../types/v1ToV2Upgrade";

const generatedNameTemplates =
  uiText["en-US"].library.upgradeToV2.generatedNames;

const rememberedCustomValues = {
  minimumSustainGapMs: 333,
  releaseLeadMs: 22,
  restGapThresholdMs: 1444,
  maxDurationMs: 1333,
  finalGroupDurationMs: 444,
};

function createInitialUpgradeScoreToV2FormState(
  name: string,
  rawPreferences = createDefaultV1ToV2UpgradePreferences(),
) {
  const state = createModelState(
    "Source",
    generatedNameTemplates,
    rawPreferences,
  );

  return {
    ...state,
    isNameManuallyEdited: true,
    values: { ...state.values, name },
  };
}

function selectV1ToV2SustainStyle(
  state: ReturnType<typeof createModelState>,
  style: V1ToV2SustainStyle,
) {
  return selectModelStyle(state, style, generatedNameTemplates);
}

function editUpgradeScoreToV2FormField(
  state: ReturnType<typeof createModelState>,
  field: Parameters<typeof editModelField>[1],
  value: string,
) {
  return editModelField(state, field, value, generatedNameTemplates);
}

function restoreRecommendedUpgradeScoreToV2State(
  state: ReturnType<typeof createModelState>,
) {
  return restoreModelState(state, generatedNameTemplates);
}

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
  it("updates every automatic-name transition and never stores a name in preferences", () => {
    const connected = createModelState(
      "Test",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
      preferences("connected"),
    );
    const balanced = selectModelStyle(
      connected,
      "balanced",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const conservative = selectModelStyle(
      balanced,
      "conservative",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const custom = selectModelStyle(
      conservative,
      "custom",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const validEdit = editModelField(
      custom,
      "minimumSustainGapMs",
      "350",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const invalidEdit = editModelField(
      validEdit,
      "releaseLeadMs",
      "",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const validAgain = editModelField(
      invalidEdit,
      "releaseLeadMs",
      "22",
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );
    const restored = restoreModelState(
      validAgain,
      uiText["zh-CN"].library.upgradeToV2.generatedNames,
    );

    expect(connected.values.name).toBe("Test（V2 连贯版）");
    expect(balanced.values.name).toBe("Test（V2 均衡版）");
    expect(conservative.values.name).toBe("Test（V2 保守版）");
    expect(custom.values.name).toBe(
      "Test（V2 自定义 333-22-1444-1333-444）",
    );
    expect(validEdit.values.name).toBe(
      "Test（V2 自定义 350-22-1444-1333-444）",
    );
    expect(invalidEdit.values.name).toBe(validEdit.values.name);
    expect(validAgain.values.name).toBe(
      "Test（V2 自定义 350-22-1444-1333-444）",
    );
    expect(restored.values.name).toBe("Test（V2 连贯版）");
    expect(getUpgradeScoreToV2Preferences(validAgain)).not.toHaveProperty(
      "name",
    );
  });

  it("generates each newly opened source song's own name", () => {
    expect(
      createModelState("First", generatedNameTemplates).values.name,
    ).toBe("First (V2 Connected)");
    expect(
      createModelState("Second", generatedNameTemplates).values.name,
    ).toBe("Second (V2 Connected)");
  });

  it("regenerates automatic names for styles and valid Custom values", () => {
    const initial = createModelState(
      "Source",
      generatedNameTemplates,
      preferences("balanced"),
    );
    const connected = selectModelStyle(
      initial,
      "connected",
      generatedNameTemplates,
    );
    const custom = editModelField(
      connected,
      "minimumSustainGapMs",
      "333",
      generatedNameTemplates,
    );

    expect(initial.values.name).toBe("Source (V2 Balanced)");
    expect(connected.values.name).toBe("Source (V2 Connected)");
    expect(custom.values.name).toBe(
      "Source (V2 Custom 333-15-2000-2000-800)",
    );
  });

  it("marks any name edit as manual and preserves it across style changes and restore", () => {
    const initial = createModelState(
      "Source",
      generatedNameTemplates,
      preferences("balanced"),
    );
    const manual = editModelField(
      initial,
      "name",
      initial.values.name,
      generatedNameTemplates,
    );
    const custom = selectModelStyle(
      manual,
      "custom",
      generatedNameTemplates,
    );
    const restored = restoreModelState(custom, generatedNameTemplates);

    expect(manual.isNameManuallyEdited).toBe(true);
    expect(custom.values.name).toBe(initial.values.name);
    expect(restored.values.name).toBe(initial.values.name);
  });

  it("preserves a manual name during valid and invalid Custom edits", () => {
    const automatic = createModelState(
      "Source",
      generatedNameTemplates,
      preferences("custom"),
    );
    const manual = editModelField(
      automatic,
      "name",
      "My version",
      generatedNameTemplates,
    );
    const valid = editModelField(
      manual,
      "minimumSustainGapMs",
      "350",
      generatedNameTemplates,
    );
    const invalid = editModelField(
      valid,
      "releaseLeadMs",
      "",
      generatedNameTemplates,
    );

    expect(valid.values.name).toBe("My version");
    expect(invalid.values.name).toBe("My version");
  });

  it("keeps the previous automatic Custom name while an edited value is invalid", () => {
    const initial = createModelState(
      "Source",
      generatedNameTemplates,
      preferences("custom"),
    );
    const invalid = editModelField(
      initial,
      "minimumSustainGapMs",
      "",
      generatedNameTemplates,
    );

    expect(invalid.values.minimumSustainGapMs).toBe("");
    expect(invalid.values.name).toBe(
      "Source (V2 Custom 333-22-1444-1333-444)",
    );
  });
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
