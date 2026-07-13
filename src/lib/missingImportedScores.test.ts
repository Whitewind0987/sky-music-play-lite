import { describe, expect, it, vi } from "vitest";
import type {
  LocalLibrarySong,
  MigrationFallbackSongs,
  UserPlaylist,
} from "../types/library";
import type { ImportedScoreFileMetadata } from "./tauriApi";
import {
  cleanupMissingImportedScores,
  cleanupMissingImportedScoresFromPersistedLibrary,
  getMissingImportedScoreIds,
  resolveImportedScoreAfterExistenceCheck,
} from "./missingImportedScores";

function createLocalSong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: {
      bitsPerPage: 15,
      bpm: 120,
      fingerprint: `fingerprint-${id}`,
      isComposed: false,
      lastNoteTimeMs: 100,
      name: id,
      noteCount: 1,
      noteGroupCount: 1,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

function createFileMetadata(id: string): ImportedScoreFileMetadata {
  return {
    fileName: `${id}.json`,
    id,
    modifiedMs: 1,
    path: `C:/scores/${id}.json`,
    sizeBytes: 1,
  };
}

function createPlaylist(songIds: string[]): UserPlaylist {
  return {
    createdAt: 1,
    id: "playlist-1",
    name: "Playlist",
    songIds,
    updatedAt: 1,
  };
}

describe("missing imported score cleanup", () => {
  it("does not mark storage-migration failures as missing", () => {
    expect(
      getMissingImportedScoreIds({
        fileMetadata: [],
        localLibrarySongs: [createLocalSong("local-protected")],
        migrationFallbackSongs: {},
        protectedSongIds: ["local-protected"],
      }),
    ).toEqual([]);
  });

  it("keeps local records that have matching managed files", () => {
    const localLibrarySongs = [createLocalSong("local-1")];

    expect(
      getMissingImportedScoreIds({
        fileMetadata: [createFileMetadata("local-1")],
        localLibrarySongs,
        migrationFallbackSongs: {},
      }),
    ).toEqual([]);
  });

  it("finds local records absent from a successful file inventory", () => {
    expect(
      getMissingImportedScoreIds({
        fileMetadata: [createFileMetadata("local-1")],
        localLibrarySongs: [
          createLocalSong("local-1"),
          createLocalSong("local-2"),
        ],
        migrationFallbackSongs: {},
      }),
    ).toEqual(["local-2"]);
  });

  it("does not mark records with unverified migration fallbacks as missing", () => {
    const migrationFallbackSongs: MigrationFallbackSongs = {
      "local-1": {
        bitsPerPage: 15,
        bpm: 120,
        isComposed: false,
        name: "Fallback",
        pitchLevel: 0,
        songNotes: [],
      },
    };

    expect(
      getMissingImportedScoreIds({
        fileMetadata: [],
        localLibrarySongs: [createLocalSong("local-1")],
        migrationFallbackSongs,
      }),
    ).toEqual([]);
  });

  it("removes missing IDs from local records, collections, and fallbacks", () => {
    const result = cleanupMissingImportedScores({
      likedSongs: [
        { likedAt: 1, songId: "local-1" },
        { likedAt: 2, songId: "local-2" },
      ],
      localLibrarySongs: [
        createLocalSong("local-1"),
        createLocalSong("local-2"),
      ],
      migrationFallbackSongs: {},
      missingSongIds: ["local-1"],
      playbackSongId: "local-1",
      playlists: [createPlaylist(["local-2", "local-1", "local-3"])],
      selectedSongId: "local-1",
    });

    expect(result.removedSongIds).toEqual(["local-1"]);
    expect(result.localLibrarySongs.map((song) => song.id)).toEqual([
      "local-2",
    ]);
    expect(result.likedSongs).toEqual([{ likedAt: 2, songId: "local-2" }]);
    expect(result.playlists[0]?.songIds).toEqual(["local-2", "local-3"]);
    expect(result.selectedSongId).toBeNull();
    expect(result.playbackSongId).toBeNull();
  });

  it("removes every eligible record for an empty successful inventory", () => {
    const result = cleanupMissingImportedScores({
      likedSongs: [],
      localLibrarySongs: [
        createLocalSong("local-1"),
        createLocalSong("local-2"),
      ],
      migrationFallbackSongs: {},
      missingSongIds: ["local-1", "local-2"],
      playbackSongId: null,
      playlists: [createPlaylist(["local-1", "local-2"])],
      selectedSongId: null,
    });

    expect(result.localLibrarySongs).toEqual([]);
    expect(result.playlists[0]?.songIds).toEqual([]);
  });

  it("is idempotent and leaves protected fallback records intact", () => {
    const fallbackSongs: MigrationFallbackSongs = {
      "local-1": {
        bitsPerPage: 15,
        bpm: 120,
        isComposed: false,
        name: "Fallback",
        pitchLevel: 0,
        songNotes: [],
      },
    };
    const first = cleanupMissingImportedScores({
      likedSongs: [],
      localLibrarySongs: [createLocalSong("local-1")],
      migrationFallbackSongs: fallbackSongs,
      missingSongIds: ["local-1"],
      playbackSongId: null,
      playlists: [],
      selectedSongId: null,
    });
    const second = cleanupMissingImportedScores({
      ...first,
      missingSongIds: ["local-1"],
    });

    expect(first.removedSongIds).toEqual([]);
    expect(second.removedSongIds).toEqual([]);
    expect(second.localLibrarySongs).toEqual([createLocalSong("local-1")]);
  });

  it("deduplicates file metadata IDs when computing missing records", () => {
    expect(
      getMissingImportedScoreIds({
        fileMetadata: [
          createFileMetadata("local-1"),
          createFileMetadata("local-1"),
        ],
        localLibrarySongs: [createLocalSong("local-1")],
        migrationFallbackSongs: {},
      }),
    ).toEqual([]);
  });

  it("cleans persisted references after a successful startup inventory", () => {
    const result = cleanupMissingImportedScoresFromPersistedLibrary({
      fileMetadata: [createFileMetadata("local-2")],
      library: {
        librarySongs: [createLocalSong("local-1"), createLocalSong("local-2")],
        likedSongs: [{ likedAt: 1, songId: "local-1" }],
        playlists: [createPlaylist(["local-1", "local-2"])],
        selectedLibraryCategory: "local-imports",
        selectedPlaylistId: null,
        selectedSongIndex: 1,
      },
    });

    expect(result.removedSongIds).toEqual(["local-1"]);
    expect(result.library.librarySongs.map((song) => song.id)).toEqual([
      "local-2",
    ]);
    expect(result.library.likedSongs).toEqual([]);
    expect(result.library.playlists[0]?.songIds).toEqual(["local-2"]);
    expect(result.library.selectedSongIndex).toBe(0);
  });

  it("removes a confirmed-missing score before the cached load path can run", async () => {
    const load = vi.fn().mockResolvedValue({ name: "cached" });
    const onMissing = vi.fn().mockReturnValue(true);

    await expect(
      resolveImportedScoreAfterExistenceCheck({
        fileExists: async () => false,
        load,
        onMissing,
      }),
    ).resolves.toBeNull();

    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the existing load path when the file exists or checking fails", async () => {
    const existingLoad = vi.fn().mockResolvedValue({ name: "cached" });
    const failedCheckLoad = vi.fn().mockResolvedValue({ name: "cached" });

    await expect(
      resolveImportedScoreAfterExistenceCheck({
        fileExists: async () => true,
        load: existingLoad,
        onMissing: vi.fn(),
      }),
    ).resolves.toEqual({ name: "cached" });
    await expect(
      resolveImportedScoreAfterExistenceCheck({
        fileExists: async () => {
          throw new Error("IPC");
        },
        load: failedCheckLoad,
        onMissing: vi.fn(),
      }),
    ).resolves.toEqual({ name: "cached" });

    expect(existingLoad).toHaveBeenCalledTimes(1);
    expect(failedCheckLoad).toHaveBeenCalledTimes(1);
  });
});
