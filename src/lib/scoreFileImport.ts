import type { Note, Song } from "../types/score";
import {
  decryptEncryptedSongNotes,
  SheetDecryptError,
} from "./sheetDecrypt";

const SUPPORTED_SCORE_EXTENSIONS = [".json", ".txt"];

export type ScoreFileImportErrorCode =
  | "emptyFile"
  | "encryptedSongNotesDecryptFailed"
  | "decryptedSongNotesInvalid"
  | "invalidJson"
  | "topLevelNotArray"
  | "emptySongArray"
  | "songNotObject"
  | "songFieldInvalid"
  | "songNotesInvalid"
  | "noteNotObject"
  | "noteTimeInvalid"
  | "relativeTimeInvalid"
  | "noteKeyInvalid";

type ScoreFileImportErrorDetails = Record<string, string | number>;

export class ScoreFileImportError extends Error {
  code: ScoreFileImportErrorCode;
  details: ScoreFileImportErrorDetails;

  constructor(
    code: ScoreFileImportErrorCode,
    details: ScoreFileImportErrorDetails = {},
  ) {
    super(code);
    this.name = "ScoreFileImportError";
    this.code = code;
    this.details = details;
  }
}

export function isSupportedScoreFileName(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();

  return SUPPORTED_SCORE_EXTENSIONS.some((extension) =>
    normalizedFileName.endsWith(extension),
  );
}

export function parseScoreFileContent(content: string): Song[] {
  if (content.trim().length === 0) {
    throw new ScoreFileImportError("emptyFile");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ScoreFileImportError("invalidJson", {
      jsonError: error instanceof Error ? error.message : String(error),
    });
  }

  if (!Array.isArray(parsed)) {
    throw new ScoreFileImportError("topLevelNotArray");
  }

  if (parsed.length === 0) {
    throw new ScoreFileImportError("emptySongArray");
  }

  return parsed.map((song, songIndex) => validateSong(song, songIndex));
}

export function parseScoreFileSongAtIndex(
  content: string,
  songIndex: number,
): Song | null {
  if (content.trim().length === 0) {
    throw new ScoreFileImportError("emptyFile");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ScoreFileImportError("invalidJson", {
      jsonError: error instanceof Error ? error.message : String(error),
    });
  }

  if (!Array.isArray(parsed)) {
    throw new ScoreFileImportError("topLevelNotArray");
  }

  if (parsed.length === 0) {
    throw new ScoreFileImportError("emptySongArray");
  }

  if (
    !Number.isInteger(songIndex) ||
    songIndex < 0 ||
    songIndex >= parsed.length
  ) {
    return null;
  }

  return validateSong(parsed[songIndex], songIndex);
}

function validateSong(value: unknown, songIndex: number): Song {
  if (!isRecord(value)) {
    throw new ScoreFileImportError("songNotObject", { songIndex });
  }

  const name = readString(value, "name", songIndex);
  const bpm = readFlexibleNumber(value, "bpm", songIndex, 120);
  const bitsPerPage = readFlexibleNumber(value, "bitsPerPage", songIndex, 16);
  const pitchLevel = readFlexibleNumber(value, "pitchLevel", songIndex, 0);
  const isComposed = readOptionalFlexibleBoolean(
    value,
    "isComposed",
    false,
    songIndex,
  );
  const songNotes = resolveSongNotes(value, name);
  const validatedNotes = songNotes.map((note, noteIndex) =>
    validateNote(note, name, noteIndex),
  );

  return {
    name,
    bpm,
    bitsPerPage,
    pitchLevel,
    isComposed,
    songNotes:
      value.isRelativeTime === true
        ? normalizeRelativeSongNotes(validatedNotes, name)
        : validatedNotes,
  };
}

