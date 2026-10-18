import { describe, expect, it } from "vitest";
import type { BuiltInLibrarySong, LibrarySongListItem, UserPlaylist } from "../types/library";
import { createLocalSongMetadata, filterSongsByQuery } from "./libraryCollections";
import {
  canManuallyReorder, getAdjacentReorderTarget, getDragAutoScrollDelta, getLibrarySortScope,
  reconcileSongOrder, reconcileSortingMembership, reorderPlaylistSongs, reorderSongIds,
  sanitizeLibrarySorting, sortLibraryItems, supportsAdditionSort, updateLibrarySortMode,
} from "./librarySorting";
import { getLibraryPageItems } from "./libraryPagination";
import { resolvePlaylistSongIndices } from "./playlistPlayback";
import type { LibrarySortingPreferences } from "../types/librarySorting";

function item(id: string, name = id, duration = 100, importedAt = 1, songIndex = 0): LibrarySongListItem {
  return {
    isLiked: true, songIndex,
    librarySong: {
      id, importedAt, source: "local-import",
      metadata: createLocalSongMetadata({
        name, bpm: 120, bitsPerPage: 16, pitchLevel: 0, isComposed: false,
        songNotes: [{ key: "Key0", time: duration }],
      }),
    },
  };
}

const ids = (items: LibrarySongListItem[]) => items.map(item => item.librarySong.id);
const playlist = (id: string, songIds: string[]): UserPlaylist => ({ id, songIds, name: id, createdAt: 1, updatedAt: 2 });

function builtIn(id: string, duration?: number): LibrarySongListItem {
  const librarySong: BuiltInLibrarySong = {
    id, source: "built-in", importedAt: 0, builtInDurationMs: duration, isBuiltInLoaded: false,
    song: {
      name: id, bpm: 120, bitsPerPage: 16, pitchLevel: 0, isComposed: false,
      get songNotes(): never { throw new Error("Sorting must use indexed metadata without reading notes"); },
    },
  };
  return { isLiked: true, songIndex: 0, librarySong };
}

