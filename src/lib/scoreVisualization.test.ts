import { describe, expect, it } from "vitest";
import { skyKeyNames } from "../types/keyMapping";
import type { Note } from "../types/score";
import type { ScoreRecordingSession } from "../types/scoreRecording";
import {
  buildScoreVisualization,
  findCurrentScoreVisualGroupIndex,
  getActiveScoreRecordingVisualKeys,
  getActiveScoreVisualKeys,
  getScoreVisualRenderWindow,
} from "./scoreVisualization";
import {
  calculateScoreTiming,
  MAX_EXPLICIT_NOTE_DURATION_MS,
  NOTE_HIGHLIGHT_MS,
} from "./scoreTiming";

const defaultTimingOptions = {
  noteIntervalDelayMs: 0,
  playbackSpeed: 1,
};

function notesAt(...times: number[]): Note[] {
  return times.map((time, index) => ({ time, key: `Key${index}` }));
}

function buildGroups(times: number[]) {
  return buildScoreVisualization(notesAt(...times), defaultTimingOptions, {
    visualChordWindowMs: 0,
  }).groups;
}

function recordingSession(
  notes: Note[],
  activeNoteIndexes: number[],
  finished = false,
): ScoreRecordingSession {
  return {
    sessionId: 1,
    activePresses: new Map(
      activeNoteIndexes.map((noteIndex, index) => [
        `physical-${index}`,
        { noteIndex, startedAtMs: index },
      ]),
    ),
    notes,
    firstAcceptedNoteTimeMs: notes.length > 0 ? 0 : null,
    lastAcceptedEventTimeMs: notes.length > 0 ? 0 : null,
    finished,
  };
}

