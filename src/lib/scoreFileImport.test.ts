import { describe, expect, it } from "vitest";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
  ScoreFileImportError,
  type ScoreFileImportErrorCode,
} from "./scoreFileImport";

function createRawSong(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Song",
    bpm: 120,
    bitsPerPage: 15,
    pitchLevel: 0,
    isComposed: true,
    songNotes: [
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ],
    ...overrides,
  };
}

function expectImportError(content: string, code: ScoreFileImportErrorCode) {
  expect(() => parseScoreFileContent(content)).toThrow(ScoreFileImportError);

  try {
    parseScoreFileContent(content);
  } catch (error) {
    expect(error).toBeInstanceOf(ScoreFileImportError);
    expect((error as ScoreFileImportError).code).toBe(code);
    return;
  }

  throw new Error("Expected parseScoreFileContent to throw");
}

describe("isSupportedScoreFileName", () => {
  it("accepts json and txt files case-insensitively", () => {
    expect(isSupportedScoreFileName("song.json")).toBe(true);
    expect(isSupportedScoreFileName("song.JSON")).toBe(true);
    expect(isSupportedScoreFileName("song.txt")).toBe(true);
    expect(isSupportedScoreFileName("song.TXT")).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isSupportedScoreFileName("song.mid")).toBe(false);
    expect(isSupportedScoreFileName("song")).toBe(false);
  });
});

describe("parseScoreFileContent success cases", () => {
  it("parses a valid song array", () => {
    const songs = parseScoreFileContent(JSON.stringify([createRawSong()]));

    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      name: "Test Song",
      bpm: 120,
      bitsPerPage: 15,
      pitchLevel: 0,
      isComposed: true,
    });
    expect(songs[0]?.songNotes).toEqual([
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ]);
  });

  it("accepts flexible numeric string fields", () => {
    const songs = parseScoreFileContent(
      JSON.stringify([
        createRawSong({
          bpm: "90",
          bitsPerPage: "16",
          pitchLevel: "1",
          songNotes: [{ time: "250", key: "Key2" }],
        }),
      ]),
    );

    expect(songs[0]?.bpm).toBe(90);
    expect(songs[0]?.bitsPerPage).toBe(16);
    expect(songs[0]?.pitchLevel).toBe(1);
    expect(songs[0]?.songNotes[0]?.time).toBe(250);
  });

  it("defaults optional numeric and boolean fields when missing", () => {
    const songs = parseScoreFileContent(
      JSON.stringify([
        {
          name: "Minimal Song",
          songNotes: [{ time: 0, key: "Key0" }],
        },
      ]),
    );

    expect(songs[0]).toMatchObject({
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: false,
    });
  });
});

describe("parseScoreFileContent error cases", () => {
  it("rejects an empty file", () => {
    expectImportError("   ", "emptyFile");
  });

  it("rejects invalid JSON", () => {
    expectImportError("{", "invalidJson");
  });

  it("rejects a top-level object", () => {
    expectImportError(JSON.stringify({ name: "x" }), "topLevelNotArray");
  });

  it("rejects an empty song array", () => {
    expectImportError(JSON.stringify([]), "emptySongArray");
  });

  it("rejects a non-object song", () => {
    expectImportError(JSON.stringify([null]), "songNotObject");
  });

  it("rejects a missing song name", () => {
    expectImportError(JSON.stringify([{ songNotes: [] }]), "songFieldInvalid");
  });

  it("rejects non-array songNotes", () => {
    expectImportError(
      JSON.stringify([createRawSong({ songNotes: "bad" })]),
      "songNotesInvalid",
    );
  });

  it("rejects numeric songNotes arrays as unsupported encrypted notes", () => {
    expectImportError(
      JSON.stringify([createRawSong({ songNotes: [1, 2, 3] })]),
      "encryptedSongNotesUnsupported",
    );
  });

  it("rejects a non-object note", () => {
    expectImportError(
      JSON.stringify([createRawSong({ songNotes: [null] })]),
      "noteNotObject",
    );
  });

  it("rejects an invalid note time", () => {
    expectImportError(
      JSON.stringify([
        createRawSong({ songNotes: [{ time: "bad", key: "Key0" }] }),
      ]),
      "noteTimeInvalid",
    );
  });

  it("rejects an invalid note key", () => {
    expectImportError(
      JSON.stringify([createRawSong({ songNotes: [{ time: 0, key: 1 }] })]),
      "noteKeyInvalid",
    );
  });
});