describe("automatic library display sorting", () => {
  it("compares Chinese names naturally in both directions", () => {
    const items = [item("b", "波"), item("a10", "阿10"), item("a2", "阿2")];
    expect(ids(sortLibraryItems(items, "name-asc"))).toEqual(["a2", "a10", "b"]);
    expect(ids(sortLibraryItems(items, "name-desc"))).toEqual(["b", "a10", "a2"]);
  });

  it("ignores Latin case, compares numbers numerically and uses stable ID ties", () => {
    const items = [item("z", "song2"), item("c", "Song10"), item("a", "SONG2")];
    expect(ids(sortLibraryItems(items, "name-asc"))).toEqual(["a", "z", "c"]);
    expect(ids(sortLibraryItems(items, "name-desc"))).toEqual(["c", "a", "z"]);
  });

  it("sorts local import timestamps", () => {
    const items = [item("new", "new", 1, 200), item("old", "old", 1, 100)];
    expect(ids(sortLibraryItems(items, "added-asc"))).toEqual(["old", "new"]);
    expect(ids(sortLibraryItems(items, "added-desc"))).toEqual(["new", "old"]);
  });

  it("uses real likedAt values for both built-in and local liked songs", () => {
    const items = [builtIn("builtin:a", 200), item("b", "b", 100, 10000)];
    const liked = [{ songId: "b", likedAt: 10 }, { songId: "builtin:a", likedAt: 20 }];
    expect(ids(sortLibraryItems(items, "added-desc", [], liked, "liked"))).toEqual(["builtin:a", "b"]);
    expect(ids(sortLibraryItems(items, "added-asc", [], liked, "liked"))).toEqual(["b", "builtin:a"]);
  });

  it("does not invent addition times for built-ins or playlist memberships", () => {
    expect(supportsAdditionSort("built-in")).toBe(false);
    expect(supportsAdditionSort("playlists")).toBe(false);
    const items = [item("b"), item("a")];
    expect(sortLibraryItems(items, "added-asc", [], [], "playlists")).toEqual(items);
  });

  it("sorts durations from local and lazy built-in metadata without reading notes", () => {
    const items = [builtIn("long", 800), item("short", "short", 100), builtIn("medium", 400)];
    expect(ids(sortLibraryItems(items, "duration-asc"))).toEqual(["short", "medium", "long"]);
    expect(ids(sortLibraryItems(items, "duration-desc"))).toEqual(["long", "medium", "short"]);
  });

  it("keeps unknown metadata last in both directions", () => {
    const items = [builtIn("unknown"), builtIn("known", 50)];
    expect(ids(sortLibraryItems(items, "duration-asc"))).toEqual(["known", "unknown"]);
    expect(ids(sortLibraryItems(items, "duration-desc"))).toEqual(["known", "unknown"]);
  });

  it.each(["name-asc", "name-desc", "added-asc", "added-desc", "duration-asc", "duration-desc"] as const)(
    "%s deterministically breaks equal values by ID", mode => {
      const items = [item("b", "same"), item("a", "SAME")];
      expect(ids(sortLibraryItems(items, mode))).toEqual(["a", "b"]);
      expect(ids(sortLibraryItems([...items].reverse(), mode))).toEqual(["a", "b"]);
    },
  );

  it("keeps original playback indices, references and underlying array order", () => {
    const items = [item("z", "Z", 300, 1, 0), item("a", "A", 100, 2, 1), item("m", "M", 200, 3, 2)];
    const librarySongs = items.map(item => item.librarySong);
    const displayed = sortLibraryItems(items, "name-asc");
    expect(ids(items)).toEqual(["z", "a", "m"]);
    expect(displayed.map(item => item.songIndex)).toEqual([1, 2, 0]);
    for (const shown of displayed) {
      expect(librarySongs[shown.songIndex]).toBe(shown.librarySong);
      expect(shown).toBe(items[shown.songIndex]);
    }
    // Existing selection/delete/export/like/upgrade handlers receive this same index or ID.
    expect(librarySongs[displayed[0].songIndex].id).toBe("a");
  });
});

