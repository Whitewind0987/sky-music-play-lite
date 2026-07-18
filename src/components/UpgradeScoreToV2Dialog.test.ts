import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Dialog from "@radix-ui/react-dialog";
import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import {
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState as createModelState,
  selectV1ToV2SustainStyle as selectModelStyle,
} from "../lib/v1ToV2DialogModel";
import { createDefaultV1ToV2UpgradePreferences } from "../lib/v1ToV2UpgradePreferences";
import type { Song } from "../types/score";
import type {
  V1ToV2SustainStyle,
  V1ToV2UpgradePreferences,
} from "../types/v1ToV2Upgrade";
import {
  getUpgradeDialogFieldChangeResult,
  getUpgradeDialogRestoreRecommendedResult,
  getUpgradeDialogStyleChangeResult,
  getUpgradeScoreToV2SubmissionResultState,
  runSingleFlightScoreUpgrade,
  UpgradeScoreToV2Form,
} from "./UpgradeScoreToV2Dialog";

const text = uiText["en-US"].library.upgradeToV2;
const generatedNameTemplates = text.generatedNames;
const denseSong: Song = {
  formatVersion: 1,
  name: "Dense",
  bpm: 120,
  bitsPerPage: 16,
  pitchLevel: 0,
  isComposed: false,
  songNotes: [
    { time: 0, key: "Key0" },
    { time: 160, key: "Key1" },
    { time: 420, key: "Key2" },
    { time: 840, key: "Key3" },
    { time: 1000, key: "Key4" },
  ],
};
const sparseMonophonicSong: Song = {
  ...denseSong,
  name: "Sparse",
  songNotes: [
    { time: 0, key: "Key0" },
    { time: 1000, key: "Key1" },
    { time: 2000, key: "Key2" },
  ],
};
const sparsePolyphonicSong: Song = {
  ...denseSong,
  name: "Sparse Chords",
  songNotes: [
    { time: 0, key: "Key0" },
    { time: 0, key: "Key1" },
    { time: 1000, key: "Key2" },
    { time: 1000, key: "Key3" },
    { time: 2000, key: "Key4" },
    { time: 2000, key: "Key5" },
  ],
};
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

function renderForm({
  formState = createInitialUpgradeScoreToV2FormState("Dense V2"),
  isCreating = false,
  sourceSong = denseSong,
}: {
  formState?: ReturnType<
    typeof createInitialUpgradeScoreToV2FormState
  >;
  isCreating?: boolean;
  sourceSong?: Song;
} = {}) {
  return renderToStaticMarkup(
    createElement(
      Dialog.Root,
      { open: true },
      createElement(UpgradeScoreToV2Form, {
        descriptionId: "description",
        errorMessage: "",
        formState,
        isCreating,
        onCancel: vi.fn(),
        onFieldChange: vi.fn(),
        onRestoreRecommended: vi.fn(),
        onStyleChange: vi.fn(),
        onSubmit: vi.fn(),
        sourceSong,
        text,
        validationId: "validation",
      }),
    ),
  );
}

function expectStyleChecked(markup: string, style: V1ToV2SustainStyle) {
  expect(markup).toMatch(
    new RegExp(
      `(?:checked=""[^>]*value="${style}"|value="${style}"[^>]*checked="")`,
    ),
  );
}

