import type { Note, Song } from "../types/score";

const MAX_NOTE_DURATION_MS = 60000;

export function normalizePersistedSong(value: unknown): Song | null {
  if (!isRecord(value) || !Array.isArray(value.songNotes)) {
    return null;
  }

  if (
    typeof value.name !== "string" ||
    !isFiniteNumber(value.bpm) ||
    !isFiniteNumber(value.bitsPerPage) ||
    !isFiniteNumber(value.pitchLevel) ||
    typeof value.isComposed !== "boolean"
  ) {
    return null;
  }

  const formatVersion = readFormatVersion(value.formatVersion);
  if (formatVersion === null) {
    return null;
  }

  const hasUnversionedDuration =
    formatVersion === undefined &&
    value.songNotes.some(
      (note) => isRecord(note) && note.duration !== undefined,
    );
  const effectiveFormatVersion = hasUnversionedDuration ? 2 : formatVersion;
  const notes: Note[] = [];

  for (const rawNote of value.songNotes) {
    const note = normalizeNote(rawNote, effectiveFormatVersion === 2);
    if (note === null) {
      return null;
    }
    notes.push(note);
  }

  return {
    ...(effectiveFormatVersion === undefined
      ? {}
      : { formatVersion: effectiveFormatVersion }),
    name: value.name,
    bpm: value.bpm,
    bitsPerPage: value.bitsPerPage,
    pitchLevel: value.pitchLevel,
    isComposed: value.isComposed,
    songNotes: notes,
  };
}

function normalizeNote(value: unknown, allowDuration: boolean): Note | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.time) ||
    typeof value.key !== "string"
  ) {
    return null;
  }

  if (!allowDuration || value.duration === undefined) {
    return { time: value.time, key: value.key };
  }

  if (
    !isFiniteNumber(value.duration) ||
    value.duration <= 0 ||
    value.duration > MAX_NOTE_DURATION_MS
  ) {
    return null;
  }

  return { time: value.time, key: value.key, duration: value.duration };
}

function readFormatVersion(value: unknown): 1 | 2 | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return value === 1 || value === 2 ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
