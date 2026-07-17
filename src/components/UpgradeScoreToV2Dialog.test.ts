import * as Dialog from "@radix-ui/react-dialog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import type { Song } from "../types/score";
import {
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2ChordSustain,
  editUpgradeScoreToV2FormField,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  type UpgradeScoreToV2FormState,
} from "../lib/v1ToV2DialogModel";
import {
  getUpgradeScoreToV2SubmissionResultState,
  runSingleFlightScoreUpgrade,
  UpgradeScoreToV2Form,
} from "./UpgradeScoreToV2Dialog";

const text = uiText["en-US"].library.upgradeToV2;

function createSourceSong(
  songNotes: Song["songNotes"] = [
    { time: 0, key: "1Key0" },
    { time: 600, key: "1Key1" },
    { time: 1800, key: "1Key2" },
  ],
): Song {
  return {
    bitsPerPage: 16,
    bpm: 120,
    formatVersion: 1,
    isComposed: false,
    name: "Original",
    pitchLevel: 0,
    songNotes,
  };
}

function renderForm({
  errorMessage = "",
  formState = createInitialUpgradeScoreToV2FormState(
    "Original (V2 Long Note)",
  ),
  isCreating = false,
  sourceSong = createSourceSong(),
}: {
  errorMessage?: string;
  formState?: UpgradeScoreToV2FormState;
  isCreating?: boolean;
  sourceSong?: Song;
} = {}) {
  return renderToStaticMarkup(
    createElement(
      Dialog.Root,
      { open: true },
      createElement(UpgradeScoreToV2Form, {
        descriptionId: "description",
        errorMessage,
        formState,
        isCreating,
        onCancel: () => {},
        onChordSustainChange: () => {},
        onFieldChange: () => {},
        onRestoreRecommended: () => {},
        onStyleChange: () => {},
        onSubmit: () => {},
        sourceSong,
        text,
        validationId: "validation",
      }),
    ),
  );
}

function getInputMarkup(markup: string, value: string) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inputMarkup = markup.match(
    new RegExp(`<input[^>]*value="${escapedValue}"[^>]*>`),
  )?.[0];

  if (!inputMarkup) {
    throw new Error(`Expected input markup for value ${value}.`);
  }

  return inputMarkup;
}

