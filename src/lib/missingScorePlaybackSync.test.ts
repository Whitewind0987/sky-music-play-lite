import { describe, expect, it } from "vitest";
import {
  removeSongFromActivePlaybackContext,
  type ActivePlaybackContext,
} from "../hooks/usePlaybackOrder";
import { removeSongIndicesFromPlaybackQueue } from "../hooks/usePlaybackQueue";
import type {
  BuiltInLibrarySong,
  LibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import {
  collectRemovedLibrarySongs,
  synchronizeRemovedLibrarySongsWithPlayback,
} from "./missingScorePlaybackSync";

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

function createBuiltInSong(id: string): BuiltInLibrarySong {
  return {
    id,
    importedAt: 0,
    song: {
      bitsPerPage: 16,
      bpm: 120,
      isComposed: false,
      name: id,
      pitchLevel: 0,
      songNotes: [],
    },
    source: "built-in",
  };
}

function createQueueItem(songIndex: number): PlaybackQueueItem {
  return { addedAt: songIndex, id: `queue-${songIndex}`, songIndex };
}

describe("missing score playback synchronization", () => {
  it("captures original global indices across built-in and local songs", () => {
    const librarySongs: LibrarySong[] = [
      createBuiltInSong("builtin-1"),
      createBuiltInSong("builtin-2"),
      createLocalSong("local-missing-1"),
      createLocalSong("local-kept"),
      createLocalSong("local-missing-2"),
    ];

    expect(
      collectRemovedLibrarySongs(librarySongs, [
        "local-missing-2",
        "local-missing-1",
      ]),
    ).toEqual([
      { songId: "local-missing-1", songIndex: 2 },
      { songId: "local-missing-2", songIndex: 4 },
    ]);
  });

  it("updates queue indices and playback-order IDs together", () => {
    let queueItems = [
      createQueueItem(1),
      createQueueItem(2),
      createQueueItem(3),
      createQueueItem(5),
    ];
    let playbackContext: ActivePlaybackContext | null = {
      currentSongId: "builtin-2",
      songIds: ["builtin-2", "local-missing-1", "local-kept", "local-missing-2"],
      source: "local-imports",
    };

    synchronizeRemovedLibrarySongsWithPlayback(
      [
        { songId: "local-missing-1", songIndex: 2 },
        { songId: "local-missing-2", songIndex: 4 },
      ],
      {
        removeSongFromPlaybackContext: (songId) => {
          playbackContext = removeSongFromActivePlaybackContext(
            playbackContext,
            songId,
          );
        },
        removeSongIndices: (songIndices) => {
          queueItems = removeSongIndicesFromPlaybackQueue(
            queueItems,
            songIndices,
          );
        },
      },
    );

    expect(queueItems.map((item) => item.songIndex)).toEqual([1, 2, 3]);
    expect(playbackContext).toEqual({
      currentSongId: "builtin-2",
      songIds: ["builtin-2", "local-kept"],
      source: "local-imports",
    });
  });

  it("does not invoke playback cleanup when there are no runtime removals", () => {
    const removedSongIndices: number[][] = [];
    const removedSongIds: string[] = [];

    synchronizeRemovedLibrarySongsWithPlayback([], {
      removeSongFromPlaybackContext: (songId) => removedSongIds.push(songId),
      removeSongIndices: (songIndices) => removedSongIndices.push(songIndices),
    });

    expect(removedSongIndices).toEqual([]);
    expect(removedSongIds).toEqual([]);
  });
});
