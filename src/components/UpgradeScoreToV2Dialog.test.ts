import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Dialog from "@radix-ui/react-dialog";
import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import {
  createInitialUpgradeScoreToV2FormState,
  selectV1ToV2SustainStyle,
} from "../lib/v1ToV2DialogModel";
import type { Song } from "../types/score";
import {
  getUpgradeScoreToV2SubmissionResultState,
  runSingleFlightScoreUpgrade,
  UpgradeScoreToV2Form,
} from "./UpgradeScoreToV2Dialog";

const text = uiText["en-US"].library.upgradeToV2;
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

function renderForm(
  formState = createInitialUpgradeScoreToV2FormState("Dense V2"),
  isCreating = false,
) {
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
        sourceSong: denseSong,
        text,
        validationId: "validation",
      }),
    ),
  );
}

describe("UpgradeScoreToV2Dialog", () => {
  it("renders advisory dense warning without protected-mode language", () => {
    const markup = renderForm();

    expect(markup).toContain(text.denseWarning);
    expect(markup).toContain(
      "The current style will add about 3 sustained notes.",
    );
    expect(markup.toLowerCase()).not.toContain("protected");
  });

  it("updates the exact estimate when the visible style changes", () => {
    const initial = createInitialUpgradeScoreToV2FormState("Dense V2");
    const conservative = selectV1ToV2SustainStyle(
      initial,
      "conservative",
    );
    const connected = selectV1ToV2SustainStyle(initial, "connected");

    expect(renderForm(conservative)).toContain(
      "The current style will add about 2 sustained notes.",
    );
    expect(renderForm(connected)).toContain(
      "The current style will add about 5 sustained notes.",
    );
  });

  it("renders no numeric controls for preset styles", () => {
    const markup = renderForm();
    expect(markup).not.toContain('type="number"');
  });

  it("renders exactly five numeric controls and no checkbox for Custom", () => {
    const custom = selectV1ToV2SustainStyle(
      createInitialUpgradeScoreToV2FormState("Dense V2"),
      "custom",
    );
    const markup = renderForm(custom);

    expect(markup.match(/type="number"/g)).toHaveLength(5);
    expect(markup).not.toContain('type="checkbox"');
  });

  it("disables controls while creating", () => {
    const markup = renderForm(
      createInitialUpgradeScoreToV2FormState("Dense V2"),
      true,
    );
    expect(markup).toContain("disabled");
    expect(markup).toContain(text.creating);
  });

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
});