describe("UpgradeScoreToV2Dialog", () => {
  it("disables through one async submission and ignores duplicate submission", async () => {
    let resolveUpgrade: (
      result: { status: "failed"; message: string },
    ) => void = () => {};
    const inProgressRef = { current: false };
    const states: boolean[] = [];
    const runUpgrade = vi.fn(
      () =>
        new Promise<{ status: "failed"; message: string }>((resolve) => {
          resolveUpgrade = resolve;
        }),
    );

    const first = runSingleFlightScoreUpgrade(
      inProgressRef,
      (state) => states.push(state),
      runUpgrade,
    );
    const duplicate = await runSingleFlightScoreUpgrade(
      inProgressRef,
      (state) => states.push(state),
      runUpgrade,
    );

    expect(duplicate).toBeNull();
    expect(runUpgrade).toHaveBeenCalledTimes(1);
    expect(inProgressRef.current).toBe(true);
    resolveUpgrade({ message: "write failed", status: "failed" });
    await expect(first).resolves.toEqual({
      message: "write failed",
      status: "failed",
    });
    expect(states).toEqual([true, false]);
    expect(inProgressRef.current).toBe(false);
  });

  it("preserves values after failure or duplicate and closes only on success", () => {
    const values =
      createInitialUpgradeScoreToV2FormState("Generated").values;

    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        message: "storage failed",
        status: "failed",
      }),
    ).toEqual({
      operationError: "storage failed",
      shouldClose: false,
      values,
    });
    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        message: "duplicate",
        status: "duplicate",
      }),
    ).toEqual({
      operationError: "duplicate",
      shouldClose: false,
      values,
    });
    expect(
      getUpgradeScoreToV2SubmissionResultState(values, {
        librarySong: {
          id: "local-copy",
          importedAt: 1,
          metadata: {
            bitsPerPage: 16,
            bpm: 120,
            fingerprint: "copy",
            formatVersion: 2,
            isComposed: false,
            lastNoteTimeMs: 0,
            name: values.name,
            noteCount: 1,
            noteGroupCount: 1,
            pitchLevel: 0,
          },
          source: "local-import",
        },
        status: "created",
      }),
    ).toMatchObject({ operationError: "", shouldClose: true, values });
  });

  it("renders Balanced by default without custom numeric controls", () => {
    const markup = renderForm();

    expect(markup).toContain(text.sustainStyles.conservative.label);
    expect(markup).toContain(text.sustainStyles.balanced.label);
    expect(markup).toContain(text.sustainStyles.connected.label);
    expect(markup).toContain(text.sustainStyles.custom.label);
    expect(getInputMarkup(markup, "balanced")).toContain('checked=""');
    expect(markup).toContain(text.sustainStyles.balanced.description);
    expect(markup).toContain(
      "Only gaps from 0.25 to 1.2 seconds are sustained, releasing about 30 ms before the next group; each note can last up to about 1.2 seconds.",
    );
    expect(markup).toContain(
      "A simpler score was detected, so the selected sustain style will be used. About 3 sustained notes will be generated.",
    );
    expect(markup).not.toContain('type="number"');
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain(text.customSettingsLabel);
    expect(markup).not.toContain("Advanced Settings");
    expect(markup).not.toContain(text.restoreRecommended);
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain('role="alert"');
  });

  it.each(["conservative", "connected"] as const)(
    "does not render numeric controls for %s",
    (style) => {
      const formState = selectV1ToV2SustainStyle(
        createInitialUpgradeScoreToV2FormState("Generated"),
        style,
      );
      const markup = renderForm({ formState });

      expect(getInputMarkup(markup, style)).toContain('checked=""');
      expect(markup).toContain(text.sustainStyles[style].description);
      expect(markup).not.toContain('type="number"');
      expect(markup).not.toContain('type="checkbox"');
      expect(markup).not.toContain(text.customSettingsLabel);
      expect(markup).not.toContain(text.restoreRecommended);
    },
  );

  it("renders all five numeric controls and restore only for Custom", () => {
    const formState = selectV1ToV2SustainStyle(
      selectV1ToV2SustainStyle(
        createInitialUpgradeScoreToV2FormState("Generated"),
        "connected",
      ),
      "custom",
    );
    const markup = renderForm({ formState });

    expect(getInputMarkup(markup, "custom")).toContain('checked=""');
    expect(markup).toContain(text.sustainStyles.custom.description);
    expect(markup).toContain(text.customSettingsLabel);
    expect(markup.match(/type="number"/g)).toHaveLength(5);
    expect(markup.match(/type="checkbox"/g)).toHaveLength(1);
    expect(markup).toContain(text.restoreRecommended);
    expect(markup).not.toContain("<details");
    ["150", "15", "2000", "800"].forEach((value) => {
      expect(markup).toContain(`value="${value}"`);
    });
    expect(markup).toContain(text.minimumSustainGapLabel);
    expect(markup).toContain(text.releaseLeadLabel);
    expect(markup).toContain(text.allowChordSustainLabel);
  });

  it("hides custom controls after switching to Balanced or restoring", () => {
    const customState = editUpgradeScoreToV2FormField(
      selectV1ToV2SustainStyle(
        createInitialUpgradeScoreToV2FormState("Keep name"),
        "custom",
      ),
      "maxDurationMs",
      "3456",
    );
    const balancedState = selectV1ToV2SustainStyle(
      customState,
      "balanced",
    );
    const restoredState = restoreRecommendedUpgradeScoreToV2State({
      ...customState,
      operationError: "duplicate",
      validationError: "invalid-maximum-duration",
    });

    [balancedState, restoredState].forEach((formState) => {
      const markup = renderForm({ formState });

      expect(formState).toMatchObject({
        operationError: "",
        selectedStyle: "balanced",
        validationError: null,
        values: {
          allowChordSustainInProtectedMode: false,
          name: "Keep name",
          minimumSustainGapMs: "250",
          releaseLeadMs: "30",
          restGapThresholdMs: "1200",
          maxDurationMs: "1200",
          finalGroupDurationMs: "500",
        },
      });
      expect(markup).not.toContain('type="number"');
      expect(markup).not.toContain('type="checkbox"');
      expect(markup).not.toContain(text.customSettingsLabel);
      expect(markup).not.toContain(text.restoreRecommended);
    });
  });

  it("renders neutral readable text for invalid custom values", () => {
    const customState = editUpgradeScoreToV2FormField(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "restGapThresholdMs",
      "",
    );
    const markup = renderForm({ formState: customState });

    expect(markup).toContain(text.activeValuesFallback);
    expect(markup).toContain(text.profileEstimateFallback);
    expect(markup).toContain(text.restGapThresholdHelp);
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Infinity");
    expect(markup).not.toContain("undefined");
  });

  it("associates protected chord help with the Custom checkbox", () => {
    const formState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "custom",
    );
    const markup = renderForm({ formState });
    const checkbox = markup.match(
      /<input[^>]*type="checkbox"[^>]*>/,
    )?.[0];
    const helpId = checkbox?.match(
      /aria-describedby="([^"]+)"/,
    )?.[1];

    expect(helpId).toBeTruthy();
    expect(helpId).not.toContain(" ");
    expect(markup).toContain(`<small id="${helpId}">`);
    expect(markup).toContain(text.allowChordSustainHelp);
  });

  it("renders protected profile text and updates the chord estimate", () => {
    const sourceSong = createSourceSong([
      { time: 0, key: "1Key0" },
      { time: 0, key: "1Key1" },
      { time: 600, key: "1Key2" },
      { time: 756, key: "1Key3" },
      { time: 912, key: "1Key4" },
      { time: 1068, key: "1Key5" },
    ]);
    const customState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "custom",
    );
    const enabledState = editUpgradeScoreToV2ChordSustain(
      customState,
      true,
    );

    expect(renderForm({ formState: customState, sourceSong })).toContain(
      "protected sustain detection is active. About 1 sustained notes will be generated.",
    );
    expect(renderForm({ formState: enabledState, sourceSong })).toContain(
      "protected sustain detection is active. About 3 sustained notes will be generated.",
    );
  });

  it("updates the estimate for numeric edits and ignores an empty name", () => {
    const initialState =
      createInitialUpgradeScoreToV2FormState("Generated");
    const editedState = editUpgradeScoreToV2FormField(
      initialState,
      "minimumSustainGapMs",
      "700",
    );
    const emptyNameState = editUpgradeScoreToV2FormField(
      initialState,
      "name",
      "",
    );

    expect(renderForm({ formState: editedState })).toContain(
      "About 2 sustained notes will be generated.",
    );
    expect(renderForm({ formState: emptyNameState })).toContain(
      "About 3 sustained notes will be generated.",
    );
  });

  it("associates readable help with a custom input without an error", () => {
    const customState = editUpgradeScoreToV2FormField(
      createInitialUpgradeScoreToV2FormState("Generated"),
      "restGapThresholdMs",
      "2500",
    );
    const markup = renderForm({ formState: customState });
    const restGapInput = getInputMarkup(markup, "2500");
    const helpId = restGapInput.match(
      /aria-describedby="([^"]+)"/,
    )?.[1];

    if (!helpId) {
      throw new Error("Expected rest-gap help aria-describedby.");
    }

    expect(helpId).not.toContain(" ");
    expect(markup).toContain(`<small id="${helpId}">`);
    expect(markup).toContain(text.restGapThresholdHelp);
  });

  it("keeps help and validation IDs associated without malformed whitespace", () => {
    const invalidState = {
      ...editUpgradeScoreToV2FormField(
        createInitialUpgradeScoreToV2FormState("Generated"),
        "restGapThresholdMs",
        "24",
      ),
      validationError: "invalid-rest-gap-threshold" as const,
    };
    const markup = renderForm({
      errorMessage: text.validation.invalidRestGapThreshold,
      formState: invalidState,
    });
    const restGapInput = getInputMarkup(markup, "24");
    const describedBy = restGapInput.match(
      /aria-describedby="([^"]+)"/,
    )?.[1];

    if (!describedBy) {
      throw new Error("Expected rest-gap aria-describedby.");
    }

    const [helpId, errorId] = describedBy.split(" ");

    expect(helpId).toBeTruthy();
    expect(errorId).toBe("validation");
    expect(markup).toContain(`<small id="${helpId}">`);
    expect(markup).not.toContain("undefined");
    Array.from(
      markup.matchAll(/aria-describedby="([^"]*)"/g),
      (match) => match[1],
    ).forEach((value) => {
      expect(value).toBe(value.trim());
      expect(value).not.toMatch(/\s{2,}/);
    });
  });

  it("disables all visible Custom controls while creating", () => {
    const formState = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState(
        "Original (V2 Long Note)",
      ),
      "custom",
    );
    const markup = renderForm({ formState, isCreating: true });
    const styleFieldset = markup.match(
      /<fieldset[^>]*class="score-upgrade-style-fieldset"[^>]*>/,
    )?.[0];
    const customFieldset = markup.match(
      /<fieldset[^>]*class="score-upgrade-custom-fields"[^>]*>/,
    )?.[0];
    const restoreButton = markup.match(
      /<button[^>]*class="score-upgrade-restore-button"[^>]*>/,
    )?.[0];

    expect(getInputMarkup(markup, "Original (V2 Long Note)")).toContain(
      "disabled",
    );
    expect(styleFieldset).toContain("disabled");
    expect(customFieldset).toContain("disabled");
    expect(restoreButton).toContain("disabled");
    expect(
      markup.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0],
    ).toContain("disabled");
    expect(restoreButton).toContain('type="button"');
    expect(markup.match(/<button[^>]*disabled/g)).toHaveLength(3);
    expect(markup).toContain(text.creating);
  });
});
