import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { buildPlaybackOrderFromVisibleItems, resolvePlaybackOrderNextDecision } from "../hooks/usePlaybackOrder";
import type { LibrarySongListItem, LocalLibrarySong, UserPlaylist } from "../types/library";
import type { Song } from "../types/score";
import { createLibrarySong, filterSongsByQuery, removeSongFromAllCollections } from "./libraryCollections";
import { getLibraryCategoryItems, getLibrarySongCategory, getLocalLibraryMoveTarget, moveLocalLibrarySong } from "./libraryGroups";
import { moveLibrarySortingMembership, reconcileSortingMembership, sortLibraryItems } from "./librarySorting";
import { deleteLocalSongWithScoreFile } from "./localSongDeletion";
import { PlaybackContextTransactionStore } from "./playbackContextTransaction";
import { resolvePlaylistSongIndices } from "./playlistPlayback";
import { storeUniqueImportedSongs } from "./scoreLibraryImport";
import { exportImportedScoreSong } from "./tauriApi";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const score: Song = {
  formatVersion: 2, name: "Manual V2", bpm: 120, bitsPerPage: 16,
  pitchLevel: 0, isComposed: false, songNotes: [{ time: 0, key: "1Key0", duration: 500 }],
};
const makeSong = (id: string, converted = false): LocalLibrarySong => ({
  ...createLibrarySong({ ...score, name: id }), id,
  ...(converted ? { libraryGroup: "converted" as const } : {}),
});
const asItems = (songs: LocalLibrarySong[]): LibrarySongListItem[] => songs.map((librarySong, songIndex) => ({
  librarySong, songIndex, isLiked: true,
}));
const ids = (items: LibrarySongListItem[]) => items.map(item => item.librarySong.id);
const playlist: UserPlaylist = { id: "p", name: "p", songIds: ["b", "a"], createdAt: 1, updatedAt: 2 };