describe("UpgradeScoreToV2Dialog rendering", () => {
  it("renders first-use and persisted generated names in the input", () => {
    const firstUse = createModelState(
      "Test",
      generatedNameTemplates,
    );
    const balanced = createModelState(
      "Test",
      generatedNameTemplates,
      preferences("balanced"),
    );
    const custom = createModelState(
      "Test",
      generatedNameTemplates,
      preferences("custom"),
    );

    expect(renderForm({ formState: firstUse })).toContain(
      'value="Test (V2 Connected)"',
    );
    expect(renderForm({ formState: balanced })).toContain(
      'value="Test (V2 Balanced)"',
    );
    expect(renderForm({ formState: custom })).toContain(
      'value="Test (V2 Custom 333-22-1444-1333-444)"',
    );
  });

  it("checks Connected for first-use defaults", () => {
    expectStyleChecked(renderForm(), "connected");
  });

  it.each([
    "conservative",
    "balanced",
    "connected",
    "custom",
  ] as const)("checks persisted %s", (selectedStyle) => {
    const formState = createInitialUpgradeScoreToV2FormState(
      "Dense V2",
      preferences(selectedStyle),
    );

    expectStyleChecked(renderForm({ formState }), selectedStyle);
  });

  it("renders exactly five Custom numeric fields and no checkbox", () => {
    const formState = createInitialUpgradeScoreToV2FormState(
      "Dense V2",
      preferences("custom"),
    );
    const markup = renderForm({ formState });

    expect(markup.match(/type="number"/g)).toHaveLength(5);
    expect(markup).not.toContain('type="checkbox"');
  });

  it.each(["conservative", "balanced", "connected"] as const)(
    "renders no numeric fields for %s",
    (selectedStyle) => {
      const formState = createInitialUpgradeScoreToV2FormState(
        "Dense V2",
        preferences(selectedStyle),
      );

      expect(renderForm({ formState })).not.toContain('type="number"');
    },
  );

  it("shows the warning for dense timing without changing Connected", () => {
    const markup = renderForm();

    expect(markup).toContain(text.denseWarning);
    expectStyleChecked(markup, "connected");
  });

  it.each([
    ["sparse monophonic input", sparseMonophonicSong],
    ["sparse polyphonic chords", sparsePolyphonicSong],
  ])("does not warn for %s", (_, sourceSong) => {
    expect(renderForm({ sourceSong })).not.toContain(text.denseWarning);
  });

  it("keeps preview options and estimate tied to the visible style", () => {
    const initial = createInitialUpgradeScoreToV2FormState("Dense V2");
    const conservative = selectV1ToV2SustainStyle(
      initial,
      "conservative",
    );
    const restored =
      getUpgradeDialogRestoreRecommendedResult(
        conservative,
        generatedNameTemplates,
      ).formState;

    expect(renderForm({ formState: conservative })).toContain(
      "The current style will add about 2 sustained notes.",
    );
    expect(renderForm({ formState: restored })).toContain(
      "The current style will add about 5 sustained notes.",
    );
    expect(buildV1ToV2OptionsFromDialogValues(restored.values)).toEqual({
      name: "Dense V2",
      minimumSustainGapMs: 150,
      releaseLeadMs: 15,
      restGapThresholdMs: 2000,
      maxDurationMs: 2000,
      finalGroupDurationMs: 800,
    });
  });

  it("disables controls while creating", () => {
    const markup = renderForm({ isCreating: true });
    expect(markup).toContain("disabled");
    expect(markup).toContain(text.creating);
  });
});

