import { describe, expect, it, vi } from "vitest";
import type { LocalLibrarySong, UserPlaylist } from "../types/library";
import type { Song } from "../types/score";
import { appDataVersion } from "../types/appData";
import { defaultKeyMapping } from "../types/keyMapping";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
  noteIntervalDelayLimits,
  playbackSpeedLimits,
} from "../types/playbackOptions";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import {
  buildPersistedAppData,
  sanitizePersistedAppData,
} from "./appData";
import { createLocalSongMetadata } from "./libraryCollections";
import { ImportedScoreSongLoader } from "./importedScoreSongLoader";

function createTestSong(name = "Test Song"): Song {
  return {
    name,
    bpm: 120,
    bitsPerPage: 15,
    pitchLevel: 0,
    isComposed: true,
    songNotes: [
      { time: 0, key: "Key0" },
      { time: 500, key: "Key1" },
    ],
  };
}

function createLocalLibrarySong(id = "local-1"): LocalLibrarySong {
  const song = createTestSong();

  return {
    id,
    importedAt: 123,
    metadata: createLocalSongMetadata(song),
    source: "local-import",
  };
}

function createV2LibrarySong(id = "local-1", song = createTestSong()) {
  return {
    id,
    importedAt: 123,
    song,
    source: "local-import",
  };
}

function createPlaylist(
  id = "playlist-a",
  songIds: string[] = [],
): UserPlaylist {
  return {
    createdAt: 1,
    id,
    name: "Playlist A",
    songIds,
    updatedAt: 2,
  };
}

function buildMinimalPersistedAppData(
  overrides: Partial<Parameters<typeof buildPersistedAppData>[0]> = {},
) {
  return buildPersistedAppData({
    isShuffleEnabled: false,
    keyMapping: defaultKeyMapping,
    language: "zh-CN",
    librarySongs: [],
    likedSongs: [],
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackMode: defaultPlaybackMode,
    playbackShortcuts: defaultPlaybackShortcuts,
    playbackSpeed: defaultPlaybackSpeed,
    playlists: [],
    selectedLibraryCategory: "local-imports",
    selectedPlaylistId: null,
    selectedSongIndex: null,
    ...overrides,
  });
}

describe("buildPersistedAppData", () => {
  it("writes the current appDataVersion", () => {
    expect(buildMinimalPersistedAppData().appDataVersion).toBe(appDataVersion);
  });

  it("defaults confirmBeforeExit to true and preserves explicit values", () => {
    expect(buildMinimalPersistedAppData().confirmBeforeExit).toBe(true);
    expect(
      buildMinimalPersistedAppData({ confirmBeforeExit: false })
        .confirmBeforeExit,
    ).toBe(false);
  });

  it("preserves unrelated settings when updating confirmBeforeExit", () => {
    const baseSettings = {
      language: "en-US" as const,
      librarySongs: [createLocalLibrarySong("local-preserved")],
      playbackMode: "repeat-all" as const,
    };
    const before = buildMinimalPersistedAppData(baseSettings);
    const after = buildMinimalPersistedAppData({
      ...baseSettings,
      confirmBeforeExit: false,
    });

    expect({ ...after, confirmBeforeExit: true }).toEqual(before);
  });

  it("keeps valid library songs and collection references", () => {
    const songA = createLocalLibrarySong("local-1");
    const songB = createLocalLibrarySong("local-2");
    const playlist = createPlaylist("playlist-a", ["local-1", "local-2"]);

    const result = buildMinimalPersistedAppData({
      librarySongs: [songA, songB],
      likedSongs: [{ likedAt: 10, songId: "local-1" }],
      playlists: [playlist],
      selectedPlaylistId: "playlist-a",
      selectedSongIndex: 1,
    });

    expect(result.library.librarySongs).toEqual([songA, songB]);
    expect(result.library.likedSongs).toEqual([
      { likedAt: 10, songId: "local-1" },
    ]);
    expect(result.library.playlists[0]?.songIds).toEqual(["local-1", "local-2"]);
    expect(result.library.selectedPlaylistId).toBe("playlist-a");
    expect(result.library.selectedSongIndex).toBe(1);
  });

  it("persists normal local metadata without songNotes", () => {
    const song = createLocalLibrarySong("local-1");

    const result = buildMinimalPersistedAppData({
      librarySongs: [song],
    });

    expect(result.library.librarySongs[0]).toEqual(song);
    expect(JSON.stringify(result.library.librarySongs[0])).not.toContain(
      "songNotes",
    );
  });

  it("never serializes a file-loaded song from the runtime cache", () => {
    const loader = new ImportedScoreSongLoader();
    const loadedSong = createTestSong("Loaded From File");
    const librarySong: LocalLibrarySong = {
      id: "local-cached",
      importedAt: 1,
      metadata: createLocalSongMetadata(loadedSong),
      source: "local-import",
    };

    loader.seed(librarySong.id, loadedSong);
    const result = buildMinimalPersistedAppData({
      librarySongs: [librarySong],
    });

    expect(loader.getCachedSong(librarySong.id)).toBe(loadedSong);
    expect(JSON.stringify(result)).not.toContain("songNotes");
  });

  it("keeps complete songs only in migration fallback records", () => {
    const fallbackSong = createTestSong("Recovery");
    const result = buildMinimalPersistedAppData({
      librarySongs: [createLocalLibrarySong("local-1")],
      migrationFallbackSongs: { "local-1": fallbackSong },
    });

    expect(result.library.migrationFallbackSongs?.["local-1"]).toEqual(
      fallbackSong,
    );
    expect(result.library.librarySongs[0]?.metadata.name).toBe("Recovery");
  });

  it("removes invalid liked and playlist references", () => {
    const result = buildMinimalPersistedAppData({
      librarySongs: [createLocalLibrarySong("local-1")],
      likedSongs: [
        { likedAt: 10, songId: "local-1" },
        { likedAt: 11, songId: "missing-song" },
      ],
      playlists: [createPlaylist("playlist-a", ["local-1", "missing-song"])],
    });

    expect(result.library.likedSongs).toEqual([
      { likedAt: 10, songId: "local-1" },
    ]);
    expect(result.library.playlists[0]?.songIds).toEqual(["local-1"]);
  });

  it("normalizes playback settings", () => {
    const result = buildMinimalPersistedAppData({
      noteIntervalDelayMs: -999,
      playbackSpeed: 99,
    });

    expect(result.playbackSettings.noteIntervalDelayMs).toBe(
      noteIntervalDelayLimits.min,
    );
    expect(result.playbackSettings.playbackSpeed).toBe(
      playbackSpeedLimits.max,
    );
  });
});

