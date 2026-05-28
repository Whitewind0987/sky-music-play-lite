import type { Note, Song } from "../types/score";

const SUPPORTED_SCORE_EXTENSIONS = [".json", ".txt"];

export type ScoreFileImportErrorCode =
  | "emptyFile"
  | "invalidJson"
  | "topLevelNotArray"
  | "emptySongArray"
  | "songNotObject"
  | "songFieldInvalid"
  | "songNotesInvalid"
  | "noteNotObject"
  | "noteTimeInvalid"
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

function validateSong(value: unknown, songIndex: number): Song {
  if (!isRecord(value)) {
    throw new ScoreFileImportError("songNotObject", { songIndex });
  }

  const name = readString(value, "name", songIndex);
  const bpm = readNumber(value, "bpm", songIndex);
  const bitsPerPage = readNumber(value, "bitsPerPage", songIndex);
  const pitchLevel = readNumber(value, "pitchLevel", songIndex);
  const isComposed = readBoolean(value, "isComposed", songIndex);
  const songNotes = value.songNotes;

  if (!Array.isArray(songNotes)) {
    throw new ScoreFileImportError("songNotesInvalid", { songName: name });
  }

  return {
    name,
    bpm,
    bitsPerPage,
    pitchLevel,
    isComposed,
    songNotes: songNotes.map((note, noteIndex) =>
      validateNote(note, name, noteIndex),
    ),
  };
}

function validateNote(value: unknown, songName: string, noteIndex: number): Note {
  if (!isRecord(value)) {
    throw new ScoreFileImportError("noteNotObject", { noteIndex, songName });
  }

  const time = value.time;
  const key = value.key;

  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new ScoreFileImportError("noteTimeInvalid", { noteIndex, songName });
  }

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

function readNumber(
  value: Record<string, unknown>,
  fieldName: string,
  songIndex: number,
) {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
    throw new ScoreFileImportError("songFieldInvalid", {
      expectedType: "number",
      fieldName,
      songIndex,
    });
  }

  return fieldValue;
}

function readBoolean(
  value: Record<string, unknown>,
  fieldName: string,
  songIndex: number,
) {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== "boolean") {
    throw new ScoreFileImportError("songFieldInvalid", {
      expectedType: "boolean",
      fieldName,
      songIndex,
    });
  }

  return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
