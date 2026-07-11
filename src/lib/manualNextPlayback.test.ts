import { describe, expect, it } from "vitest";
import { getOrderedNextSongId } from "../hooks/usePlaybackOrder";
import type { LocalLibrarySong } from "../types/library";
import { resolveManualNextCurrentSongIndex } from "./manualNextPlayback";

function createLocalSong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 0,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: id,
      isComposed: false,
      lastNoteTimeMs: 0,
      name: id,
      noteCount: 0,
      noteGroupCount: 0,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

describe("resolveManualNextCurrentSongIndex", () => {
  const librarySongs = ["A", "B", "C"].map(createLocalSong);

  it("uses active foreground B when UI selection is also B", () => {
    const currentSongIndex = resolveManualNextCurrentSongIndex({
      activeSongId: "B",
      librarySongs,
      playbackSongIndex: 1,
      selectedSongIndex: 1,
    });

    expect(currentSongIndex).toBe(1);
    expect(
      getOrderedNextSongId(
        librarySongs.map((song) => song.id),
        currentSongIndex ?? -1,
        "sequence",
      ),
    ).toBe("C");
  });

  it("uses active foreground B even when UI selection changed to A", () => {
    const currentSongIndex = resolveManualNextCurrentSongIndex({
      activeSongId: "B",
      librarySongs,
      playbackSongIndex: 1,
      selectedSongIndex: 0,
    });

    expect(currentSongIndex).toBe(1);
    expect(librarySongs[(currentSongIndex ?? -1) + 1]?.id).toBe("C");
  });

  it("resolves B at its latest index after an earlier song is removed", () => {
    const latestLibrary = [createLocalSong("B"), createLocalSong("C")];

    expect(
      resolveManualNextCurrentSongIndex({
        activeSongId: "B",
        librarySongs: latestLibrary,
        playbackSongIndex: 0,
        selectedSongIndex: 1,
      }),
    ).toBe(0);
  });

  it("does not fall back to an unrelated selection when active B is missing", () => {
    expect(
      resolveManualNextCurrentSongIndex({
        activeSongId: "B-removed",
        librarySongs: [createLocalSong("A"), createLocalSong("C")],
        playbackSongIndex: 1,
        selectedSongIndex: 0,
      }),
    ).toBeNull();
  });

  it("falls back to current playback before UI selection without an active session", () => {
    expect(
      resolveManualNextCurrentSongIndex({
        activeSongId: null,
        librarySongs,
        playbackSongIndex: 1,
        selectedSongIndex: 0,
      }),
    ).toBe(1);
    expect(
      resolveManualNextCurrentSongIndex({
        activeSongId: null,
        librarySongs,
        playbackSongIndex: null,
        selectedSongIndex: 0,
      }),
    ).toBe(0);
  });

  it("preserves genuine end-of-list behavior", () => {
    const currentSongIndex = resolveManualNextCurrentSongIndex({
      activeSongId: "C",
      librarySongs,
      playbackSongIndex: 2,
      selectedSongIndex: 0,
    });

    expect(currentSongIndex).toBe(2);
    expect(
      getOrderedNextSongId(
        librarySongs.map((song) => song.id),
        currentSongIndex ?? -1,
        "sequence",
      ),
    ).toBeNull();
  });
});