describe("sanitizePersistedAppData current version", () => {
  it("migrates legacy shortcut strings to scoped bindings", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {},
      playbackShortcuts: {
        next: "ArrowRight",
        pauseResume: "Space",
        stop: "F9",
      },
    });

    expect(result?.playbackShortcuts).toEqual(defaultPlaybackShortcuts);
  });

  it("sanitizes shortcut binding codes and scopes independently", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {},
      playbackShortcuts: {
        next: { code: "KeyN", scope: "global" },
        pauseResume: { code: "", scope: "bad" },
        stop: { code: "F8", scope: "in-app" },
      },
    });

    expect(result?.playbackShortcuts).toEqual({
      next: { code: "KeyN", scope: "global" },
      pauseResume: defaultPlaybackShortcuts.pauseResume,
      stop: { code: "F8", scope: "in-app" },
    });
  });

  it("returns null for non-object input", () => {
    expect(sanitizePersistedAppData(null)).toBeNull();
    expect(sanitizePersistedAppData("bad")).toBeNull();
  });

  it("returns null for unsupported appDataVersion", () => {
    expect(sanitizePersistedAppData({ appDataVersion: 999 })).toBeNull();
  });

  it("accepts current appDataVersion and fills defaults", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      language: "zh-CN",
      keyMapping: {},
      playbackShortcuts: {},
      playbackSettings: {},
      library: {
        librarySongs: [],
        likedSongs: [],
        playlists: [],
        selectedLibraryCategory: "local-imports",
        selectedPlaylistId: null,
        selectedSongIndex: null,
      },
    });

    expect(result).not.toBeNull();
    expect(result?.appDataVersion).toBe(appDataVersion);
    expect(result?.language).toBe("zh-CN");
    expect(result?.keyMapping).toEqual(defaultKeyMapping);
    expect(result?.playbackShortcuts).toEqual(defaultPlaybackShortcuts);
    expect(result?.playbackSettings).toEqual({
      isShuffleEnabled: false,
      noteIntervalDelayMs: defaultNoteIntervalDelayMs,
      playbackMode: defaultPlaybackMode,
      playbackSpeed: defaultPlaybackSpeed,
    });
    expect(result?.confirmBeforeExit).toBe(true);
    expect(result?.library.librarySongs).toEqual([]);
  });

  it("falls back to zh-CN for invalid language", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      language: "bad",
      library: {},
    });

    expect(result?.language).toBe("zh-CN");
  });

  it("sanitizes the exit confirmation preference", () => {
    expect(
      sanitizePersistedAppData({
        appDataVersion,
        confirmBeforeExit: true,
        library: {},
      })?.confirmBeforeExit,
    ).toBe(true);
    expect(
      sanitizePersistedAppData({
        appDataVersion,
        confirmBeforeExit: false,
        library: {},
      })?.confirmBeforeExit,
    ).toBe(false);
    expect(
      sanitizePersistedAppData({
        appDataVersion,
        confirmBeforeExit: "no",
        library: {},
      })?.confirmBeforeExit,
    ).toBe(true);
  });

  it("clears an invalid selectedSongIndex", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [createLocalLibrarySong("local-1")],
        selectedSongIndex: 99,
      },
    });

    expect(result?.library.selectedSongIndex).toBeNull();
  });

  it("falls back safely for an invalid selectedPlaylistId", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        playlists: [createPlaylist("playlist-a")],
        selectedPlaylistId: "missing",
      },
    });

    expect(result?.library.selectedPlaylistId).toBe("playlist-a");
  });
});