describe("manual order and collection boundaries", () => {
  it("restores the old order when no preference is present", () => {
    const items = [item("b"), item("a")];
    expect(ids(sortLibraryItems(items, "custom"))).toEqual(["b", "a"]);
  });

  it("moves upward/downward before or after the target without mutation", () => {
    const order = ["a", "b", "c", "d"];
    expect(reorderSongIds(order, "d", "b", "before", order)).toEqual(["a", "d", "b", "c"]);
    expect(reorderSongIds(order, "a", "c", "after", order)).toEqual(["b", "c", "a", "d"]);
    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(reorderSongIds(order, "b", "c", "before", order)).toBe(order);
    expect(reorderSongIds(order, "missing", "c", "before", order)).toBe(order);
    expect(reorderSongIds(order, "a", "a", "before", order)).toBe(order);
  });

  it("preserves every slot outside the visible page and refuses cross-page moves", () => {
    const order = ["outside1", "a", "b", "c", "outside2"];
    expect(reorderSongIds(order, "c", "a", "before", ["a", "b", "c"]))
      .toEqual(["outside1", "c", "a", "b", "outside2"]);
    expect(reorderSongIds(order, "a", "outside2", "after", ["a", "b", "c"])).toBe(order);
    expect(reorderSongIds(order, "c", "a", "before", ["a", "c"]))
      .toEqual(["outside1", "c", "b", "a", "outside2"]);
  });

  it("retains the saved custom arrangement when switching automatic modes", () => {
    const items = [item("a"), item("b"), item("c")];
    const saved = ["c", "a", "b"];
    expect(ids(sortLibraryItems(items, "custom", saved))).toEqual(saved);
    expect(ids(sortLibraryItems(items, "name-asc", saved))).toEqual(["a", "b", "c"]);
    expect(ids(sortLibraryItems(items, "custom", saved))).toEqual(["c", "a", "b"]);
    expect(saved).toEqual(["c", "a", "b"]);
  });

  it("drops deleted/missing/duplicate IDs and appends newly imported songs predictably", () => {
    expect(reconcileSongOrder(["deleted", "c", "a", "a"], ["a", "b", "c", "new"]))
      .toEqual(["c", "a", "b", "new"]);
    const remaining = [item("a", "A", 1, 1, 0), item("b", "B", 1, 1, 1)];
    expect(sortLibraryItems(remaining, "custom", ["b", "deleted", "a"]).map(item => item.songIndex)).toEqual([1, 0]);
  });

  it("reuses playlist.songIds and preserves other playlists, membership and indices", () => {
    const lists = [playlist("one", ["c", "a", "b"]), playlist("two", ["a", "c"])];
    const next = reorderPlaylistSongs(lists, "one", "b", "c", "before", ["c", "a", "b"], 99);
    expect(next[0].songIds).toEqual(["b", "c", "a"]);
    expect(new Set(next[0].songIds)).toEqual(new Set(lists[0].songIds));
    expect(next[0].updatedAt).toBe(99);
    expect(next[1]).toBe(lists[1]);
    expect(lists[0].songIds).toEqual(["c", "a", "b"]);
    expect(resolvePlaylistSongIndices(next[0].songIds, [item("a"), item("b"), item("c")].map(x => x.librarySong))).toEqual([1, 2, 0]);
    expect(reorderPlaylistSongs(lists, "missing", "b", "a", "before", ["a", "b"], 99)).toBe(lists);
  });

  it("has separate category and playlist scopes", () => {
    expect(getLibrarySortScope("playlists", "one")).toBe("playlist:one");
    expect(getLibrarySortScope("playlists", "two")).toBe("playlist:two");
    expect(getLibrarySortScope("playlists", null)).toBeNull();
    expect(getLibrarySortScope("liked", null)).toBe("liked");
    const original: LibrarySortingPreferences = {
      "local-imports": { mode: "custom", customOrder: ["b", "a"] },
      "playlist:one": { mode: "name-asc", customOrder: [] },
    };
    const next = updateLibrarySortMode(original, "playlist:two", "duration-desc");
    expect(next["local-imports"]).toBe(original["local-imports"]);
    expect(next["playlist:one"]).toBe(original["playlist:one"]);
    expect(updateLibrarySortMode(next, "playlist:two", "duration-desc")).toBe(next);
    const automatic = updateLibrarySortMode(next, "local-imports", "name-asc");
    expect(automatic["local-imports"].customOrder).toEqual(["b", "a"]);
    expect(updateLibrarySortMode(automatic, "local-imports", "custom")["local-imports"].customOrder).toEqual(["b", "a"]);
  });

  it("disables manual moves while raw or deferred search is active", () => {
    expect(canManuallyReorder("custom", "", "")).toBe(true);
    expect(canManuallyReorder("custom", "中文", "")).toBe(false);
    expect(canManuallyReorder("custom", "", "中文")).toBe(false);
    expect(canManuallyReorder("custom", "  ", " ")).toBe(true);
    expect(canManuallyReorder("name-asc", "", "")).toBe(false);
    const items = [item("a", "a song"), item("b", "b song"), item("c", "other")];
    expect(ids(filterSongsByQuery(sortLibraryItems(items, "custom", ["c", "b", "a"]), "song"))).toEqual(["b", "a"]);
  });

  it("supports keyboard boundaries and drag edge scrolling", () => {
    expect(getAdjacentReorderTarget(["a", "b"], "a", -1)).toBeNull();
    expect(getAdjacentReorderTarget(["a", "b"], "b", 1)).toBeNull();
    expect(getAdjacentReorderTarget(["a", "b"], "a", 1)).toBe("b");
    expect(getAdjacentReorderTarget(["a", "b"], "missing", 1)).toBeNull();
    expect(getDragAutoScrollDelta(100, 100, 500)).toBe(-14);
    expect(getDragAutoScrollDelta(500, 100, 500)).toBe(14);
    expect(getDragAutoScrollDelta(300, 100, 500)).toBe(0);
    expect(getDragAutoScrollDelta(800, 100, 500)).toBe(0);
  });
});

