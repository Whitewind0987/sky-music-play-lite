import type { Note, Song } from "../types/score";

const SUPPORTED_SCORE_EXTENSIONS = [".json", ".txt"];

export function isSupportedScoreFileName(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();

  return SUPPORTED_SCORE_EXTENSIONS.some((extension) =>
    normalizedFileName.endsWith(extension),
  );
}

export function parseScoreFileContent(content: string): Song[] {
  if (content.trim().length === 0) {
    throw new Error("Score file is empty.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Score file is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Score file must contain a JSON array of songs.");
  }

  if (parsed.length === 0) {
    throw new Error("Score file does not contain any songs.");
  }

  return parsed.map((song, songIndex) => validateSong(song, songIndex));
}

function validateSong(value: unknown, songIndex: number): Song {
  if (!isRecord(value)) {
    throw new Error(`Song at index ${songIndex} must be an object.`);
  }

  const name = readString(value, "name", songIndex);
  const bpm = readNumber(value, "bpm", songIndex);
  const bitsPerPage = readNumber(value, "bitsPerPage", songIndex);
  const pitchLevel = readNumber(value, "pitchLevel", songIndex);
  const isComposed = readBoolean(value, "isComposed", songIndex);
  const songNotes = value.songNotes;

  if (!Array.isArray(songNotes)) {
    throw new Error(`Song "${name}" must have a songNotes array.`);
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
    throw new Error(`Note ${noteIndex} in song "${songName}" must be an object.`);
  }

  const time = value.time;
  const key = value.key;

  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new Error(`Note ${noteIndex} in song "${songName}" must have a numeric time.`);
  }

  if (typeof key !== "string") {
    throw new Error(`Note ${noteIndex} in song "${songName}" must have a string key.`);
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
    throw new Error(`Song at index ${songIndex} must have a string ${fieldName}.`);
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
    throw new Error(`Song at index ${songIndex} must have a numeric ${fieldName}.`);
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
    throw new Error(`Song at index ${songIndex} must have a boolean ${fieldName}.`);
  }

  return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
