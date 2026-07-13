import { describe, expect, it } from "vitest";
import { removeSongIndicesFromPlaybackQueue } from "../hooks/usePlaybackQueue";
import type { LibrarySong, LocalLibrarySong } from "../types/library";
import type { PlaybackMode } from "../types/playbackOptions";
import { decidePlaybackFinish } from "./playbackFlow";
import { resolveActivePlaybackSongIndex } from "./activePlaybackSong";

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

function resolveCompletion({
  librarySongs,
  playbackMode,
  queuedSongIndex = null,
  songId,
}: {
  librarySongs: LibrarySong[];
  playbackMode: PlaybackMode;
  queuedSongIndex?: number | null;
  songId: string | null;
}) {
  const currentSongIndex = resolveActivePlaybackSongIndex({
    librarySongs,
    songId,
  });

  return currentSongIndex === null
    ? null
    : {
        currentSongIndex,
        decision: decidePlaybackFinish({
          allowLibraryFallback: false,
          currentSongIndex,
          isShuffleEnabled: false,
          playbackMode,
          queuedSongIndex,
          songCount: librarySongs.length,
        }),
      };
}

describe("resolveActivePlaybackSongIndex", () => {
  it("resolves an active song ID to its latest index", () => {
    const librarySongs = [createLocalSong("A"), createLocalSong("B")];

    expect(
      resolveActivePlaybackSongIndex({ librarySongs, songId: "B" }),
    ).toBe(1);
  });

  it("resolves B from old index 1 to new index 0 after A is removed", () => {
    const latestLibrary = [createLocalSong("B"), createLocalSong("C")];

    expect(
      resolveActivePlaybackSongIndex({
        librarySongs: latestLibrary,
        songId: "B",
      }),
    ).toBe(0);
  });

  it("resolves the active song after multiple earlier removals", () => {
    const initialLibrary = ["A", "B", "C", "D", "E"].map(createLocalSong);
    const latestLibrary = initialLibrary.filter(
      (librarySong) => !["A", "B", "C"].includes(librarySong.id),
    );

    expect(
      resolveActivePlaybackSongIndex({
        librarySongs: latestLibrary,
        songId: "D",
      }),
    ).toBe(0);
  });

  it("returns null instead of another song at the stale numeric index", () => {
    const latestLibrary = [createLocalSong("A"), createLocalSong("C")];

    expect(
      resolveActivePlaybackSongIndex({
        librarySongs: latestLibrary,
        songId: "B-removed",
      }),
    ).toBeNull();
    expect(
      resolveActivePlaybackSongIndex({
        librarySongs: latestLibrary,
        songId: null,
      }),
    ).toBeNull();
  });
});

describe.each(["target-window", "foreground", "preview"])(
  "%s active playback completion",
  () => {
    const latestLibrary = [createLocalSong("B"), createLocalSong("C")];

    it("restarts B at its latest index in repeat-one mode", () => {
      const completion = resolveCompletion({
        librarySongs: latestLibrary,
        playbackMode: "repeat-one",
        songId: "B",
      });

      expect(completion).toEqual({
        currentSongIndex: 0,
        decision: { type: "repeat-current" },
      });
      expect(latestLibrary[completion?.currentSongIndex ?? -1]?.id).toBe("B");
    });

    it("passes B's latest index to repeat-all playback order", () => {
      const receivedCurrentIndices: number[] = [];
      const currentSongIndex = resolveActivePlaybackSongIndex({
        librarySongs: latestLibrary,
        songId: "B",
      });
      const playbackOrderNextSongIndex =
        currentSongIndex === null
          ? null
          : (() => {
              receivedCurrentIndices.push(currentSongIndex);
              return 1;
            })();
      const completion = resolveCompletion({
        librarySongs: latestLibrary,
        playbackMode: "repeat-all",
        queuedSongIndex: playbackOrderNextSongIndex,
        songId: "B",
      });

      expect(receivedCurrentIndices).toEqual([0]);
      expect(completion?.decision).toEqual({
        nextSongIndex: 1,
        type: "play-next",
      });
      expect(latestLibrary[1]?.id).toBe("C");
    });
  },
);

describe("active playback queue continuation", () => {
  it("uses the reindexed queued D after A is removed before active B", () => {
    const latestLibrary = [
      createLocalSong("B"),
      createLocalSong("C"),
      createLocalSong("D"),
    ];
    const [queuedItem] = removeSongIndicesFromPlaybackQueue(
      [{ addedAt: 1, id: "queue-D", songIndex: 3 }],
      [0],
    );
    const completion = resolveCompletion({
      librarySongs: latestLibrary,
      playbackMode: "repeat-all",
      queuedSongIndex: queuedItem?.songIndex ?? null,
      songId: "B",
    });

    expect(completion?.currentSongIndex).toBe(0);
    expect(completion?.decision).toEqual({
      nextSongIndex: 2,
      type: "play-next",
    });
    expect(latestLibrary[2]?.id).toBe("D");
  });

  it("does not start an unrelated song when the active song is gone", () => {
    expect(
      resolveCompletion({
        librarySongs: [createLocalSong("C")],
        playbackMode: "repeat-one",
        songId: "B-removed",
      }),
    ).toBeNull();
  });
});