describe("buildScoreVisualization", () => {
  it("groups an exact chord and exposes keys in canonical order", () => {
    const model = buildScoreVisualization(
      [
        { time: 100, key: "Key8" },
        { time: 100, key: "Key0" },
        { time: 100, key: "Key4" },
      ],
      defaultTimingOptions,
    );

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.skyKeys).toEqual(["Key0", "Key4", "Key8"]);
    expect(model.groups[0]?.notes.map((note) => note.sourceKey)).toEqual([
      "Key8",
      "Key0",
      "Key4",
    ]);
  });

  it("visually groups near-simultaneous notes without changing their times", () => {
    const model = buildScoreVisualization(
      [
        { time: 0, key: "Key0" },
        { time: 7, key: "Key4" },
        { time: 18, key: "Key8" },
      ],
      defaultTimingOptions,
    );

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.notes.map((note) => note.sourceTimeMs)).toEqual([
      0, 7, 18,
    ]);
    expect(model.groups[0]?.notes.map((note) => note.adjustedStartMs)).toEqual([
      0, 7, 18,
    ]);
    expect(model.groups[0]).toMatchObject({
      sourceStartMs: 0,
      sourceEndMs: 18,
      adjustedStartMs: 0,
      adjustedLastStartMs: 18,
    });
  });

  it("anchors grouping to the first source time instead of chaining", () => {
    const groups = buildScoreVisualization(
      notesAt(0, 20, 40),
      defaultTimingOptions,
      { visualChordWindowMs: 30 },
    ).groups;

    expect(groups.map((group) => group.notes.map((note) => note.sourceTimeMs))).toEqual([
      [0, 20],
      [40],
    ]);
  });

  it("uses an inclusive visual chord boundary without rounding", () => {
    expect(buildScoreVisualization(notesAt(0, 30), defaultTimingOptions).groups).toHaveLength(1);
    expect(buildScoreVisualization(notesAt(0, 30.001), defaultTimingOptions).groups).toHaveLength(2);
  });

  it("groups only exact-time notes when the window is zero", () => {
    const groups = buildScoreVisualization(
      [
        { time: 0, key: "Key0" },
        { time: 0, key: "Key1" },
        { time: 0.001, key: "Key2" },
      ],
      defaultTimingOptions,
      { visualChordWindowMs: 0 },
    ).groups;

    expect(groups.map((group) => group.notes.length)).toEqual([2, 1]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "normalizes invalid visual window %s to zero",
    (visualChordWindowMs) => {
      const groups = buildScoreVisualization(
        notesAt(0, 1),
        defaultTimingOptions,
        { visualChordWindowMs },
      ).groups;

      expect(groups).toHaveLength(2);
    },
  );

  it("normalizes prefixed score keys with the existing preview semantics", () => {
    const model = buildScoreVisualization(
      [
        { time: 0, key: "Key0" },
        { time: 0, key: "1Key4" },
        { time: 0, key: "2Key14" },
      ],
      defaultTimingOptions,
    );

    expect(model.groups[0]?.skyKeys).toEqual(["Key0", "Key4", "Key14"]);
    expect(model.groups[0]?.notes.map((note) => note.sourceKey)).toEqual([
      "Key0",
      "1Key4",
      "2Key14",
    ]);
  });

  it("omits unsupported keys and does not create empty visual groups", () => {
    const model = buildScoreVisualization(
      [{ time: 100, key: "Key99" }],
      defaultTimingOptions,
    );

    expect(model.groups).toEqual([]);
    expect(model.totalMs).toBe(100);
    expect(model.finishMs).toBe(400);
  });

  it("preserves full-score timing around an unsupported key group", () => {
    const notes = [
      { time: 0, key: "Key0" },
      { time: 100, key: "Key99" },
      { time: 200, key: "Key1" },
    ];
    const options = { noteIntervalDelayMs: 50, playbackSpeed: 1 };
    const model = buildScoreVisualization(notes, options, {
      visualChordWindowMs: 0,
    });
    const timing = calculateScoreTiming(notes, options);

    expect(model.groups[1]?.adjustedStartMs).toBe(300);
    expect(model.groups[1]?.adjustedStartMs).toBe(
      timing.groups[2]?.adjustedStartMs,
    );
  });

  it("uses existing playback-speed and interval-delay adjusted starts", () => {
    const notes = notesAt(0, 100, 250);
    const options = { noteIntervalDelayMs: 25, playbackSpeed: 2 };
    const model = buildScoreVisualization(notes, options, {
      visualChordWindowMs: 0,
    });
    const timing = calculateScoreTiming(notes, options);

    expect(model.groups.map((group) => group.adjustedStartMs)).toEqual(
      timing.groups.map((group) => group.adjustedStartMs),
    );
    expect(model.groups.map((group) => group.adjustedStartMs)).toEqual([
      0, 75, 175,
    ]);
  });

  it("preserves short and long valid V2 durations with speed scaling", () => {
    const model = buildScoreVisualization(
      [
        { time: 0, key: "Key0", duration: 12 },
        { time: 500, key: "Key1", duration: 1000 },
      ],
      { noteIntervalDelayMs: 0, playbackSpeed: 2 },
      { visualChordWindowMs: 0 },
    );

    expect(model.groups[0]?.notes[0]).toMatchObject({
      explicitDurationMs: 12,
      adjustedStartMs: 0,
      visualEndMs: 6,
    });
    expect(model.groups[1]?.notes[0]).toMatchObject({
      explicitDurationMs: 1000,
      adjustedStartMs: 250,
      visualEndMs: 750,
    });
  });

  it("uses the visual-only fallback highlight for V1 and invalid durations", () => {
    const notes: Note[] = [
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1", duration: 0 },
      {
        time: 1000,
        key: "Key2",
        duration: MAX_EXPLICIT_NOTE_DURATION_MS + 1,
      },
    ];
    const model = buildScoreVisualization(
      notes,
      { noteIntervalDelayMs: 0, playbackSpeed: 2 },
      { visualChordWindowMs: 0 },
    );

    model.groups.forEach((group) => {
      expect(group.notes[0]?.explicitDurationMs).toBeNull();
      expect(
        (group.notes[0]?.visualEndMs ?? 0) - group.adjustedStartMs,
      ).toBe(NOTE_HIGHLIGHT_MS / 2);
    });
    expect("duration" in notes[0]!).toBe(false);
  });

  it("keeps model totals from score timing, including unsupported keys", () => {
    const notes = [
      { time: 0, key: "Key0", duration: 100 },
      { time: 500, key: "Unknown", duration: 1000 },
    ];
    const timing = calculateScoreTiming(notes, defaultTimingOptions);
    const model = buildScoreVisualization(notes, defaultTimingOptions);

    expect(model.totalMs).toBe(timing.totalMs);
    expect(model.finishMs).toBe(timing.finishMs);
    expect(model.totalMs).toBe(1500);
  });

  it("ignores non-finite source times like the existing timing model", () => {
    const model = buildScoreVisualization(
      [
        { time: Number.NaN, key: "Key0" },
        { time: Number.POSITIVE_INFINITY, key: "Key1" },
        { time: 10, key: "Key2" },
      ],
      defaultTimingOptions,
    );

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.skyKeys).toEqual(["Key2"]);
  });

  it("returns the empty model for empty input", () => {
    expect(buildScoreVisualization([], defaultTimingOptions)).toEqual({
      groups: [],
      totalMs: 0,
      finishMs: 0,
    });
  });

  it("does not mutate notes, note objects, or source array order", () => {
    const notes: Note[] = [
      { time: 20, key: "Key2", duration: 12 },
      { time: 0, key: "1Key0" },
      { time: 10, key: "Unknown", duration: -1 },
    ];
    const snapshot = structuredClone(notes);
    const references = [...notes];

    buildScoreVisualization(notes, defaultTimingOptions);

    expect(notes).toEqual(snapshot);
    expect(notes).toEqual(references);
    expect(notes[0]).toBe(references[0]);
    expect(notes[1]).toBe(references[1]);
    expect(notes[2]).toBe(references[2]);
  });
});

