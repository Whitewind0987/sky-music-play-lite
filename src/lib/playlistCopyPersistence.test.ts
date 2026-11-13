import { describe, expect, it } from "vitest";
import { buildPersistedAppData, sanitizePersistedAppData } from "../lib/appData";
import { createPlaylistCopyOfLocalSong, createPlaylist, addSongToPlaylist } from "../lib/libraryCollections";
import type { LocalLibrarySong } from "../types/library";

function createLocalSong(id: string, name = id): LocalLibrarySong {
  return {
    id, importedAt: 0,
    metadata: { bitsPerPage: 16, bpm: 120, fingerprint: id, isComposed: false,
      lastNoteTimeMs: 0, name, noteCount: 4, noteGroupCount: 2, pitchLevel: 0 },
    source: "local-import",
  };
}

describe("playlist-copy 持久化往返", () => {
  it("副本的 playlist-copy 标记能穿过持久化保留", () => {
    const source = createLocalSong("local-source", "星之海");
    const copy = createPlaylistCopyOfLocalSong(source);
    const playlist = addSongToPlaylist(createPlaylist("P"), copy.id);

    const persisted = buildPersistedAppData({
      accentColor: "#000000",
      alwaysOnTop: false,
      confirmBeforeExit: false,
      isShuffleEnabled: false,
      keyMapping: { Key0: "0", Key1: "1" } as never,
      language: "zh-CN",
      librarySongs: [source, copy],
      likedSongs: [],
      noteIntervalDelayMs: 30,
      playbackMode: "sequential",
      playbackShortcuts: {} as never,
      playbackSpeed: 0.28,
      playlists: [playlist],
      validCollectionSongIds: [source.id, copy.id],
      selectedLibraryCategory: "local-imports",
      selectedPlaylistId: null,
      selectedSongIndex: null,
    } as never);

    const roundTrip = sanitizePersistedAppData(persisted);
    expect(roundTrip).not.toBeNull();
    const restoredCopy = roundTrip!.library.librarySongs.find(
      (s: LocalLibrarySong) => s.id === copy.id,
    );
    expect(restoredCopy?.libraryGroup).toBe("playlist-copy");
    expect(roundTrip!.library.playlists[0]?.songIds).toEqual([copy.id]);
  });

  it("副本的来源曲谱 id 能穿过持久化保留", () => {
    const source = createLocalSong("local-source", "星之海");
    const copy = createPlaylistCopyOfLocalSong(source);

    const persisted = buildPersistedAppData({
      accentColor: "#000000",
      alwaysOnTop: false,
      confirmBeforeExit: false,
      isShuffleEnabled: false,
      keyMapping: { Key0: "0", Key1: "1" } as never,
      language: "zh-CN",
      librarySongs: [source, copy],
      likedSongs: [],
      noteIntervalDelayMs: 30,
      playbackMode: "sequential",
      playbackShortcuts: {} as never,
      playbackSpeed: 0.28,
      playlists: [],
      validCollectionSongIds: [source.id, copy.id],
      selectedLibraryCategory: "local-imports",
      selectedPlaylistId: null,
      selectedSongIndex: null,
    } as never);

    const roundTrip = sanitizePersistedAppData(persisted);
    expect(roundTrip).not.toBeNull();
    const restoredCopy = roundTrip!.library.librarySongs.find(
      (s: LocalLibrarySong) => s.id === copy.id,
    );

    // 重启后仍要能识别「这首原曲已在歌单里」，否则重复加入检测会被绕过。
    expect(restoredCopy?.sourceSongId).toBe(source.id);
  });
});
