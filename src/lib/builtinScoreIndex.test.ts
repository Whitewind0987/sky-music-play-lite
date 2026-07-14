import { describe, expect, it } from "vitest";
import {
  isSafeBuiltInScoreFileName,
  sanitizeBuiltInScoreIndex,
} from "./builtinScoreIndex";

describe("isSafeBuiltInScoreFileName", () => {
  it.each(["SOS-151200.txt", "ABC.json", "song-name.txt", "song_name.json"])(
    "accepts safe built-in score file name %s",
    (fileName) => {
      expect(isSafeBuiltInScoreFileName(fileName)).toBe(true);
    },
  );

  it.each([
    "../SOS-151200.txt",
    "folder/SOS-151200.txt",
    "folder\\SOS-151200.txt",
    "..\\SOS-151200.txt",
    ".hidden.txt",
    "bad name.txt",
    "SOS-151200.mp3",
  ])("rejects unsafe built-in score file name %s", (fileName) => {
    expect(isSafeBuiltInScoreFileName(fileName)).toBe(false);
  });
});

describe("sanitizeBuiltInScoreIndex", () => {
  function createEntry(formatVersion?: unknown) {
    return {
      bpm: 120,
      bitsPerPage: 16,
      durationMs: 1000,
      fileName: "score.json",
      ...(formatVersion === undefined ? {} : { formatVersion }),
      id: "builtin:score:0",
      isComposed: false,
      noteCount: 1,
      pitchLevel: 0,
      songIndex: 0,
      title: "Score",
    };
  }

  it("preserves explicit V2 and treats all other index markers as V1", () => {
    const result = sanitizeBuiltInScoreIndex({
      entries: [createEntry(2), createEntry(1), createEntry()],
    });

    expect(result.entries.map((entry) => entry.formatVersion)).toEqual([
      2, 1, 1,
    ]);
  });
});