describe("getActiveScoreVisualKeys", () => {
  it("supports overlapping long notes with an end-exclusive boundary", () => {
    const groups = buildScoreVisualization(
      [
        { time: 0, key: "Key0", duration: 1000 },
        { time: 500, key: "Key1", duration: 100 },
      ],
      defaultTimingOptions,
      { visualChordWindowMs: 0 },
    ).groups;

    expect(getActiveScoreVisualKeys(groups, 550)).toEqual(["Key0", "Key1"]);
    expect(getActiveScoreVisualKeys(groups, 600)).toEqual(["Key0"]);
    expect(getActiveScoreVisualKeys(groups, 700)).toEqual(["Key0"]);
    expect(getActiveScoreVisualKeys(groups, 1000)).toEqual([]);
  });

  it("returns unique active keys in canonical order", () => {
    const groups = buildScoreVisualization(
      [
        { time: 0, key: "Key8", duration: 1000 },
        { time: 0, key: "Key0", duration: 1000 },
        { time: 1, key: "1Key8", duration: 1000 },
        { time: 2, key: "Key4", duration: 1000 },
      ],
      defaultTimingOptions,
    ).groups;

    expect(getActiveScoreVisualKeys(groups, 10)).toEqual([
      "Key0",
      "Key4",
      "Key8",
    ]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "returns no active keys for non-finite time %s",
    (currentMs) => {
      expect(getActiveScoreVisualKeys(buildGroups([0]), currentMs)).toEqual([]);
    },
  );
});

describe("getActiveScoreRecordingVisualKeys", () => {
  it("returns one active recording key", () => {
    const session = recordingSession([{ time: 0, key: "Key4" }], [0]);

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual(["Key4"]);
  });

  it("returns an active chord in canonical order", () => {
    const session = recordingSession(
      [
        { time: 0, key: "Key8" },
        { time: 1, key: "Key0" },
        { time: 2, key: "Key4" },
      ],
      [0, 1, 2],
    );

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual([
      "Key0",
      "Key4",
      "Key8",
    ]);
  });

  it("de-duplicates active recording notes resolving to one Sky key", () => {
    const session = recordingSession(
      [
        { time: 0, key: "Key4" },
        { time: 1, key: "2Key4" },
      ],
      [0, 1],
    );

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual(["Key4"]);
  });

  it("ignores stale and out-of-range active note indexes", () => {
    const session = recordingSession([{ time: 0, key: "Key1" }], [1, 99]);

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual([]);
  });

  it("ignores unsupported active note keys", () => {
    const session = recordingSession([{ time: 0, key: "Key99" }], [0]);

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual([]);
  });

  it("normalizes prefixed active recording keys", () => {
    const session = recordingSession([{ time: 0, key: "1Key14" }], [0]);

    expect(getActiveScoreRecordingVisualKeys(session)).toEqual(["Key14"]);
  });

  it("returns no keys for finished or inactive sessions", () => {
    const inactive = recordingSession([{ time: 0, key: "Key0" }], []);
    const finished = recordingSession([{ time: 0, key: "Key0" }], [0], true);

    expect(getActiveScoreRecordingVisualKeys(inactive)).toEqual([]);
    expect(getActiveScoreRecordingVisualKeys(finished)).toEqual([]);
  });
});

describe("findCurrentScoreVisualGroupIndex", () => {
  it("finds timeline focus before, at, between, and after group starts", () => {
    const groups = buildGroups([100, 200, 300]);

    expect(findCurrentScoreVisualGroupIndex(groups, 99)).toBe(-1);
    expect(findCurrentScoreVisualGroupIndex(groups, 100)).toBe(0);
    expect(findCurrentScoreVisualGroupIndex(groups, 250)).toBe(1);
    expect(findCurrentScoreVisualGroupIndex(groups, 1000)).toBe(2);
  });

  it("selects the latest separate group at an equal adjusted start", () => {
    const groups = buildScoreVisualization(
      notesAt(0, 100),
      { noteIntervalDelayMs: -100, playbackSpeed: 1 },
      { visualChordWindowMs: 0 },
    ).groups;

    expect(groups.map((group) => group.adjustedStartMs)).toEqual([0, 0]);
    expect(findCurrentScoreVisualGroupIndex(groups, 0)).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "returns -1 for non-finite time %s",
    (currentMs) => {
      expect(findCurrentScoreVisualGroupIndex(buildGroups([0]), currentMs)).toBe(-1);
    },
  );

  it("returns -1 for empty groups", () => {
    expect(findCurrentScoreVisualGroupIndex([], 0)).toBe(-1);
  });
});

describe("getScoreVisualRenderWindow", () => {
  const groups = buildGroups(Array.from({ length: 10 }, (_, index) => index * 100));

  it("returns predictable bounded windows in the middle, start, and end", () => {
    expect(getScoreVisualRenderWindow(groups, 5, 2, 3)).toMatchObject({
      startIndex: 3,
      endIndexExclusive: 9,
    });
    expect(getScoreVisualRenderWindow(groups, 0, 2, 3)).toMatchObject({
      startIndex: 0,
      endIndexExclusive: 4,
    });
    expect(getScoreVisualRenderWindow(groups, 9, 2, 3)).toMatchObject({
      startIndex: 7,
      endIndexExclusive: 10,
    });
  });

  it("uses the first group as display focus before playback", () => {
    const window = getScoreVisualRenderWindow(groups, -1, 12, 2);

    expect(window.startIndex).toBe(0);
    expect(window.endIndexExclusive).toBe(3);
    expect(window.groups).toEqual(groups.slice(0, 3));
  });

  it("normalizes negative, fractional, and non-finite counts", () => {
    expect(getScoreVisualRenderWindow(groups, 5, -1, 2.9)).toMatchObject({
      startIndex: 5,
      endIndexExclusive: 8,
    });
    expect(getScoreVisualRenderWindow(groups, 5, Number.NaN, Number.POSITIVE_INFINITY)).toMatchObject({
      startIndex: 5,
      endIndexExclusive: 6,
    });
  });

  it("returns an empty window for empty groups", () => {
    expect(getScoreVisualRenderWindow([], -1)).toEqual({
      startIndex: 0,
      endIndexExclusive: 0,
      groups: [],
    });
  });

  it("uses the exported canonical key set expected by visual output", () => {
    expect(skyKeyNames).toHaveLength(15);
  });
});
