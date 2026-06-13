// @ts-expect-error Node built-ins are available in the Vitest runtime.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
  parseScoreFileSongAtIndex,
  ScoreFileImportError,
  type ScoreFileImportErrorCode,
} from "./scoreFileImport";

const TEST_SHEET_DECRYPT_KEY = "TB,R&Q}-ULFXF7={nU7v?fy#Khr9Mhuu";
const TEST_SHEET_DECRYPT_SIGNATURE = "ztB_kaFeQe/wa8Kq{r_jz!r=P])hQL(f";

function encryptSongNotesForTest(notes: unknown, includeSignature = true) {
  const plaintext = `${JSON.stringify(notes)}${
    includeSignature ? TEST_SHEET_DECRYPT_SIGNATURE : ""
  }`;

  return Array.from(plaintext).map((character, index) => {
    const keyCharCode = TEST_SHEET_DECRYPT_KEY.charCodeAt(
      index % TEST_SHEET_DECRYPT_KEY.length,
    );

    return character.charCodeAt(0) + keyCharCode - 100;
  });
}

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

type BuiltInScoreIndex = {
  entries: Array<{
    durationMs: number;
    fileName: string;
    id: string;
    noteCount: number;
    songIndex: number;
    title: string;
  }>;
};

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

  it("imports encrypted numeric songNotes", () => {
    const encryptedNotes = encryptSongNotesForTest([
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ]);
    const songs = parseScoreFileContent(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          name: "Encrypted test",
          songNotes: encryptedNotes,
        }),
      ]),
    );

    expect(songs).toHaveLength(1);
    expect(songs[0]?.songNotes).toEqual([
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ]);
  });

  it("imports numeric songNotes when isEncrypted is missing", () => {
    const songs = parseScoreFileContent(
      JSON.stringify([
        createRawSong({
          isEncrypted: undefined,
          songNotes: encryptSongNotesForTest([
            { time: 250, key: "Key2" },
          ]),
        }),
      ]),
    );

    expect(songs[0]?.songNotes).toEqual([{ time: 250, key: "Key2" }]);
  });

  it("imports encrypted songNotes without a signature when JSON is valid", () => {
    const songs = parseScoreFileContent(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          songNotes: encryptSongNotesForTest(
            [{ time: 125, key: "Key3" }],
            false,
          ),
        }),
      ]),
    );

    expect(songs[0]?.songNotes).toEqual([{ time: 125, key: "Key3" }]);
  });
});

describe("parseScoreFileSongAtIndex", () => {
  const mixedSongContent = JSON.stringify([
    { name: "Invalid sibling", songNotes: "bad" },
    createRawSong({ name: "Playable built-in" }),
  ]);

  it("validates only the requested song", () => {
    const song = parseScoreFileSongAtIndex(mixedSongContent, 1);

    expect(song?.name).toBe("Playable built-in");
    expect(song?.songNotes).toEqual([
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ]);
  });

  it("keeps full user imports strict", () => {
    expect(() => parseScoreFileContent(mixedSongContent)).toThrow(
      ScoreFileImportError,
    );
  });

  it("returns null for an out-of-range song index", () => {
    expect(parseScoreFileSongAtIndex(mixedSongContent, 2)).toBeNull();
    expect(parseScoreFileSongAtIndex(mixedSongContent, -1)).toBeNull();
    expect(parseScoreFileSongAtIndex(mixedSongContent, 0.5)).toBeNull();
  });

  it("decrypts numeric song notes for the requested song", () => {
    const song = parseScoreFileSongAtIndex(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          name: "Encrypted built-in",
          songNotes: encryptSongNotesForTest([{ time: 125, key: "Key3" }]),
        }),
      ]),
      0,
    );

    expect(song?.songNotes).toEqual([{ time: 125, key: "Key3" }]);
  });

  it("parses every indexed built-in score entry", async () => {
    const indexUrl = new URL(
      "../../public/builtin-scores/index.json",
      import.meta.url,
    );
    const scoresDirectoryUrl = new URL(
      "../../public/builtin-scores/scores/",
      import.meta.url,
    );
    const index = JSON.parse(
      await readFile(indexUrl, "utf8"),
    ) as BuiltInScoreIndex;
    const scoreFileCache = new Map<string, string>();
    const failures: string[] = [];

    for (const entry of index.entries) {
      if (entry.noteCount <= 0) {
        continue;
      }

      try {
        const cachedRawScore = scoreFileCache.get(entry.fileName);
        let rawScore: string;

        if (cachedRawScore === undefined) {
          rawScore = (await readFile(
            new URL(encodeURIComponent(entry.fileName), scoresDirectoryUrl),
            "utf8",
          )) as string;
          scoreFileCache.set(entry.fileName, rawScore);
        } else {
          rawScore = cachedRawScore;
        }

        const song = parseScoreFileSongAtIndex(rawScore, entry.songIndex);
        const entryLabel = `${entry.title} / ${entry.id} / ${entry.fileName} / songIndex ${entry.songIndex}`;

        if (song === null) {
          failures.push(`${entryLabel}: returned null`);
          continue;
        }

        if (song.songNotes.length === 0) {
          failures.push(
            `${entryLabel}: parsed 0 notes, index noteCount ${entry.noteCount}`,
          );
          continue;
        }

        if (song.songNotes.length !== entry.noteCount) {
          failures.push(
            `${entryLabel}: parsed ${song.songNotes.length} notes, index noteCount ${entry.noteCount}`,
          );
        }
      } catch (error) {
        const entryLabel = `${entry.title} / ${entry.id} / ${entry.fileName} / songIndex ${entry.songIndex}`;

        if (error instanceof ScoreFileImportError) {
          failures.push(
            `${entryLabel}: ${error.code} ${JSON.stringify(error.details)}`,
          );
        } else {
          failures.push(`${entryLabel}: ${String(error)}`);
        }
      }
    }

    expect(failures.slice(0, 30)).toEqual([]);
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

  it("rejects invalid encrypted numeric notes with a controlled error", () => {
    expectImportError(
      JSON.stringify([createRawSong({ songNotes: [1, 2, 3] })]),
      "encryptedSongNotesDecryptFailed",
    );
  });

  it("rejects non-numeric songNotes marked as encrypted", () => {
    expectImportError(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          songNotes: [{ time: 0, key: "Key0" }],
        }),
      ]),
      "encryptedSongNotesDecryptFailed",
    );
  });

  it("rejects decrypted songNotes that are not an array", () => {
    expectImportError(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          songNotes: encryptSongNotesForTest({ time: 0, key: "Key0" }),
        }),
      ]),
      "decryptedSongNotesInvalid",
    );
  });

  it("validates notes after decrypting songNotes", () => {
    expectImportError(
      JSON.stringify([
        createRawSong({
          isEncrypted: true,
          songNotes: encryptSongNotesForTest([
            { time: "bad", key: "Key0" },
          ]),
        }),
      ]),
      "noteTimeInvalid",
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
