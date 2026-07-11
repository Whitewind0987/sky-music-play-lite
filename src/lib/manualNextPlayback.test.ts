import { describe, expect, it } from "vitest";
import type { LocalLibrarySong } from "../types/library";
import { resolveManualNextCurrentSong } from "./manualNextPlayback";

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

describe("resolveManualNextCurrentSong", () => {
  const librarySongs = ["A", "B", "C"].map(createLocalSong);
  const defaults = {
    activeForegroundSongId: null,
    activeTargetWindowSongId: null,
    contextSongId: null,
    pendingContextSongId: null,
    librarySongs,
    playbackSongIndex: null,
    selectedSongIndex: null,
  };

  it.each([
    ["foreground", { activeForegroundSongId: "B" }],
    ["target-window", { activeTargetWindowSongId: "B" }],
    ["playback-context", { contextSongId: "B" }],
    ["playback", { playbackSongIndex: 1 }],
    ["selected", { selectedSongIndex: 1 }],
  ] as const)("resolves the %s identity source", (source, overrides) => {
    expect(resolveManualNextCurrentSong({ ...defaults, ...overrides })).toEqual({
      status: "resolved",
      songId: "B",
      songIndex: 1,
      source,
    });
  });

  it("uses the latest index for a stable song ID", () => {
    expect(
      resolveManualNextCurrentSong({
        ...defaults,
        activeForegroundSongId: "B",
        librarySongs: [createLocalSong("B"), createLocalSong("C")],
      }),
    ).toMatchObject({ status: "resolved", songId: "B", songIndex: 0 });
  });

  it("does not fall back when a higher-priority stable ID is missing", () => {
    expect(
      resolveManualNextCurrentSong({
        ...defaults,
        activeForegroundSongId: "removed",
        playbackSongIndex: 1,
        selectedSongIndex: 0,
      }),
    ).toEqual({
      status: "context-unavailable",
      reason: "missing-current-song",
      source: "foreground",
    });
  });

  it("prioritizes foreground, target, context, playback, then selection", () => {
    expect(
      resolveManualNextCurrentSong({
        ...defaults,
        activeForegroundSongId: "C",
        activeTargetWindowSongId: "B",
        contextSongId: "A",
        playbackSongIndex: 1,
        selectedSongIndex: 0,
      }),
    ).toMatchObject({ source: "foreground", songId: "C" });
  });

  it("prioritizes pending C over accepted foreground or target-window B", () => {
    expect(
      resolveManualNextCurrentSong({
        ...defaults,
        pendingContextSongId: "C",
        activeForegroundSongId: "B",
        activeTargetWindowSongId: "B",
      }),
    ).toMatchObject({
      status: "resolved",
      source: "pending-playback-context",
      songId: "C",
    });
  });

  it("does not fall back when pending identity is missing", () => {
    expect(
      resolveManualNextCurrentSong({
        ...defaults,
        pendingContextSongId: "removed",
        activeForegroundSongId: "B",
      }),
    ).toEqual({
      status: "context-unavailable",
      reason: "missing-current-song",
      source: "pending-playback-context",
    });
  });
});
