import {
  skyKeyNames,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";
import type { Song } from "../types/score";
import type {
  ScoreRecordingInputEvent,
  ScoreRecordingKeyLookup,
  ScoreRecordingSession,
} from "../types/scoreRecording";

const asciiLetterPattern = /^[a-z]$/i;

export function normalizeRecordingKey(key: string): string {
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
    pressedKeys: new Set(),
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
    if (!session.pressedKeys.has(normalizedKey)) {
      return session;
    }

    const pressedKeys = new Set(session.pressedKeys);
    pressedKeys.delete(normalizedKey);

    return {
      ...session,
      pressedKeys,
      lastAcceptedEventTimeMs: event.timeMs,
    };
  }

  if (session.pressedKeys.has(normalizedKey)) {
    return session;
  }

  const firstAcceptedNoteTimeMs =
    session.firstAcceptedNoteTimeMs ?? event.timeMs;
  const pressedKeys = new Set(session.pressedKeys);
  pressedKeys.add(normalizedKey);

  return {
    ...session,
    pressedKeys,
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
): ScoreRecordingSession {
  if (session.finished) {
    return session;
  }

  return { ...session, finished: true };
}

export function scoreRecordingSessionToSong(
  session: ScoreRecordingSession,
  name: string,
): Song | null {
  if (!session.finished || session.notes.length === 0) {
    return null;
  }

  return {
    formatVersion: 1,
    name,
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: true,
    songNotes: session.notes.map((note) => ({
      time: note.time,
      key: note.key,
    })),
  };
}
