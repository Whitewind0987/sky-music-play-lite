import { describe, expect, it, vi } from "vitest";
import type { Song } from "../types/score";
import { persistRecordedSong } from "./recordedScoreLibrary";

const recordedSong: Song = {
  formatVersion: 1,
  name: "Recorded song",
  bpm: 120,
  bitsPerPage: 16,
  pitchLevel: 0,
  isComposed: true,
  songNotes: [
    { time: 0, key: "Key0" },
    { time: 240, key: "Key1" },
  ],
};

describe("persistRecordedSong", () => {
  it("creates normal local metadata and stores the exact song by its returned id", async () => {
    const saveImportedScoreSong = vi.fn().mockResolvedValue(undefined);

    const result = await persistRecordedSong({
      saveImportedScoreSong,
      song: recordedSong,
    });

    expect(saveImportedScoreSong).toHaveBeenCalledWith(
      result.id,
      recordedSong,
    );
    expect(result.source).toBe("local-import");
    expect(result.metadata.name).toBe(recordedSong.name);
    expect(result.metadata.noteCount).toBe(recordedSong.songNotes.length);
  });

  it("rejects without returning a successful library result when storage fails", async () => {
    const storageError = new Error("storage failed");
    const saveImportedScoreSong = vi.fn().mockRejectedValue(storageError);

    await expect(
      persistRecordedSong({ saveImportedScoreSong, song: recordedSong }),
    ).rejects.toBe(storageError);
    expect(saveImportedScoreSong).toHaveBeenCalledOnce();
  });

  it("persists identical recordings separately with distinct ids", async () => {
    const saveImportedScoreSong = vi.fn().mockResolvedValue(undefined);

    const first = await persistRecordedSong({
      saveImportedScoreSong,
      song: recordedSong,
    });
    const second = await persistRecordedSong({
      saveImportedScoreSong,
      song: recordedSong,
    });

    expect(first.id).not.toBe(second.id);
    expect(first.metadata.fingerprint).toBe(second.metadata.fingerprint);
    expect(saveImportedScoreSong).toHaveBeenNthCalledWith(
      1,
      first.id,
      recordedSong,
    );
    expect(saveImportedScoreSong).toHaveBeenNthCalledWith(
      2,
      second.id,
      recordedSong,
    );
  });
});