describe("sanitizePersistedAppData legacy v1 migration", () => {
  it("migrates v1 importedSongs to current librarySongs", () => {
    const result = sanitizePersistedAppData({
      appDataVersion: 1,
      language: "zh-CN",
      keyMapping: {},
      playbackShortcuts: {},
      playbackSettings: {},
      library: {
        importedSongs: [createTestSong("Legacy Song")],
        likedSongs: [],
        playlists: [],
        selectedLibraryCategory: "local-imports",
        selectedPlaylistId: null,
        selectedSongIndex: 0,
      },
    });

    expect(result).not.toBeNull();
    expect(result?.appDataVersion).toBe(appDataVersion);
    expect(result?.library.librarySongs).toHaveLength(1);
    expect(result?.library.librarySongs[0]?.source).toBe("local-import");
    expect(result?.library.librarySongs[0]?.metadata.name).toBe("Legacy Song");
    const legacyId = result?.library.librarySongs[0]?.id;
    expect(legacyId).toMatch(/^legacy-0-/);
    expect(result?.library.migrationFallbackSongs?.[legacyId ?? ""]).toEqual(
      createTestSong("Legacy Song"),
    );
    expect(result?.library.selectedSongIndex).toBe(0);
  });

  it("ignores invalid imported songs during v1 migration", () => {
    const result = sanitizePersistedAppData({
      appDataVersion: 1,
      library: {
        importedSongs: [createTestSong("Valid Song"), { name: "bad" }, null],
      },
    });

    expect(result?.library.librarySongs).toHaveLength(1);
    expect(result?.library.librarySongs[0]?.metadata.name).toBe("Valid Song");
  });
});

describe("sanitizePersistedAppData v2 migration", () => {
  it("converts complete v2 songs to metadata plus recovery candidates", () => {
    const song = createTestSong("V2 Song");
    const result = sanitizePersistedAppData({
      appDataVersion: 2,
      language: "en-US",
      library: {
        librarySongs: [createV2LibrarySong("local-v2", song)],
        likedSongs: [{ likedAt: 5, songId: "local-v2" }],
        playlists: [createPlaylist("playlist-a", ["local-v2"])],
        selectedSongIndex: 0,
      },
    });

    expect(result?.library.librarySongs).toEqual([
      {
        id: "local-v2",
        importedAt: 123,
        metadata: createLocalSongMetadata(song),
        source: "local-import",
      },
    ]);
    expect(result?.library.migrationFallbackSongs).toEqual({
      "local-v2": song,
    });
    expect(result?.library.likedSongs).toEqual([
      { likedAt: 5, songId: "local-v2" },
    ]);
    expect(result?.library.playlists[0]?.songIds).toEqual(["local-v2"]);
    expect(result?.library.selectedSongIndex).toBe(0);
    expect(result?.language).toBe("en-US");
  });
});