describe("virtual local library groups", () => {
  it("keeps manually imported V2 files in Local Imports using the real import workflow", async () => {
    const save = vi.fn();
    const { storedLibrarySongs } = await storeUniqueImportedSongs({
      existingLibrarySongs: [], importedSongs: [{ fileName: "v2.json", song: score }], saveImportedScoreSong: save,
    });
    expect(getLibrarySongCategory(storedLibrarySongs[0])).toBe("local-imports");
    expect(storedLibrarySongs[0].source).toBe("local-import");
    expect(save).toHaveBeenCalledWith(storedLibrarySongs[0].id, score);
  });

  it("does not infer origin from V2 format or converter-like names", () => {
    const legacy = makeSong("Old (V2 Long Note)");
    expect(getLibrarySongCategory(legacy)).toBe("local-imports");
    expect(getLocalLibraryMoveTarget(legacy)).toBe("converted");
    expect(getLocalLibraryMoveTarget({ ...legacy, libraryGroup: "converted" })).toBe("imported");
  });

  it.each([1, undefined] as const)("hides Move to Converted and rejects stale moves for format %s", formatVersion => {
    const song = makeSong("not-confirmed-v2");
    song.metadata.formatVersion = formatVersion;
    expect(getLocalLibraryMoveTarget(song)).toBeNull();
    const songs = [song];
    expect(moveLocalLibrarySong(songs, song.id, "converted")).toBe(songs);
    expect(getLocalLibraryMoveTarget({ ...song, libraryGroup: "converted" })).toBe("imported");
  });

  it("moves both ways without duplicating records or changing IDs, metadata, files, or positions", () => {
    const songs = [makeSong("a"), makeSong("b"), makeSong("c", true)];
    const files = new Map(songs.map(song => [song.id, score]));
    const originalFiles = [...files];
    const moved = moveLocalLibrarySong(songs, "b", "converted");
    expect(moved).toHaveLength(songs.length);
    expect(moved.map(song => song.id)).toEqual(songs.map(song => song.id));
    expect(moved[0]).toBe(songs[0]);
    expect(moved[1].metadata).toBe(songs[1].metadata);
    expect(moved[1]).toEqual({ ...songs[1], libraryGroup: "converted" });
    expect(ids(getLibraryCategoryItems(asItems(moved), "local-imports"))).toEqual(["a"]);
    expect(ids(getLibraryCategoryItems(asItems(moved), "converted"))).toEqual(["b", "c"]);
    expect(getLibrarySongCategory(moveLocalLibrarySong(moved, "b", "imported")[1])).toBe("local-imports");
    expect([...files]).toEqual(originalFiles);
    expect(moveLocalLibrarySong(moved, "missing", "converted")).toBe(moved);
    expect(moveLocalLibrarySong(moved, "b", "converted")).toBe(moved);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps likes, playlist order, playback context, and numeric indices after a move", () => {
    const songs = [makeSong("a"), makeSong("b", true), makeSong("c")];
    const context = new PlaybackContextTransactionStore();
    context.replace({ currentSongId: "b", songIds: ["b", "a"], source: "converted" });
    const beforeContext = context.getContext();
    const moved = moveLocalLibrarySong(songs, "b", "imported");
    const items = asItems(moved);
    expect(ids(getLibraryCategoryItems(items, "liked"))).toEqual(["a", "b", "c"]);
    const inPlaylist = getLibraryCategoryItems(items, "playlists", playlist);
    expect(ids(inPlaylist)).toEqual(["b", "a"]);
    expect(inPlaylist.map(item => item.songIndex)).toEqual([1, 0]);
    expect(resolvePlaylistSongIndices(playlist.songIds, moved)).toEqual([1, 0]);
    expect(buildPlaybackOrderFromVisibleItems(inPlaylist, "b", { usesSearch: false })).toEqual(["b", "a"]);
    expect(context.getContext()).toBe(beforeContext);
    expect(resolvePlaybackOrderNextDecision({
      context: beforeContext, librarySongs: moved, currentSongIndex: 1, currentSongId: "b",
      isShuffleEnabled: false, playbackMode: "repeat-all",
    })).toEqual({ status: "next", songId: "a", songIndex: 0 });
    expect(playlist.songIds).toEqual(["b", "a"]);
  });

  it("keeps category searching and independent automatic/custom ordering", () => {
    const items = asItems([makeSong("a"), makeSong("b"), makeSong("c", true)]);
    const preferences = {
      "local-imports": { mode: "name-desc" as const, customOrder: ["b", "a"] },
      converted: { mode: "added-desc" as const, customOrder: ["c"] },
    };
    const next = moveLibrarySortingMembership(preferences, items, "b", "converted");
    expect(next["local-imports"]).toEqual({ mode: "name-desc", customOrder: ["a"] });
    expect(next.converted).toEqual({ mode: "added-desc", customOrder: ["c", "b"] });
    const moved = asItems(moveLocalLibrarySong(items.map(item => item.librarySong as LocalLibrarySong), "b", "converted"));
    const converted = getLibraryCategoryItems(moved, "converted");
    expect(ids(sortLibraryItems(converted, "custom", next.converted.customOrder))).toEqual(["c", "b"]);
    expect(ids(filterSongsByQuery(converted, "b"))).toEqual(["b"]);
    const back = moveLibrarySortingMembership(next, moved, "b", "local-imports");
    expect(back["local-imports"].customOrder).toEqual(["a", "b"]);
    const afterDeletion = reconcileSortingMembership(next, moved.filter(item => item.librarySong.id !== "c"), [playlist]);
    expect(afterDeletion.converted.customOrder).toEqual(["b"]);
    expect(preferences.converted.customOrder).toEqual(["c"]);
  });

  it("appends moved songs after the destination's unsaved custom order", () => {
    const items = asItems([makeSong("a"), makeSong("b", true), makeSong("c", true)]);
    expect(moveLibrarySortingMembership({}, items, "a", "converted").converted.customOrder).toEqual(["b", "c", "a"]);
  });

  it("exports a converted score with its original storage ID", async () => {
    const converted = makeSong("b", true);
    vi.mocked(invoke).mockResolvedValueOnce({ fileName: "b.json", path: "b.json" });
    await exportImportedScoreSong(converted.id);
    expect(invoke).toHaveBeenLastCalledWith("export_imported_score_song", { songId: "b" });
    vi.mocked(invoke).mockClear();
  });

  it("deletes converted scores through the existing local deletion path and collection cleanup", async () => {
    const songs = [makeSong("a"), makeSong("b", true)];
    const deleteFile = vi.fn(async () => {});
    const cleanup = vi.fn();
    expect(await deleteLocalSongWithScoreFile({
      librarySongs: songs, songIndex: 1, appendLog: vi.fn(), deleteScoreFile: deleteFile,
      onBeforeLibraryMutation: vi.fn(), formatDeleteFailure: () => "failed",
      onSuccessfulDelete: song => cleanup(removeSongFromAllCollections({
        songId: song.id, likedSongs: [{ songId: "b", likedAt: 1 }], playlists: [playlist],
      })),
    })).toBe(true);
    expect(deleteFile).toHaveBeenCalledExactlyOnceWith("b");
    expect(cleanup).toHaveBeenCalledWith({ likedSongs: [], playlists: [{ ...playlist, songIds: ["a"], updatedAt: expect.any(Number) }] });
  });
});