describe("UpgradeScoreToV2Dialog preference transitions", () => {
  it("updates automatic names through style and valid Custom transitions", () => {
    const connected = createModelState(
      "Test",
      generatedNameTemplates,
    );
    const balanced = getUpgradeDialogStyleChangeResult(
      connected,
      "balanced",
      generatedNameTemplates,
    ).formState;
    const custom = getUpgradeDialogStyleChangeResult(
      balanced,
      "custom",
      generatedNameTemplates,
    ).formState;
    const valid = getUpgradeDialogFieldChangeResult(
      custom,
      "minimumSustainGapMs",
      "350",
      generatedNameTemplates,
    ).formState;
    const invalid = getUpgradeDialogFieldChangeResult(
      valid,
      "releaseLeadMs",
      "",
      generatedNameTemplates,
    ).formState;

    expect(balanced.values.name).toBe("Test (V2 Balanced)");
    expect(custom.values.name).toBe(
      "Test (V2 Custom 150-15-2000-2000-800)",
    );
    expect(valid.values.name).toBe(
      "Test (V2 Custom 350-15-2000-2000-800)",
    );
    expect(invalid.values.name).toBe(valid.values.name);
  });

  it("keeps a manually edited name through later component transitions", () => {
    const automatic = createModelState(
      "Test",
      generatedNameTemplates,
    );
    const manual = getUpgradeDialogFieldChangeResult(
      automatic,
      "name",
      automatic.values.name,
      generatedNameTemplates,
    ).formState;
    const balanced = getUpgradeDialogStyleChangeResult(
      manual,
      "balanced",
      generatedNameTemplates,
    ).formState;
    const custom = getUpgradeDialogFieldChangeResult(
      balanced,
      "minimumSustainGapMs",
      "350",
      generatedNameTemplates,
    ).formState;

    expect(manual.isNameManuallyEdited).toBe(true);
    expect(balanced.values.name).toBe(automatic.values.name);
    expect(custom.values.name).toBe(automatic.values.name);
  });
  it.each(["conservative", "balanced", "connected"] as const)(
    "immediately returns persisted %s selection while retaining Custom memory",
    (selectedStyle) => {
      const initial = createInitialUpgradeScoreToV2FormState(
        "New",
        preferences("custom"),
      );
      const result = getUpgradeDialogStyleChangeResult(
        initial,
        selectedStyle,
        generatedNameTemplates,
      );

      expect(result.preferences).toEqual(preferences(selectedStyle));
    },
  );

  it("selecting Custom immediately restores and persists saved Custom values", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("connected"),
    );
    const result = getUpgradeDialogStyleChangeResult(
      initial,
      "custom",
      generatedNameTemplates,
    );

    expect(result.preferences).toEqual(preferences("custom"));
    expect(
      buildV1ToV2OptionsFromDialogValues(result.formState.values),
    ).toEqual({ name: "New", ...rememberedCustomValues });
  });

  it("valid Custom edits produce numeric persisted values", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );
    const result = getUpgradeDialogFieldChangeResult(
      initial,
      "minimumSustainGapMs",
      "350",
      generatedNameTemplates,
    );

    expect(result.preferences).toEqual({
      selectedStyle: "custom",
      customValues: {
        ...rememberedCustomValues,
        minimumSustainGapMs: 350,
      },
    });
  });

  it("invalid Custom text remains visible but does not replace valid memory", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("custom"),
    );
    const result = getUpgradeDialogFieldChangeResult(
      initial,
      "minimumSustainGapMs",
      "",
      generatedNameTemplates,
    );

    expect(result.formState.values.minimumSustainGapMs).toBe("");
    expect(result.preferences).toEqual(preferences("custom"));
  });

  it("name edits never produce a preference update", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "Song A",
      preferences("balanced"),
    );
    const result = getUpgradeDialogFieldChangeResult(
      initial,
      "name",
      "Song B",
      generatedNameTemplates,
    );

    expect(result.preferences).toBeNull();
    expect(result.formState.values.name).toBe("Song B");
  });

  it("Restore Recommended persists Connected without erasing Custom memory", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "Keep",
      preferences("custom"),
    );
    const result = getUpgradeDialogRestoreRecommendedResult(
      initial,
      generatedNameTemplates,
    );

    expect(result.preferences).toEqual(preferences("connected"));
    expect(result.formState.values.name).toBe("Keep");
  });

  it("preference transitions are complete before a later cancel", () => {
    const initial = createInitialUpgradeScoreToV2FormState(
      "New",
      preferences("balanced"),
    );
    const result = getUpgradeDialogStyleChangeResult(
      initial,
      "conservative",
      generatedNameTemplates,
    );
    const onCancel = vi.fn();

    onCancel();
    expect(result.preferences).toEqual(preferences("conservative"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("UpgradeScoreToV2Dialog submission state", () => {
  it("keeps entered values and the dialog open after duplicate or failure", () => {
    const values = createInitialUpgradeScoreToV2FormState("Keep").values;
    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        status: "duplicate",
        message: "duplicate",
      }),
    ).toEqual({
      operationError: "duplicate",
      shouldClose: false,
      values,
    });
    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        status: "failed",
        message: "failed",
      }).shouldClose,
    ).toBe(false);
  });

  it("closes only on success and prevents duplicate submissions", async () => {
    const values = createInitialUpgradeScoreToV2FormState("Keep").values;
    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        status: "created",
        librarySong: {} as never,
      }).shouldClose,
    ).toBe(true);

    let resolve: (value: {
      status: "failed";
      message: string;
    }) => void = () => {};
    const pending = new Promise<{ status: "failed"; message: string }>(
      (currentResolve) => {
        resolve = currentResolve;
      },
    );
    const ref = { current: false };
    const run = vi.fn(() => pending);
    const first = runSingleFlightScoreUpgrade(ref, vi.fn(), run);
    const second = await runSingleFlightScoreUpgrade(
      ref,
      vi.fn(),
      run,
    );

    expect(second).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    resolve({ status: "failed", message: "done" });
    await first;
  });

  it("uses Connected as the safe default preference object", () => {
    expect(createDefaultV1ToV2UpgradePreferences().selectedStyle).toBe(
      "connected",
    );
  });
});