function normalizeRelativeSongNotes(notes: Note[], songName: string): Note[] {
  if (notes.length === 0) {
    return notes;
  }

  if (notes[0].time !== 0) {
    throw new ScoreFileImportError("relativeTimeInvalid", { noteIndex: 0, songName });
  }

  let absoluteTime = 0;
  return notes.map((note, noteIndex) => {
    if (noteIndex === 0) {
      return { ...note, time: 0 };
    }
    if (note.time < 0) {
      throw new ScoreFileImportError("relativeTimeInvalid", { noteIndex, songName });
    }
    absoluteTime += note.time;
    if (!Number.isFinite(absoluteTime)) {
      throw new ScoreFileImportError("relativeTimeInvalid", { noteIndex, songName });
    }
    return { ...note, time: absoluteTime };
  });
}

function resolveSongNotes(
  value: Record<string, unknown>,
  songName: string,
): unknown[] {
  const rawSongNotes = value.songNotes;

  if (!Array.isArray(rawSongNotes)) {
    throw new ScoreFileImportError("songNotesInvalid", { songName });
  }

  const isEncrypted = value.isEncrypted === true;

  if (!isNumericSongNotes(rawSongNotes)) {
    if (isEncrypted) {
      throw new ScoreFileImportError("encryptedSongNotesDecryptFailed", {
        reason: "encryptedSongNotesMustBeNumeric",
        songName,
      });
    }

    return rawSongNotes;
  }

  let decryptedSongNotes: unknown;

  try {
    decryptedSongNotes = decryptEncryptedSongNotes(rawSongNotes);
  } catch (error) {
    if (error instanceof SheetDecryptError) {
      throw new ScoreFileImportError("encryptedSongNotesDecryptFailed", {
        reason: error.code,
        songName,
      });
    }

    throw error;
  }

  if (!Array.isArray(decryptedSongNotes)) {
    throw new ScoreFileImportError("decryptedSongNotesInvalid", { songName });
  }

  return decryptedSongNotes;
}

function validateNote(value: unknown, songName: string, noteIndex: number): Note {
  if (!isRecord(value)) {
    throw new ScoreFileImportError("noteNotObject", { noteIndex, songName });
  }

  const time = readFlexibleNoteTime(value.time, songName, noteIndex);
  const key = value.key;

  if (typeof key !== "string") {
    throw new ScoreFileImportError("noteKeyInvalid", { noteIndex, songName });
  }

  return { time, key };
}

function readString(
  value: Record<string, unknown>,
  fieldName: string,
  songIndex: number,
) {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== "string") {
    throw new ScoreFileImportError("songFieldInvalid", {
      expectedType: "string",
      fieldName,
      songIndex,
    });
  }

  return fieldValue;
}

function readFlexibleNumber(
  value: Record<string, unknown>,
  fieldName: string,
  songIndex: number,
  defaultValue?: number,
) {
  const fieldValue = value[fieldName];

  if (fieldValue === undefined || fieldValue === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new ScoreFileImportError("songFieldInvalid", {
      expectedType: "number",
      fieldName,
      songIndex,
    });
  }

  if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
    return fieldValue;
  }

  if (typeof fieldValue === "string") {
    const trimmedValue = fieldValue.trim();
    const parsedValue = Number(trimmedValue);

    if (trimmedValue.length > 0 && Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  throw new ScoreFileImportError("songFieldInvalid", {
    expectedType: "number",
    fieldName,
    songIndex,
  });
}

function readOptionalFlexibleBoolean(
  value: Record<string, unknown>,
  fieldName: string,
  defaultValue: boolean,
  songIndex: number,
) {
  const fieldValue = value[fieldName];

  if (fieldValue === undefined) {
    return defaultValue;
  }

  if (typeof fieldValue === "boolean") {
    return fieldValue;
  }

  if (typeof fieldValue === "string") {
    const normalizedValue = fieldValue.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  throw new ScoreFileImportError("songFieldInvalid", {
    expectedType: "boolean",
    fieldName,
    songIndex,
  });
}

function readFlexibleNoteTime(
  fieldValue: unknown,
  songName: string,
  noteIndex: number,
) {
  if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
    return fieldValue;
  }

  if (typeof fieldValue === "string") {
    const trimmedValue = fieldValue.trim();
    const parsedValue = Number(trimmedValue);

    if (trimmedValue.length > 0 && Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  throw new ScoreFileImportError("noteTimeInvalid", { noteIndex, songName });
}

function isNumericSongNotes(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "number")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
