import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Dialog from "@radix-ui/react-dialog";
import { describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import {
  buildSustainMelodyGenerationPlan,
  type SustainMelodyStyle,
} from "../lib/sustainMelodyGeneration";
import type { Song } from "../types/score";
import {
  createInitialSustainMelodyDialogState,
  editSustainMelodyDialogName,
  GenerateSustainMelodyForm,
  getSustainMelodySubmissionResultState,
  selectSustainMelodyDialogStyle,
} from "./GenerateSustainMelodyDialog";

const text = uiText["en-US"].library.generateSustainMelody;

function makeSong(times: number[], chord = false): Song {
  return {
    formatVersion: 1,
    name: "Source",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: times.flatMap((time, index) => [
      { time, key: `Key${index % 10}` },
      ...(chord ? [{ time, key: `Key${(index + 5) % 15}` }] : []),
    ]),
  };
}

function getPlan(source: Song, style: SustainMelodyStyle) {
  return buildSustainMelodyGenerationPlan(source, {
    name: "Generated",
    style,
  });
}

function renderForm(
  source: Song,
  style?: SustainMelodyStyle,
  isCreating = false,
) {
  let state = createInitialSustainMelodyDialogState(source, "Generated");
  if (style) {
    state = selectSustainMelodyDialogStyle(state, style);
  }
  const plan = getPlan(source, state.selectedStyle);
  return renderToStaticMarkup(
    createElement(
      Dialog.Root,
      { open: true },
      createElement(GenerateSustainMelodyForm, {
        descriptionId: "description",
        errorId: "error",
        errorMessage: "",
        isCreating,
        onCancel: vi.fn(),
        onNameChange: vi.fn(),
        onStyleChange: vi.fn(),
        onSubmit: vi.fn(),
        plan,
        state,
        text,
      }),
    ),
  );
}

describe("GenerateSustainMelodyDialog", () => {
  it.each([
    ["minimal", makeSong([0, 100, 200, 300], true)],
    ["smooth", makeSong([0, 350, 700])],
    ["melody", makeSong([0, 800, 1600])],
  ] as const)("visibly selects the recommended %s style", (style, source) => {
    const state = createInitialSustainMelodyDialogState(source, "Generated");
    const markup = renderForm(source);

    expect(state.selectedStyle).toBe(style);
    expect(markup).toMatch(
      new RegExp(`checked="" value="${style}"`),
    );
    expect(markup).toContain(text.recommendations[style]);
  });

  it("renders the title, warning, and exactly three styles", () => {
    const markup = renderForm(makeSong([0, 800, 1600]));
    expect(markup).toContain(text.title);
    expect(markup).toContain(text.description);
    expect(markup.match(/type="radio"/g)).toHaveLength(3);
    expect(markup).not.toContain("Custom");
  });

  it("manual selection changes the checked radio and exact plan statistics", () => {
    const source = makeSong([0, 78, 156, 312, 468, 624, 1248], true);
    const melodyMarkup = renderForm(source, "melody");
    const minimalMarkup = renderForm(source, "minimal");
    const melodyPlan = getPlan(source, "melody");
    const minimalPlan = getPlan(source, "minimal");

    expect(melodyMarkup).toContain('checked="" value="melody"');
    expect(minimalMarkup).toContain('checked="" value="minimal"');
    expect(melodyPlan.stats.selectedMelodyNoteCount).not.toBe(
      minimalPlan.stats.selectedMelodyNoteCount,
    );
    expect(minimalMarkup).toContain(
      `Melody notes kept: ${minimalPlan.stats.selectedMelodyNoteCount}`,
    );
  });

  it("the selected style reaches the final generated plan unchanged", () => {
    const source = makeSong([0, 300, 600]);
    const selected = selectSustainMelodyDialogStyle(
      createInitialSustainMelodyDialogState(source, "Generated"),
      "smooth",
    );
    const submitted = getPlan(source, selected.selectedStyle);
    expect(submitted.selectedStyle).toBe("smooth");
  });

  it("name editing does not reset style and clears stale errors", () => {
    const source = makeSong([0, 800]);
    const state = {
      ...selectSustainMelodyDialogStyle(
        createInitialSustainMelodyDialogState(source, "Generated"),
        "minimal",
      ),
      operationError: "old",
      validationError: "old validation",
    };
    const edited = editSustainMelodyDialogName(state, "Renamed");
    expect(edited).toMatchObject({
      name: "Renamed",
      selectedStyle: "minimal",
      operationError: "",
      validationError: "",
    });
  });

  it("statistics contain only finite exact values", () => {
    const markup = renderForm(makeSong([0, 800, 1600]));
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
    expect(markup).toContain("Original notes: 3");
  });

  it("disables all form controls during creation", () => {
    const markup = renderForm(makeSong([0, 800]), undefined, true);
    expect(markup).toContain(text.creating);
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the dialog open for duplicate/failure and closes for success", () => {
    const state = createInitialSustainMelodyDialogState(
      makeSong([0]),
      "Keep",
    );
    expect(
      getSustainMelodySubmissionResultState(state, {
        status: "duplicate",
        message: "duplicate",
      }),
    ).toMatchObject({
      name: "Keep",
      operationError: "duplicate",
      shouldClose: false,
    });
    expect(
      getSustainMelodySubmissionResultState(state, {
        status: "failed",
        message: "failed",
      }).shouldClose,
    ).toBe(false);
    expect(
      getSustainMelodySubmissionResultState(state, {
        status: "created",
        librarySong: {} as never,
      }).shouldClose,
    ).toBe(true);
  });
});
