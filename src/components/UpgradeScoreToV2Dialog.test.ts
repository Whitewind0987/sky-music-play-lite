import * as Dialog from "@radix-ui/react-dialog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import { getV1ToV2ConversionValidationError } from "../lib/v1ToV2Conversion";
import {
  buildV1ToV2OptionsFromDialogValues,
  getEditedUpgradeScoreToV2FormState,
  getUpgradeScoreToV2SubmissionResultState,
  getDefaultUpgradeScoreToV2FormValues,
  runSingleFlightScoreUpgrade,
  UpgradeScoreToV2Form,
} from "./UpgradeScoreToV2Dialog";

describe("UpgradeScoreToV2Dialog form model", () => {
  it("uses localized default names and required numeric defaults", () => {
    expect(
      getDefaultUpgradeScoreToV2FormValues(
        "原曲名",
        uiText["zh-CN"].library.upgradeToV2,
      ),
    ).toEqual({
      name: "原曲名（V2 长音版）",
      overlapMs: "40",
      restGapThresholdMs: "2000",
      maxDurationMs: "2000",
      finalGroupDurationMs: "500",
    });
    expect(
      getDefaultUpgradeScoreToV2FormValues(
        "Original Name",
        uiText["en-US"].library.upgradeToV2,
      ).name,
    ).toBe("Original Name (V2 Long Note)");
  });

  it("keeps empty numeric inputs invalid instead of coercing them to zero", () => {
    const options = buildV1ToV2OptionsFromDialogValues({
      name: "Copy",
      overlapMs: "",
      restGapThresholdMs: "2000",
      maxDurationMs: "2000",
      finalGroupDurationMs: "500",
    });

    expect(Number.isNaN(options.overlapMs)).toBe(true);
    expect(getV1ToV2ConversionValidationError(options)).toBe(
      "invalid-overlap",
    );
  });

  it("reports empty names and a final duration above the maximum", () => {
    expect(
      getV1ToV2ConversionValidationError(
        buildV1ToV2OptionsFromDialogValues({
          name: " ",
          overlapMs: "40",
          restGapThresholdMs: "2000",
          maxDurationMs: "2000",
          finalGroupDurationMs: "500",
        }),
      ),
    ).toBe("empty-name");
    expect(
      getV1ToV2ConversionValidationError(
        buildV1ToV2OptionsFromDialogValues({
          name: "Copy",
          overlapMs: "40",
          restGapThresholdMs: "2000",
          maxDurationMs: "400",
          finalGroupDurationMs: "500",
        }),
      ),
    ).toBe("final-duration-exceeds-maximum");
  });

  it("clears stale validation and operation errors after any field edit", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = getDefaultUpgradeScoreToV2FormValues("Original", text);
    const nextValues = { ...values, restGapThresholdMs: "2500" };

    expect(
      getEditedUpgradeScoreToV2FormState(
        {
          operationError: "storage failed",
          validationError: "invalid-rest-gap-threshold",
          values,
        },
        nextValues,
      ),
    ).toEqual({
      operationError: "",
      validationError: null,
      values: nextValues,
    });
  });

  it("validates the rest-gap threshold from dialog values", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = getDefaultUpgradeScoreToV2FormValues("Original", text);

    expect(
      getV1ToV2ConversionValidationError(
        buildV1ToV2OptionsFromDialogValues({
          ...values,
          restGapThresholdMs: "60001",
        }),
      ),
    ).toBe("invalid-rest-gap-threshold");
  });

  it("preserves values after failure or duplicate and closes only on success", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = getDefaultUpgradeScoreToV2FormValues("Original", text);

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

  it("associates the rest-gap help text with its input without an error", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = {
      ...getDefaultUpgradeScoreToV2FormValues("Original", text),
      restGapThresholdMs: "2345",
    };
    const markup = renderToStaticMarkup(
      createElement(
        Dialog.Root,
        { open: true },
        createElement(UpgradeScoreToV2Form, {
          descriptionId: "description",
          errorMessage: "",
          isCreating: false,
          onCancel: () => {},
          onSubmit: () => {},
          onValuesChange: () => {},
          text,
          validationError: null,
          validationId: "validation",
          values,
        }),
      ),
    );
    const helpId = markup.match(/<small id="([^"]+)">/)?.[1];
    const restGapInput = markup.match(
      /<input[^>]*value="2345"[^>]*>/,
    )?.[0];

    if (!helpId || !restGapInput) {
      throw new Error("Expected rest-gap help text and input markup.");
    }

    expect(restGapInput).toContain(`aria-describedby="${helpId}"`);
    expect(markup).toContain(
      `<small id="${helpId}">${text.restGapThresholdHelp}</small>`,
    );
  });

  it("combines rest-gap help and error IDs in aria-describedby", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = {
      ...getDefaultUpgradeScoreToV2FormValues("Original", text),
      restGapThresholdMs: "24",
    };
    const markup = renderToStaticMarkup(
      createElement(
        Dialog.Root,
        { open: true },
        createElement(UpgradeScoreToV2Form, {
          descriptionId: "description",
          errorMessage: text.validation.invalidRestGapThreshold,
          isCreating: false,
          onCancel: () => {},
          onSubmit: () => {},
          onValuesChange: () => {},
          text,
          validationError: "invalid-rest-gap-threshold",
          validationId: "validation",
          values,
        }),
      ),
    );
    const helpId = markup.match(/<small id="([^"]+)">/)?.[1];
    const restGapInput = markup.match(
      /<input[^>]*value="24"[^>]*>/,
    )?.[0];

    if (!helpId || !restGapInput) {
      throw new Error("Expected rest-gap help text and input markup.");
    }

    expect(restGapInput).toContain(
      `aria-describedby="${helpId} validation"`,
    );
    expect(markup).toContain(
      `<small id="${helpId}">${text.restGapThresholdHelp}</small>`,
    );
  });

  it("keeps error-only duration descriptions free of malformed IDs", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = {
      ...getDefaultUpgradeScoreToV2FormValues("Original", text),
      overlapMs: "501",
    };
    const markup = renderToStaticMarkup(
      createElement(
        Dialog.Root,
        { open: true },
        createElement(UpgradeScoreToV2Form, {
          descriptionId: "description",
          errorMessage: text.validation.invalidOverlap,
          isCreating: false,
          onCancel: () => {},
          onSubmit: () => {},
          onValuesChange: () => {},
          text,
          validationError: "invalid-overlap",
          validationId: "validation",
          values,
        }),
      ),
    );
    const overlapInput = markup.match(
      /<input[^>]*value="501"[^>]*>/,
    )?.[0];
    const describedByValues = Array.from(
      markup.matchAll(/aria-describedby="([^"]*)"/g),
      (match) => match[1],
    );

    if (!overlapInput) {
      throw new Error("Expected overlap input markup.");
    }

    expect(overlapInput).toContain('aria-describedby="validation"');
    expect(markup).not.toContain("undefined");
    describedByValues.forEach((describedBy) => {
      expect(describedBy).toBe(describedBy.trim());
      expect(describedBy).not.toMatch(/\s{2,}/);
    });
  });

  it("renders accessible validation and disables every form control while creating", () => {
    const text = uiText["en-US"].library.upgradeToV2;
    const values = getDefaultUpgradeScoreToV2FormValues("Original", text);
    const markup = renderToStaticMarkup(
      createElement(
        Dialog.Root,
        { open: true },
        createElement(UpgradeScoreToV2Form, {
          descriptionId: "description",
          errorMessage: text.validation.finalDurationExceedsMaximum,
          isCreating: true,
          onCancel: () => {},
          onSubmit: () => {},
          onValuesChange: () => {},
          text,
          validationError: "final-duration-exceeds-maximum",
          validationId: "validation",
          values,
        }),
      ),
    );

    expect(markup).toContain('value="Original (V2 Long Note)"');
    expect(markup.match(/<input/g)).toHaveLength(5);
    expect(markup).toContain('value="2000"');
    expect(markup).toContain(text.restGapThresholdHelp);
    expect(markup).toContain("<fieldset disabled");
    expect(markup.match(/<button[^>]*disabled/g)).toHaveLength(2);
    expect(markup).toContain(text.creating);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(text.validation.finalDurationExceedsMaximum);
    expect(markup).toContain('aria-invalid="true"');
  });
});
