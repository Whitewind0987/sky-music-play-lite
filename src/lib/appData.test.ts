import { describe, expect, it } from "vitest";
import type { LibrarySong, UserPlaylist } from "../types/library";
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

function createLocalLibrarySong(id = "song-1"): LibrarySong {
  return {
    id,
    importedAt: 123,
    song: createTestSong(),
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

  it("keeps valid library songs and collection references", () => {
    const songA = createLocalLibrarySong("song-1");
    const songB = createLocalLibrarySong("song-2");
    const playlist = createPlaylist("playlist-a", ["song-1", "song-2"]);

    const result = buildMinimalPersistedAppData({
      librarySongs: [songA, songB],
      likedSongs: [{ likedAt: 10, songId: "song-1" }],
      playlists: [playlist],
      selectedPlaylistId: "playlist-a",
      selectedSongIndex: 1,
    });

    expect(result.library.librarySongs).toEqual([songA, songB]);
    expect(result.library.likedSongs).toEqual([
      { likedAt: 10, songId: "song-1" },
    ]);
    expect(result.library.playlists[0]?.songIds).toEqual(["song-1", "song-2"]);
    expect(result.library.selectedPlaylistId).toBe("playlist-a");
    expect(result.library.selectedSongIndex).toBe(1);
  });

  it("keeps complete local song notes in persisted AppData", () => {
    const song = createLocalLibrarySong("song-1");

    const result = buildMinimalPersistedAppData({
      librarySongs: [song],
    });

    expect(result.library.librarySongs[0]?.song.songNotes).toEqual(
      song.song.songNotes,
    );
  });

  it("removes invalid liked and playlist references", () => {
    const result = buildMinimalPersistedAppData({
      librarySongs: [createLocalLibrarySong("song-1")],
      likedSongs: [
        { likedAt: 10, songId: "song-1" },
        { likedAt: 11, songId: "missing-song" },
      ],
      playlists: [createPlaylist("playlist-a", ["song-1", "missing-song"])],
    });

    expect(result.library.likedSongs).toEqual([
      { likedAt: 10, songId: "song-1" },
    ]);
    expect(result.library.playlists[0]?.songIds).toEqual(["song-1"]);
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

  it("clears an invalid selectedSongIndex", () => {
    const result = sanitizePersistedAppData({
      appDataVersion,
      library: {
        librarySongs: [createLocalLibrarySong("song-1")],
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
    expect(result?.library.librarySongs[0]?.song.name).toBe("Legacy Song");
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
    expect(result?.library.librarySongs[0]?.song.name).toBe("Valid Song");
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
