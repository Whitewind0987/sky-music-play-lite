import { describe, expect, it } from "vitest";
import {
  defaultKeyMapping,
  type KeyMapping,
} from "../types/keyMapping";
import type { Note, Song } from "../types/score";
import {
  createScoreRecordingKeyLookup,
  createScoreRecordingSession,
  finishScoreRecordingSession,
  normalizeRecordingKey,
  processScoreRecordingEvent,
  scoreRecordingSessionToSong,
} from "./scoreRecording";
import { MAX_EXPLICIT_NOTE_DURATION_MS } from "./scoreTiming";

function record(
  events: Array<{
    type: "keydown" | "keyup";
    key: string;
    timeMs: number;
    sessionId?: number;
  }>,
  keyMapping: KeyMapping = defaultKeyMapping,
) {
  const lookup = createScoreRecordingKeyLookup(keyMapping);

  return events.reduce(
    (session, event) =>
      processScoreRecordingEvent(
        session,
        { sessionId: event.sessionId ?? 1, ...event },
        lookup,
      ),
    createScoreRecordingSession(1),
  );
}

describe("score recording key lookup", () => {
  it("reverses the default KeyMapping", () => {
    const lookup = createScoreRecordingKeyLookup(defaultKeyMapping);

    expect(lookup.keyToSkyKey.get("y")).toBe("Key0");
    expect(lookup.keyToSkyKey.get("u")).toBe("Key1");
    expect(lookup.keyToSkyKey.get("i")).toBe("Key2");
  });

  it("uses custom mappings without hard-coded keyboard keys", () => {
    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: "a",
    });

    expect(lookup.keyToSkyKey.get("a")).toBe("Key0");
    expect(lookup.keyToSkyKey.has("y")).toBe(false);
  });

  it("normalizes ASCII letters case-insensitively and trims whitespace", () => {
    expect(normalizeRecordingKey(" A ")).toBe("a");
    expect(normalizeRecordingKey(" Escape ")).toBe("Escape");

    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: " A ",
    });
    expect(lookup.keyToSkyKey.get("a")).toBe("Key0");
  });

  it("preserves a literal Space key and includes it in the reverse lookup", () => {
    expect(normalizeRecordingKey(" ")).toBe(" ");

    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: " ",
    });

    expect(lookup.keyToSkyKey.get(" ")).toBe("Key0");
  });

  it("ignores empty mappings", () => {
    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: "   ",
    });

    expect(lookup.keyToSkyKey.has("")).toBe(false);
    expect(lookup.ambiguousKeys.has("")).toBe(false);
  });

  it("detects duplicate physical keys as ambiguous instead of choosing one", () => {
    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: " Y ",
      Key1: "y",
    });

    expect(lookup.keyToSkyKey.has("y")).toBe(false);
    expect(lookup.ambiguousKeys.has("y")).toBe(true);
  });
});

