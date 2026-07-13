import { describe, expect, it } from "vitest";
import { resolveBackgroundHandoffRollbackSongIndex } from "./backgroundHandoffRollback";
import { shouldStopPlaybackForRemovedSong } from "./missingScorePlaybackActivity";
import type { LocalLibrarySong } from "../types/library";

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

describe("shouldStopPlaybackForRemovedSong", () => {
  it("keeps a pending target-window handoff alive when only its provisional song is removed", () => {
    let activeHandoffToken = 8;
    const shouldStop = shouldStopPlaybackForRemovedSong({
      activePlaybackSongIds: [null, null, "B-current"],
      removedPlaybackSongId: "A-missing",
    });

    expect(shouldStop).toBe(false);
    if (shouldStop) {
      activeHandoffToken += 1;
    }
    expect(activeHandoffToken).toBe(8);
  });

  it("allows the current handoff to restore B at its latest index after A is removed", () => {
    const handoffToken = 8;
    const latestLibrary = [
      createLocalSong("B-current"),
      createLocalSong("C"),
    ];

    const rollbackSongIndex = resolveBackgroundHandoffRollbackSongIndex({
      activeHandoffToken: handoffToken,
      handoffToken,
      librarySongs: latestLibrary,
      rollbackPlaybackSongId: "B-current",
    });

    expect(rollbackSongIndex).toBe(0);
    expect(
      rollbackSongIndex === null || rollbackSongIndex === undefined
        ? null
        : latestLibrary[rollbackSongIndex]?.id,
    ).toBe("B-current");
  });

  it("stops preview, foreground, or target-window playback when its own song is removed", () => {
    expect(
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: ["A", null, null],
        removedPlaybackSongId: "A",
      }),
    ).toBe(true);
    expect(
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: [null, "A", null],
        removedPlaybackSongId: "A",
      }),
    ).toBe(true);
    expect(
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: [null, null, "A"],
        removedPlaybackSongId: "A",
      }),
    ).toBe(true);
  });

  it("does not stop unrelated or idle playback", () => {
    expect(
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: ["B", null, null],
        removedPlaybackSongId: "A",
      }),
    ).toBe(false);
    expect(
      shouldStopPlaybackForRemovedSong({
        activePlaybackSongIds: [null, null, null],
        removedPlaybackSongId: "A",
      }),
    ).toBe(false);
  });
});
