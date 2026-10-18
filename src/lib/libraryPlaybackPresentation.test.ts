import { describe, expect, it } from "vitest";
import type { ManualPlaybackUiState } from "./manualPlaybackState";
import type { PlaybackState } from "../types/playback";
import { getLibraryPlaybackIndicator } from "./libraryPlaybackPresentation";

const activeRow = {
  songId: "playing-song",
  playbackSongId: "playing-song",
  playbackState: "playing" as PlaybackState,
  manualState: "idle" as ManualPlaybackUiState,
};

describe("library playback presentation", () => {
  it("never marks a different selected or visible song as playing", () => {
    expect(getLibraryPlaybackIndicator({ ...activeRow, songId: "selected-song" }))
      .toBeNull();
    expect(getLibraryPlaybackIndicator({ ...activeRow, playbackSongId: null }))
      .toBeNull();
  });

  it("distinguishes the active song's paused state", () => {
    expect(getLibraryPlaybackIndicator(activeRow)).toBe("playing");
    expect(getLibraryPlaybackIndicator({ ...activeRow, playbackState: "paused" }))
      .toBe("paused");
  });

  it.each(["idle", "finished"] as const)("does not present %s as active playback", (playbackState) => {
    expect(getLibraryPlaybackIndicator({ ...activeRow, playbackState })).toBeNull();
  });

  it("uses manual session state instead of a stale automatic paused state", () => {
    expect(getLibraryPlaybackIndicator({
      ...activeRow,
      playbackState: "paused",
      manualState: "active",
    })).toBe("manual");
    expect(getLibraryPlaybackIndicator({ ...activeRow, manualState: "tail" }))
      .toBe("releasing");
    expect(getLibraryPlaybackIndicator({
      ...activeRow,
      songId: "selected-song",
      manualState: "active",
    })).toBeNull();
  });

  it.each(["starting", "finished", "error"] as const)("does not reuse automatic playback for manual %s", (manualState) => {
    expect(getLibraryPlaybackIndicator({ ...activeRow, manualState })).toBeNull();
  });
});
