import { describe, expect, it } from "vitest";
import type { LibrarySong } from "../types/library";
import type { Song } from "../types/score";
import { parseScoreFileContent } from "./scoreFileImport";
import {
  storeUniqueImportedSongs,
  type ParsedImportedSong,
} from "./scoreLibraryImport";

const TEST_SHEET_DECRYPT_KEY = "TB,R&Q}-ULFXF7={nU7v?fy#Khr9Mhuu";
const TEST_SHEET_DECRYPT_SIGNATURE = "ztB_kaFeQe/wa8Kq{r_jz!r=P])hQL(f";

function encryptSongNotesForTest(notes: unknown) {
  const plaintext = `${JSON.stringify(notes)}${TEST_SHEET_DECRYPT_SIGNATURE}`;

  return Array.from(plaintext).map((character, index) => {
    const keyCharCode = TEST_SHEET_DECRYPT_KEY.charCodeAt(
      index % TEST_SHEET_DECRYPT_KEY.length,
    );

    return character.charCodeAt(0) + keyCharCode - 100;
  });
}

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    name: "Test Song",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [
      { time: 0, key: "1Key0" },
      { time: 500, key: "1Key1" },
    ],
    ...overrides,
  };
}

function createImportedSong(song: Song, fileName = "song.json"): ParsedImportedSong {
  return { fileName, song };
}

function createLibrarySongFactory() {
  let nextId = 0;

  return (song: Song): LibrarySong => {
    nextId += 1;

    return {
      id: `local-test-${nextId}`,
      importedAt: nextId,
      song,
      source: "local-import",
    };
  };
}

function createExistingLibrarySong(song: Song): LibrarySong {
  return {
    id: "local-existing",
    importedAt: 1,
    song,
    source: "local-import",
  };
}

describe("storeUniqueImportedSongs", () => {
  it("writes one normal imported song before returning it for library state", async () => {
    const song = createSong({ name: "Normal" });
    const writes: Array<{ song: Song; songId: string }> = [];

    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [createImportedSong(song)],
      saveImportedScoreSong: async (songId, savedSong) => {
        writes.push({ song: savedSong, songId });
      },
    });

    expect(writes).toEqual([{ song, songId: "local-test-1" }]);
    expect(result.storedLibrarySongs.map((librarySong) => librarySong.id)).toEqual([
      "local-test-1",
    ]);
    expect(result.failedImports).toEqual([]);
  });

  it("passes encrypted songs to storage in decrypted normalized form", async () => {
    const [song] = parseScoreFileContent(
      JSON.stringify([
        {
          name: "Encrypted",
          bpm: "90",
          bitsPerPage: "15",
          pitchLevel: "1",
          isComposed: "true",
          isEncrypted: true,
          isRelativeTime: true,
          songNotes: encryptSongNotesForTest([
            { time: 0, key: "1Key0" },
            { time: 250, key: "1Key1" },
            { time: 250, key: "1Key2" },
          ]),
        },
      ]),
    );
    const writes: Array<{ song: Song; songId: string }> = [];

    await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [createImportedSong(song)],
      saveImportedScoreSong: async (songId, savedSong) => {
        writes.push({ song: savedSong, songId });
      },
    });

    expect(writes[0]?.song).toEqual({
      name: "Encrypted",
      bpm: 90,
      bitsPerPage: 15,
      pitchLevel: 1,
      isComposed: true,
      songNotes: [
        { time: 0, key: "1Key0" },
        { time: 250, key: "1Key1" },
        { time: 500, key: "1Key2" },
      ],
    });
    expect(JSON.stringify(writes[0]?.song)).not.toContain("isEncrypted");
  });

  it("writes each song from a multi-song source independently", async () => {
    const writes: string[] = [];

    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [
        createImportedSong(createSong({ name: "First" }), "multi.json"),
        createImportedSong(createSong({ name: "Second" }), "multi.json"),
      ],
      saveImportedScoreSong: async (songId) => {
        writes.push(songId);
      },
    });

    expect(writes).toEqual(["local-test-1", "local-test-2"]);
    expect(result.storedLibrarySongs.map((librarySong) => librarySong.song.name)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("does not return a song for library state when its storage write fails", async () => {
    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [createImportedSong(createSong({ name: "Broken" }))],
      saveImportedScoreSong: async () => {
        throw new Error("disk is full");
      },
    });

    expect(result.storedLibrarySongs).toEqual([]);
    expect(result.failedImports).toEqual([
      { error: "disk is full", fileName: "song.json" },
    ]);
  });

  it("keeps partial success when one storage write fails", async () => {
    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [
        createImportedSong(createSong({ name: "First" })),
        createImportedSong(createSong({ name: "Second" })),
        createImportedSong(createSong({ name: "Third" })),
      ],
      saveImportedScoreSong: async (songId) => {
        if (songId === "local-test-2") {
          throw new Error("permission denied");
        }
      },
    });

    expect(result.storedLibrarySongs.map((librarySong) => librarySong.song.name)).toEqual([
      "First",
      "Third",
    ]);
    expect(result.failedImports).toEqual([
      { error: "permission denied", fileName: "song.json" },
    ]);
  });

  it("does not write duplicate songs", async () => {
    const duplicate = createSong({ name: "Duplicate" });
    const writes: string[] = [];

    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [createExistingLibrarySong(duplicate)],
      importedSongs: [createImportedSong(duplicate)],
      saveImportedScoreSong: async (songId) => {
        writes.push(songId);
      },
    });

    expect(writes).toEqual([]);
    expect(result.storedLibrarySongs).toEqual([]);
    expect(result.skippedDuplicateSongs).toEqual([duplicate]);
  });

  it("keeps the first successful song first when an earlier write fails", async () => {
    const result = await storeUniqueImportedSongs({
      createLibrarySong: createLibrarySongFactory(),
      existingLibrarySongs: [],
      importedSongs: [
        createImportedSong(createSong({ name: "Fails" })),
        createImportedSong(createSong({ name: "First Success" })),
      ],
      saveImportedScoreSong: async (songId) => {
        if (songId === "local-test-1") {
          throw new Error("write failed");
        }
      },
    });

    expect(result.storedLibrarySongs[0]?.song.name).toBe("First Success");
  });
});
