import { describe, expect, it, vi } from "vitest";
import { defaultKeyMapping } from "../types/keyMapping";
import type { LocalLibrarySong } from "../types/library";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
} from "../types/playbackOptions";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import type { Song } from "../types/score";
import { buildPersistedAppData } from "./appData";
import {
  decideImportedScoreStorageTrust,
  normalizeImportedScoreStoragePath,
  recoverAndCleanupImportedScoreLibrary,
  recoverOrphanedImportedScores,
} from "./importedScoreRecovery";
import { createLocalSongMetadata } from "./libraryCollections";
import type { ImportedScoreFileMetadata } from "./tauriApi";

function song(name: string): Song {
  return {
    bitsPerPage: 15,
    bpm: 120,
    isComposed: true,
    name,
    pitchLevel: 0,
    songNotes: [{ key: "Key0", time: 0 }],
  };
}

function librarySong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 1,
    metadata: createLocalSongMetadata(song(id)),
    source: "local-import",
  };
}

function file(id: string, modifiedMs: number | null = 123): ImportedScoreFileMetadata {
  return {
    fileName: `${id}.json`,
    id,
    modifiedMs,
    path: `C:\\scores\\${id}.json`,
    sizeBytes: 10,
  };
}

function appData(librarySongs: LocalLibrarySong[] = []) {
  return buildPersistedAppData({
    isShuffleEnabled: false,
    keyMapping: defaultKeyMapping,
    language: "zh-CN",
    librarySongs,
    likedSongs: [{ likedAt: 2, songId: "local-orphan" }],
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackMode: defaultPlaybackMode,
    playbackShortcuts: defaultPlaybackShortcuts,
    playbackSpeed: defaultPlaybackSpeed,
    playlists: [{
      createdAt: 1,
      id: "playlist-1",
      name: "Recovered",
      songIds: ["local-orphan"],
      updatedAt: 2,
    }],
    selectedLibraryCategory: "local-imports",
    selectedPlaylistId: "playlist-1",
    selectedSongIndex: null,
    validCollectionSongIds: ["local-orphan"],
  });
}

describe("imported score storage trust", () => {
  it("compares Windows paths case-insensitively and ignores separators", () => {
    expect(normalizeImportedScoreStoragePath("C:/App/imported-scores/"))
      .toBe(normalizeImportedScoreStoragePath("c:\\app\\imported-scores"));
  });

  it("rejects a different persisted directory even when IDs match", () => {
    expect(decideImportedScoreStorageTrust({
      currentStoragePath: "C:\\dev\\imported-scores",
      fileMetadata: [file("local-1")],
      librarySongs: [librarySong("local-1")],
      persistedStoragePath: "C:\\installed\\imported-scores",
    })).toEqual({ reason: "path-mismatch", trusted: false });
  });

  it("trusts a legacy record only when a managed file ID matches", () => {
    const base = {
      currentStoragePath: "C:\\app\\imported-scores",
      librarySongs: [librarySong("local-1")],
    };

    expect(decideImportedScoreStorageTrust({ ...base, fileMetadata: [] }))
      .toEqual({ reason: "unverified-legacy-path", trusted: false });
    expect(decideImportedScoreStorageTrust({
      ...base,
      fileMetadata: [file("local-1")],
    })).toEqual({ reason: "matching-song", trusted: true });
  });

  it("trusts an empty library so orphan files can restore it", () => {
    expect(decideImportedScoreStorageTrust({
      currentStoragePath: "C:\\app\\imported-scores",
      fileMetadata: [file("local-orphan")],
      librarySongs: [],
    })).toEqual({ reason: "empty-library", trusted: true });
  });
});

describe("orphaned imported score recovery", () => {
  it("reproduces the upgrade regression without deleting production collections", async () => {
    const productionSong = librarySong("local-production");
    const persisted = buildPersistedAppData({
      isShuffleEnabled: false,
      keyMapping: defaultKeyMapping,
      language: "zh-CN",
      librarySongs: [productionSong],
      likedSongs: [{ likedAt: 1, songId: productionSong.id }],
      noteIntervalDelayMs: defaultNoteIntervalDelayMs,
      playbackMode: defaultPlaybackMode,
      playbackShortcuts: defaultPlaybackShortcuts,
      playbackSpeed: defaultPlaybackSpeed,
      playlists: [{ createdAt: 1, id: "p", name: "P", songIds: [productionSong.id], updatedAt: 1 }],
      selectedLibraryCategory: "local-imports",
      selectedPlaylistId: "p",
      selectedSongIndex: 0,
      validCollectionSongIds: [productionSong.id],
    });
    const trust = decideImportedScoreStorageTrust({
      currentStoragePath: "C:\\repo\\target\\debug\\imported-scores",
      fileMetadata: [],
      librarySongs: persisted.library.librarySongs,
    });
    expect(trust).toEqual({ reason: "unverified-legacy-path", trusted: false });
    const readSong = vi.fn();
    const result = await recoverAndCleanupImportedScoreLibrary({
      appData: persisted,
      fileMetadata: [],
      readSong,
      trust,
    });

    expect(result.appData).toBe(persisted);
    expect(result.removedSongIds).toEqual([]);
    expect(result.appData.library.librarySongs).toEqual([productionSong]);
    expect(result.appData.library.likedSongs).toHaveLength(1);
    expect(result.appData.library.playlists[0]?.songIds).toEqual([productionSong.id]);
    expect(readSong).not.toHaveBeenCalled();
  });

  it("restores metadata, original ID, collections, and modification time", async () => {
    const persisted = appData();
    const result = await recoverOrphanedImportedScores({
      appData: persisted,
      fileMetadata: [file("local-orphan", 456)],
      readSong: vi.fn().mockResolvedValue(song("Orphan")),
    });

    expect(result.recoveredSongIds).toEqual(["local-orphan"]);
    expect(result.appData.library.librarySongs[0]).toMatchObject({
      id: "local-orphan",
      importedAt: 456,
      metadata: { name: "Orphan", noteCount: 1 },
      source: "local-import",
    });
    expect(result.appData.library.likedSongs).toEqual(persisted.library.likedSongs);
    expect(result.appData.library.playlists).toEqual(persisted.library.playlists);
  });

  it("isolates corrupt files, recovers valid siblings, and uses a safe timestamp", async () => {
    const onFailure = vi.fn();
    const readSong = vi.fn(async (id: string) => {
      if (id === "local-bad") throw new Error("corrupt");
      return song("Good");
    });
    const result = await recoverOrphanedImportedScores({
      appData: appData(),
      fileMetadata: [file("local-bad"), file("local-good", Number.MAX_VALUE)],
      now: () => 999,
      onFailure,
      readSong,
    });

    expect(result.recoveredSongIds).toEqual(["local-good"]);
    expect(result.appData.library.librarySongs[0]?.importedAt).toBe(999);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ songId: "local-bad" }));
  });

  it("is idempotent and does not reread an already restored ID", async () => {
    const readSong = vi.fn().mockResolvedValue(song("Once"));
    const first = await recoverOrphanedImportedScores({
      appData: appData(),
      fileMetadata: [file("local-orphan")],
      readSong,
    });
    const second = await recoverOrphanedImportedScores({
      appData: first.appData,
      fileMetadata: [file("local-orphan")],
      readSong,
    });

    expect(second.recoveredSongIds).toEqual([]);
    expect(readSong).toHaveBeenCalledTimes(1);
  });
});