describe("score recording session", () => {
  it("ignores unrelated and ambiguous keys without establishing time zero", () => {
    const mapping = { ...defaultKeyMapping, Key0: "y", Key1: "Y" };
    const session = record(
      [
        { type: "keydown", key: "Escape", timeMs: 100 },
        { type: "keydown", key: "y", timeMs: 200 },
        { type: "keydown", key: "i", timeMs: 300 },
      ],
      mapping,
    );

    expect(session.notes).toEqual([{ time: 0, key: "Key2" }]);
    expect(session.firstAcceptedNoteTimeMs).toBe(300);
    expect([...session.activePresses.keys()]).toEqual(["i"]);
  });

  it("lets the current mapping make an otherwise unrelated key recordable", () => {
    const session = record(
      [{ type: "keydown", key: "A", timeMs: 500 }],
      { ...defaultKeyMapping, Key0: "a" },
    );

    expect(session.notes).toEqual([{ time: 0, key: "Key0" }]);
  });

  it("does not let keyup establish the first-note timestamp", () => {
    const session = record([
      { type: "keyup", key: "y", timeMs: 100 },
      { type: "keydown", key: "u", timeMs: 500 },
    ]);

    expect(session.firstAcceptedNoteTimeMs).toBe(500);
    expect(session.notes).toEqual([{ time: 0, key: "Key1" }]);
  });

  it("normalizes the first valid note to zero and keeps later relative timing", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 5300 },
      { type: "keydown", key: "u", timeMs: 5546 },
      { type: "keydown", key: "o", timeMs: 6058 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0" },
      { time: 246, key: "Key1" },
      { time: 758, key: "Key3" },
    ]);
  });

  it("suppresses repeated keydown while held and records again after keyup", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "Y", timeMs: 1001 },
      { type: "keydown", key: "y", timeMs: 1002 },
      { type: "keyup", key: "Y", timeMs: 1003 },
      { type: "keydown", key: "y", timeMs: 1010 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 3 },
      { time: 10, key: "Key0" },
    ]);
  });

  it("records Space once while held and again after keyup", () => {
    const lookup = createScoreRecordingKeyLookup({
      ...defaultKeyMapping,
      Key0: " ",
    });
    const afterFirstKeydown = processScoreRecordingEvent(
      createScoreRecordingSession(1),
      { sessionId: 1, type: "keydown", key: " ", timeMs: 1000 },
      lookup,
    );
    const afterRepeatKeydown = processScoreRecordingEvent(
      afterFirstKeydown,
      { sessionId: 1, type: "keydown", key: " ", timeMs: 1001 },
      lookup,
    );
    const afterKeyup = processScoreRecordingEvent(
      afterRepeatKeydown,
      { sessionId: 1, type: "keyup", key: " ", timeMs: 1002 },
      lookup,
    );
    const afterSecondKeydown = processScoreRecordingEvent(
      afterKeyup,
      { sessionId: 1, type: "keydown", key: " ", timeMs: 1010 },
      lookup,
    );

    expect(afterRepeatKeydown).toBe(afterFirstKeydown);
    expect(afterKeyup.activePresses.size).toBe(0);
    expect(afterSecondKeydown.notes).toEqual([
      { time: 0, key: "Key0", duration: 2 },
      { time: 10, key: "Key0" },
    ]);
    expect([...afterSecondKeydown.activePresses.keys()]).toEqual([" "]);
  });

  it("tracks multiple held keys independently", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "u", timeMs: 1003 },
      { type: "keyup", key: "y", timeMs: 1010 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 10 },
      { time: 3, key: "Key1" },
    ]);
    expect([...session.activePresses.keys()]).toEqual(["u"]);
  });

  it("preserves different keys at the same timestamp", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "u", timeMs: 1000 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0" },
      { time: 0, key: "Key1" },
    ]);
  });

  it("preserves close human chord timing without snapping", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "u", timeMs: 1003 },
      { type: "keydown", key: "i", timeMs: 1007 },
    ]);

    expect(session.notes.map((note) => note.time)).toEqual([0, 3, 7]);
  });

  it("ignores stale session keydown and keyup without changing active state", () => {
    const lookup = createScoreRecordingKeyLookup(defaultKeyMapping);
    const initial = processScoreRecordingEvent(
      createScoreRecordingSession(2),
      { sessionId: 2, type: "keydown", key: "y", timeMs: 1000 },
      lookup,
    );
    const afterStaleKeydown = processScoreRecordingEvent(
      initial,
      { sessionId: 1, type: "keydown", key: "u", timeMs: 1001 },
      lookup,
    );
    const afterStaleKeyup = processScoreRecordingEvent(
      afterStaleKeydown,
      { sessionId: 1, type: "keyup", key: "y", timeMs: 1002 },
      lookup,
    );

    expect(afterStaleKeydown).toBe(initial);
    expect(afterStaleKeyup).toBe(initial);
    expect([...afterStaleKeyup.activePresses.keys()]).toEqual(["y"]);
  });

  it("ignores all events after completion", () => {
    const lookup = createScoreRecordingKeyLookup(defaultKeyMapping);
    const finished = finishScoreRecordingSession(
      record([{ type: "keydown", key: "y", timeMs: 1000 }]),
    );

    expect(
      processScoreRecordingEvent(
        finished,
        { sessionId: 1, type: "keyup", key: "y", timeMs: 1001 },
        lookup,
      ),
    ).toBe(finished);
    expect(
      processScoreRecordingEvent(
        finished,
        { sessionId: 1, type: "keydown", key: "u", timeMs: 1002 },
        lookup,
      ),
    ).toBe(finished);
  });

  it("ignores out-of-order events without creating a backwards timeline", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 2000 },
      { type: "keydown", key: "u", timeMs: 1900 },
      { type: "keyup", key: "y", timeMs: 1800 },
      { type: "keydown", key: "i", timeMs: 2100 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0" },
      { time: 100, key: "Key2" },
    ]);
    expect([...session.activePresses.keys()]).toEqual(["y", "i"]);
    expect(session.lastAcceptedEventTimeMs).toBe(2100);
  });

  it("records an exact duration without changing note start timing", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keyup", key: "y", timeMs: 1450 },
      { type: "keydown", key: "u", timeMs: 1600 },
      { type: "keyup", key: "u", timeMs: 1612 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 450 },
      { time: 600, key: "Key1", duration: 12 },
    ]);
    expect(session.activePresses.size).toBe(0);
  });

  it("does not let repeated keydown reset the active press start", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "Y", timeMs: 1030 },
      { type: "keydown", key: "y", timeMs: 1060 },
      { type: "keyup", key: "Y", timeMs: 1300 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 300 },
    ]);
  });

  it("records independent same-key retriggers", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keyup", key: "y", timeMs: 1200 },
      { type: "keydown", key: "y", timeMs: 1300 },
      { type: "keyup", key: "y", timeMs: 1600 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 200 },
      { time: 300, key: "Key0", duration: 300 },
    ]);
  });

  it("records independent chord durations without snapping starts", () => {
    const session = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "u", timeMs: 1003 },
      { type: "keyup", key: "y", timeMs: 1300 },
      { type: "keyup", key: "u", timeMs: 1700 },
    ]);

    expect(session.notes).toEqual([
      { time: 0, key: "Key0", duration: 300 },
      { time: 3, key: "Key1", duration: 697 },
    ]);
  });

  it("records duration for Space and custom mappings", () => {
    const space = record(
      [
        { type: "keydown", key: " ", timeMs: 10 },
        { type: "keyup", key: " ", timeMs: 60 },
      ],
      { ...defaultKeyMapping, Key0: " " },
    );
    const custom = record(
      [
        { type: "keydown", key: "A", timeMs: 100 },
        { type: "keyup", key: "a", timeMs: 175 },
      ],
      { ...defaultKeyMapping, Key0: "a" },
    );

    expect(space.notes).toEqual([{ time: 0, key: "Key0", duration: 50 }]);
    expect(custom.notes).toEqual([{ time: 0, key: "Key0", duration: 75 }]);
  });

  it("ignores unrelated, stale, and out-of-order keyups without releasing", () => {
    const lookup = createScoreRecordingKeyLookup(defaultKeyMapping);
    const active = record([{ type: "keydown", key: "y", timeMs: 1000 }]);
    const unrelated = processScoreRecordingEvent(
      active,
      { sessionId: 1, type: "keyup", key: "u", timeMs: 1100 },
      lookup,
    );
    const stale = processScoreRecordingEvent(
      unrelated,
      { sessionId: 2, type: "keyup", key: "y", timeMs: 1200 },
      lookup,
    );
    const old = processScoreRecordingEvent(
      stale,
      { sessionId: 1, type: "keyup", key: "y", timeMs: 900 },
      lookup,
    );

    expect(unrelated).toBe(active);
    expect(stale).toBe(active);
    expect(old).toBe(active);
    expect(active.activePresses.has("y")).toBe(true);
    expect(active.notes).toEqual([{ time: 0, key: "Key0" }]);
  });

  it("omits zero duration and clamps durations above the explicit maximum", () => {
    const zero = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keyup", key: "y", timeMs: 1000 },
    ]);
    const clamped = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      {
        type: "keyup",
        key: "y",
        timeMs: 1000 + MAX_EXPLICIT_NOTE_DURATION_MS + 500,
      },
    ]);

    expect(zero.notes).toEqual([{ time: 0, key: "Key0" }]);
    expect(clamped.notes[0]?.duration).toBe(MAX_EXPLICIT_NOTE_DURATION_MS);
  });

  it("finishes held notes independently at the supplied native end time", () => {
    const active = record([
      { type: "keydown", key: "y", timeMs: 1000 },
      { type: "keydown", key: "u", timeMs: 1200 },
    ]);
    const finished = finishScoreRecordingSession(active, 2000);

    expect(finished.notes).toEqual([
      { time: 0, key: "Key0", duration: 1000 },
      { time: 200, key: "Key1", duration: 800 },
    ]);
    expect(finished.activePresses.size).toBe(0);
  });

  it("finishes without inventing held-note duration when no end time exists", () => {
    const finished = finishScoreRecordingSession(
      record([{ type: "keydown", key: "y", timeMs: 1000 }]),
    );

    expect(finished.notes).toEqual([{ time: 0, key: "Key0" }]);
    expect(finished.activePresses.size).toBe(0);
  });
});