describe("sorting sanitization and pagination", () => {
  it("cleans invalid modes/IDs/scopes and never creates a duplicate playlist order source", () => {
    const preferences = sanitizeLibrarySorting({
      "local-imports": { mode: "bad", customOrder: ["a", "a", "deleted", null, "", 42] },
      "built-in": { mode: "added-asc", customOrder: ["builtin:a"] },
      "playlist:one": { mode: "name-desc", customOrder: ["a"] },
      "playlist:deleted": { mode: "custom", customOrder: ["a"] },
      unsafe: { mode: "custom", customOrder: [] },
      liked: null,
    }, [playlist("one", ["a"])], new Set(["a", "builtin:a"]));
    expect(preferences).toEqual({
      "local-imports": { mode: "custom", customOrder: ["a"] },
      "built-in": { mode: "custom", customOrder: ["builtin:a"] },
      "playlist:one": { mode: "name-desc", customOrder: [] },
    });
    expect(sanitizeLibrarySorting(null, [])).toEqual({});
    expect(sanitizeLibrarySorting([], [])).toEqual({});
  });

  it("reconciles deleted/unliked membership without changing unrelated preferences", () => {
    const preferences: LibrarySortingPreferences = {
      liked: { mode: "custom", customOrder: ["b", "a", "deleted"] },
      "local-imports": { mode: "name-desc", customOrder: ["b", "a"] },
    };
    const a = item("a"), b = { ...item("b"), isLiked: false };
    const next = reconcileSortingMembership(preferences, [a, b], []);
    expect(next.liked.customOrder).toEqual(["a"]);
    expect(next["local-imports"]).toEqual(preferences["local-imports"]);
    expect(reconcileSortingMembership(next, [a, b], [])).toBe(next);
  });

  it("retains built-in custom order while the index is unavailable, then reconciles a loaded index", () => {
    const preferences: LibrarySortingPreferences = {
      "built-in": { mode: "custom", customOrder: ["builtin:a", "builtin:deleted"] },
      liked: { mode: "custom", customOrder: ["builtin:a"] },
    };
    expect(reconcileSortingMembership(preferences, [item("local-a")], [])).toEqual(preferences);
    const loaded = reconcileSortingMembership(preferences, [builtIn("builtin:a", 1)], []);
    expect(loaded["built-in"].customOrder).toEqual(["builtin:a"]);
  });

  it("sorts the whole built-in dataset before taking a page, retaining original indices", () => {
    const items = Array.from({ length: 205 }, (_, index) => ({ ...builtIn(String(index), index), songIndex: index }));
    const sorted = sortLibraryItems(items, "duration-desc", [], [], "built-in");
    const page = getLibraryPageItems(sorted, 2, 100);
    expect(page).toHaveLength(100);
    expect(page[0].songIndex).toBe(104);
    expect(page[page.length - 1]?.songIndex).toBe(5);
    expect(getLibraryPageItems(sorted, 3, 100).map(item => item.songIndex)).toEqual([4, 3, 2, 1, 0]);
    const order = ids(sortLibraryItems(items, "custom"));
    const visible = getLibraryPageItems(items, 2, 100).map(item => item.librarySong.id);
    const moved = reorderSongIds(order, visible[99], visible[0], "before", visible);
    expect(moved[100]).toBe("199");
    expect(moved.slice(0, 100)).toEqual(order.slice(0, 100));
    expect(moved.slice(200)).toEqual(order.slice(200));
  });
});
