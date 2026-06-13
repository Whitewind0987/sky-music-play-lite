import { describe, expect, it } from "vitest";
import { isSafeBuiltInScoreFileName } from "./builtinScoreIndex";

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