describe("completed recording conversion", () => {
  it("does not create a Song from an unfinished or empty session", () => {
    const empty = createScoreRecordingSession(1);

    expect(scoreRecordingSessionToSong(empty, "Empty")).toBeNull();
    expect(
      scoreRecordingSessionToSong(
        finishScoreRecordingSession(empty),
        "Empty",
      ),
    ).toBeNull();
  });

  it("creates the existing Song and Note model without duration", () => {
    const song: Song | null = scoreRecordingSessionToSong(
      finishScoreRecordingSession(
        record([
          { type: "keydown", key: "y", timeMs: 4000 },
          { type: "keydown", key: "u", timeMs: 4246 },
        ]),
      ),
      "Recorded score",
    );

    expect(song).toEqual({
      formatVersion: 1,
      name: "Recorded score",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: true,
      songNotes: [
        { time: 0, key: "Key0" },
        { time: 246, key: "Key1" },
      ],
    });
    expect(
      song?.songNotes.every((note: Note) => !("duration" in note)),
    ).toBe(true);
  });

  it("preserves valid durations and selects V2 automatically", () => {
    const song = scoreRecordingSessionToSong(
      finishScoreRecordingSession(
        record([
          { type: "keydown", key: "y", timeMs: 1000 },
          { type: "keydown", key: "u", timeMs: 1005 },
          { type: "keyup", key: "y", timeMs: 1200 },
          { type: "keyup", key: "u", timeMs: 1620 },
          { type: "keydown", key: "i", timeMs: 1700 },
        ]),
      ),
      "Measured",
    );

    expect(song?.formatVersion).toBe(2);
    expect(song?.songNotes).toEqual([
      { time: 0, key: "Key0", duration: 200 },
      { time: 5, key: "Key1", duration: 615 },
      { time: 700, key: "Key2" },
    ]);
  });
});