describe("sanitizePersistedAppData v3 recovery", () => {
  it("does not create recovery songs for metadata-only input", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [createLocalLibrarySong("local-clean")],
      },
    });

    expect(result?.library.migrationFallbackSongs).toBeUndefined();
  });

  it("recomputes metadata from a valid fallback and ignores orphans", () => {
    const fallbackSong = createTestSong("Recovery Truth");
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [createLocalLibrarySong("local-recovery")],
        migrationFallbackSongs: {
          "local-orphan": createTestSong("Orphan"),
          "local-recovery": fallbackSong,
        },
      },
    });

    expect(result?.library.librarySongs[0]?.metadata).toEqual(
      createLocalSongMetadata(fallbackSong),
    );
    expect(result?.library.migrationFallbackSongs).toEqual({
      "local-recovery": fallbackSong,
    });
  });

  it("rebuilds invalid metadata from a valid fallback without losing the entry", () => {
    const fallbackSong = createTestSong("Recovered Song");
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [
          {
            id: "local-1",
            importedAt: 123,
            metadata: { name: "incomplete" },
            source: "local-import",
          },
        ],
        migrationFallbackSongs: { "local-1": fallbackSong },
      },
    });

    expect(result?.library.librarySongs).toEqual([
      {
        id: "local-1",
        importedAt: 123,
        metadata: createLocalSongMetadata(fallbackSong),
        source: "local-import",
      },
    ]);
    expect(result?.library.migrationFallbackSongs).toEqual({
      "local-1": fallbackSong,
    });
  });

  it("keeps valid metadata when the corresponding fallback is invalid", () => {
    const librarySong = createLocalLibrarySong("local-valid");
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [librarySong],
        migrationFallbackSongs: {
          "local-valid": { name: "broken fallback" },
        },
      },
    });

    expect(result?.library.librarySongs).toEqual([librarySong]);
    expect(result?.library.migrationFallbackSongs).toBeUndefined();
  });

  it("drops an entry when both metadata and fallback are invalid", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [
          {
            id: "local-invalid",
            importedAt: 1,
            metadata: { name: "incomplete" },
            source: "local-import",
          },
        ],
        migrationFallbackSongs: {
          "local-invalid": { name: "broken fallback" },
        },
      },
    });

    expect(result?.library.librarySongs).toEqual([]);
    expect(result?.library.migrationFallbackSongs).toBeUndefined();
  });

  it("sanitizes 3000 metadata entries without invoking a file loader", () => {
    const fileLoader = vi.fn();
    const librarySongs = Array.from({ length: 3000 }, (_, index) =>
      createLocalLibrarySong(`local-${index}`),
    );
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: { librarySongs },
    });

    expect(result?.library.librarySongs).toHaveLength(3000);
    expect(fileLoader).not.toHaveBeenCalled();
    expect(JSON.stringify(result?.library.librarySongs)).not.toContain(
      "songNotes",
    );
  });

  it("round trips collections, selection, language, settings, and shortcuts", () => {
    const original = buildMinimalPersistedAppData({
      isShuffleEnabled: true,
      language: "en-US",
      librarySongs: [createLocalLibrarySong("local-roundtrip")],
      likedSongs: [{ likedAt: 7, songId: "local-roundtrip" }],
      noteIntervalDelayMs: 50,
      playbackMode: "repeat-all",
      playbackShortcuts: {
        next: { code: "KeyN", scope: "global" },
        pauseResume: { code: "Space", scope: "in-app" },
        stop: { code: "KeyS", scope: "global" },
      },
      playbackSpeed: 1.5,
      playlists: [createPlaylist("playlist-a", ["local-roundtrip"])],
      selectedLibraryCategory: "playlists",
      selectedPlaylistId: "playlist-a",
      selectedSongIndex: 0,
    });
    const restored = sanitizePersistedAppData(
      JSON.parse(JSON.stringify(original)),
    );

    expect(restored).toEqual(original);
  });
});

describe("sanitizePersistedAppData experimental input preferences", () => {
  it("migrates legacy experimental input preferences", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {},
      experimentalInputPreferences: {
        experimentalInputEnabled: true,
        experimentalInputMode: "target-window-message",
        selectedWindowHwnd: "123",
        selectedWindowSnapshot: {
          hwnd: "123",
          title: "Sky",
          className: "GameWindow",
          processName: "Sky.exe",
        },
        targetWindowCompatibilityProfile: "standard",
        targetWindowKeyHoldMs: 40,
        targetWindowMessageMethod: "send-message",
      },
    });

    expect(result?.experimentalInputPreferences).toEqual({
      experimentalInputEnabled: true,
      experimentalInputMode: "target-window-message",
      selectedWindowHwnd: "123",
      selectedWindowSnapshot: {
        hwnd: "123",
        title: "Sky",
        className: "GameWindow",
        processName: "Sky.exe",
      },
      targetWindowCompatibilityProfile: "legacy-activate-scan-lparam",
      targetWindowKeyHoldMs: 40,
      targetWindowMessageMethod: "post-message",
    });
  });

  it("falls back safely for invalid experimental input preferences", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {},
      experimentalInputPreferences: {
        experimentalInputEnabled: "yes",
        experimentalInputMode: "bad",
        selectedWindowHwnd: 123,
        selectedWindowSnapshot: {
          hwnd: 123,
          title: 999,
          className: null,
        },
        targetWindowCompatibilityProfile: "bad",
        targetWindowKeyHoldMs: 999,
        targetWindowMessageMethod: "bad",
      },
    });

    expect(result?.experimentalInputPreferences).toEqual({
      experimentalInputEnabled: true,
      experimentalInputMode: "target-window-message",
      selectedWindowHwnd: null,
      selectedWindowSnapshot: undefined,
      targetWindowCompatibilityProfile: "legacy-activate-scan-lparam",
      targetWindowKeyHoldMs: 200,
      targetWindowMessageMethod: "post-message",
    });
  });
});
