import { describe, expect, it } from "vitest";
import type { Song } from "../types/score";
import { parseScoreFileContent } from "./scoreFileImport";
import { toCanonicalManagedSong } from "./scoreSerialization";

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    name: "Managed",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [{ time: 0, key: "Key0" }],
    ...overrides,
  };
}

describe("toCanonicalManagedSong", () => {
  it("round trips v2 marker and duration through a managed file", () => {
    const managedSong = toCanonicalManagedSong(
      createSong({
        formatVersion: 2,
        songNotes: [{ time: 0, key: "Key0", duration: 1500 }],
      }),
    );
    const [reimported] = parseScoreFileContent(JSON.stringify([managedSong]));

    expect(reimported?.formatVersion).toBe(2);
    expect(reimported?.songNotes[0]?.duration).toBe(1500);
  });

  it("upgrades normalized notes with durations to canonical v2", () => {
    const managedSong = toCanonicalManagedSong(
      createSong({ songNotes: [{ time: 0, key: "Key0", duration: 800 }] }),
    );

    expect(managedSong.formatVersion).toBe(2);
  });

  it("preserves an explicit v2 marker without durations", () => {
    expect(toCanonicalManagedSong(createSong({ formatVersion: 2 })).formatVersion).toBe(2);
  });

  it("does not convert an ordinary v1 song", () => {
    expect(toCanonicalManagedSong(createSong()).formatVersion).toBeUndefined();
  });
});
