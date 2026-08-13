import {
  skyKeyNames,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";
import type { Song } from "../types/score";
import type {
  ActiveScoreRecordingPress,
  ScoreRecordingInputEvent,
  ScoreRecordingKeyLookup,
  ScoreRecordingSession,
} from "../types/scoreRecording";
import {
  isValidExplicitDuration,
  MAX_EXPLICIT_NOTE_DURATION_MS,
} from "./scoreTiming";

const asciiLetterPattern = /^[a-z]$/i;

export function normalizeRecordingKey(key: string): string {
  if (key === " ") {
    return key;
  }

  const trimmedKey = key.trim();

  return asciiLetterPattern.test(trimmedKey)
    ? trimmedKey.toLowerCase()
    : trimmedKey;
}

export function createScoreRecordingKeyLookup(
  keyMapping: KeyMapping,
): ScoreRecordingKeyLookup {
  const keyToSkyKey = new Map<string, SkyKeyName>();
  const ambiguousKeys = new Set<string>();

  for (const skyKey of skyKeyNames) {
    const normalizedKey = normalizeRecordingKey(keyMapping[skyKey]);

    if (normalizedKey.length === 0 || ambiguousKeys.has(normalizedKey)) {
      continue;
    }

    if (keyToSkyKey.has(normalizedKey)) {
      keyToSkyKey.delete(normalizedKey);
      ambiguousKeys.add(normalizedKey);
      continue;
    }

    keyToSkyKey.set(normalizedKey, skyKey);
  }

  return { keyToSkyKey, ambiguousKeys };
}

export function createScoreRecordingSession(
  sessionId: number,
): ScoreRecordingSession {
  return {
    sessionId,
    activePresses: new Map(),
    notes: [],
    firstAcceptedNoteTimeMs: null,
    lastAcceptedEventTimeMs: null,
    finished: false,
  };
}

export function processScoreRecordingEvent(
  session: ScoreRecordingSession,
  event: ScoreRecordingInputEvent,
  lookup: ScoreRecordingKeyLookup,
): ScoreRecordingSession {
  if (
    session.finished ||
    event.sessionId !== session.sessionId ||
    !Number.isFinite(event.timeMs)
  ) {
    return session;
  }

  const normalizedKey = normalizeRecordingKey(event.key);
  const skyKey = lookup.keyToSkyKey.get(normalizedKey);

  if (skyKey === undefined || lookup.ambiguousKeys.has(normalizedKey)) {
    return session;
  }

  if (
    session.lastAcceptedEventTimeMs !== null &&
    event.timeMs < session.lastAcceptedEventTimeMs
  ) {
    return session;
  }

  if (event.type === "keyup") {
    const activePress = session.activePresses.get(normalizedKey);
    if (activePress === undefined) {
      return session;
    }

    const activePresses = new Map(session.activePresses);
    activePresses.delete(normalizedKey);

    return {
      ...session,
      activePresses,
      notes: applyMeasuredDuration(session.notes, activePress, event.timeMs),
      lastAcceptedEventTimeMs: event.timeMs,
    };
  }

  if (session.activePresses.has(normalizedKey)) {
    return session;
  }

  const firstAcceptedNoteTimeMs =
    session.firstAcceptedNoteTimeMs ?? event.timeMs;
  const noteIndex = session.notes.length;
  const activePresses = new Map(session.activePresses);
  activePresses.set(normalizedKey, {
    noteIndex,
    startedAtMs: event.timeMs,
  });

  return {
    ...session,
    activePresses,
    notes: [
      ...session.notes,
      {
        time: event.timeMs - firstAcceptedNoteTimeMs,
        key: skyKey,
      },
    ],
    firstAcceptedNoteTimeMs,
    lastAcceptedEventTimeMs: event.timeMs,
  };
}

export function finishScoreRecordingSession(
  session: ScoreRecordingSession,
  endedAtMs?: number,
): ScoreRecordingSession {
  if (session.finished) {
    return session;
  }

  let notes = session.notes;

  if (Number.isFinite(endedAtMs)) {
    for (const activePress of session.activePresses.values()) {
      notes = applyMeasuredDuration(notes, activePress, endedAtMs as number);
    }
  }

  return {
    ...session,
    activePresses: new Map(),
    notes,
    finished: true,
  };
}

export function scoreRecordingSessionToSong(
  session: ScoreRecordingSession,
  name: string,
): Song | null {
  if (!session.finished || session.notes.length === 0) {
    return null;
  }

  const songNotes = session.notes.map((note) =>
    isValidExplicitDuration(note.duration)
      ? { time: note.time, key: note.key, duration: note.duration }
      : { time: note.time, key: note.key },
  );
  const hasExplicitDuration = songNotes.some((note) =>
    isValidExplicitDuration(note.duration),
  );

  return {
    formatVersion: hasExplicitDuration ? 2 : 1,
    name,
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: true,
    songNotes,
  };
}

function applyMeasuredDuration(
  notes: ScoreRecordingSession["notes"],
  activePress: ActiveScoreRecordingPress,
  endedAtMs: number,
) {
  const measuredDuration = endedAtMs - activePress.startedAtMs;

  if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) {
    return notes;
  }

  const note = notes[activePress.noteIndex];
  if (note === undefined) {
    return notes;
  }

  const duration = Math.min(
    measuredDuration,
    MAX_EXPLICIT_NOTE_DURATION_MS,
  );

  return notes.map((currentNote, index) =>
    index === activePress.noteIndex
      ? { ...currentNote, duration }
      : currentNote,
  );
}
