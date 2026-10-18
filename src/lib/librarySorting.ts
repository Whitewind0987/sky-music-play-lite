import type { LibraryCategoryId } from "../components/AppShell";
import type { LibrarySongListItem, LikedSongEntry, UserPlaylist } from "../types/library";
import {
  librarySortModes,
  type LibraryDropPosition,
  type LibrarySortMode,
  type LibrarySortingPreferences,
} from "../types/librarySorting";
import { getLibrarySongName, getLibrarySongRawDurationMs } from "./libraryCollections";

const nameCollator = new Intl.Collator("zh-CN", { sensitivity: "base", numeric: true });
const categories = new Set(["built-in", "local-imports", "liked"]);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function getSortDuration(item: LibrarySongListItem) {
  const song = item.librarySong;
  if (song.source === "built-in") {
    if (song.builtInDurationMs !== undefined) return song.builtInDurationMs;
    if (!song.isBuiltInLoaded) return undefined;
  }
  return getLibrarySongRawDurationMs(song);
}

export function getLibrarySortScope(category: LibraryCategoryId, playlistId: string | null) {
  return category === "playlists" ? (playlistId === null ? null : `playlist:${playlistId}`) : category;
}

export function supportsAdditionSort(category: LibraryCategoryId) {
  // Likes have a real collection timestamp; built-ins and playlist memberships do not.
  return category === "local-imports" || category === "liked";
}

export function updateLibrarySortMode(
  preferences: LibrarySortingPreferences, scope: string, mode: LibrarySortMode,
) {
  if (preferences[scope]?.mode === mode) return preferences;
  return {
    ...preferences,
    [scope]: { mode, customOrder: preferences[scope]?.customOrder ?? [] },
  };
}

export function reconcileSongOrder(savedOrder: readonly string[], availableIds: readonly string[]) {
  const available = new Set(availableIds);
  const seen = new Set<string>();
  return [...savedOrder, ...availableIds].filter(id => {
    if (!available.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function sanitizeLibrarySorting(
  raw: unknown,
  playlists: readonly UserPlaylist[],
  validSongIds?: ReadonlySet<string>,
): LibrarySortingPreferences {
  if (!record(raw)) return {};
  const playlistIds = new Set(playlists.map(playlist => `playlist:${playlist.id}`));
  const hasBuiltInCatalog = validSongIds !== undefined && [...validSongIds].some(id => id.startsWith("builtin:"));
  return Object.fromEntries(Object.entries(raw).flatMap(([scope, value]) => {
    if ((!categories.has(scope) && !playlistIds.has(scope)) || !record(value)) return [];
    let mode = librarySortModes.includes(value.mode as LibrarySortMode)
      ? value.mode as LibrarySortMode : "custom" as const;
    if ((scope === "built-in" || playlistIds.has(scope)) && mode.startsWith("added-")) mode = "custom";
    const ids = Array.isArray(value.customOrder)
      ? value.customOrder.filter((id): id is string =>
          typeof id === "string" && id.trim().length > 0 && id.length <= 512 &&
          (validSongIds === undefined || validSongIds.has(id) ||
            (!hasBuiltInCatalog && scope !== "local-imports" && id.startsWith("builtin:"))))
      : [];
    return [[scope, {
      mode,
      // Playlist.songIds is the only manual order source for a playlist.
      customOrder: playlistIds.has(scope) ? [] : [...new Set(ids)],
    }]];
  }));
}

export function sortLibraryItems(
  items: readonly LibrarySongListItem[],
  mode: LibrarySortMode,
  customOrder: readonly string[] = [],
  likedSongs: readonly LikedSongEntry[] = [],
  category: LibraryCategoryId = "local-imports",
): LibrarySongListItem[] {
  if (mode === "custom") {
    const byId = new Map(items.map(item => [item.librarySong.id, item]));
    return reconcileSongOrder(customOrder, items.map(item => item.librarySong.id)).map(id => byId.get(id)!);
  }
  if (mode.startsWith("added-") && !supportsAdditionSort(category)) return [...items];
  const likedAt = new Map(likedSongs.map(entry => [entry.songId, entry.likedAt]));
  const decorated = items.map(item => ({
    item,
    name: getLibrarySongName(item.librarySong),
    value: mode.startsWith("added-")
      ? category === "liked" ? likedAt.get(item.librarySong.id) : item.librarySong.importedAt
      : mode.startsWith("duration-")
        ? getSortDuration(item)
        : undefined,
  }));
  const direction = mode.endsWith("desc") ? -1 : 1;
  decorated.sort((a, b) => {
    let result: number;
    if (mode.startsWith("name-")) result = direction * nameCollator.compare(a.name, b.name);
    else {
      const aKnown = typeof a.value === "number" && Number.isFinite(a.value);
      const bKnown = typeof b.value === "number" && Number.isFinite(b.value);
      result = aKnown && bKnown ? direction * (a.value! - b.value!) : Number(bKnown) - Number(aKnown);
    }
    const aId = a.item.librarySong.id;
    const bId = b.item.librarySong.id;
    return result || (aId < bId ? -1 : aId > bId ? 1 : 0);
  });
  return decorated.map(({ item }) => item);
}

// Move by stable IDs, preserving every item outside the visible page. Returning
// the original array makes invalid/disabled/no-op moves cheap for callers.
export function reorderSongIds(
  order: string[],
  songId: string,
  targetId: string,
  position: LibraryDropPosition,
  visibleIds: readonly string[],
) {
  if (songId === targetId || !visibleIds.includes(songId) || !visibleIds.includes(targetId) ||
      !order.includes(songId) || !order.includes(targetId)) return order;
  const visible = new Set(visibleIds);
  const moved = order.filter(id => visible.has(id) && id !== songId);
  const targetIndex = moved.indexOf(targetId);
  moved.splice(targetIndex + (position === "after" ? 1 : 0), 0, songId);
  let visibleIndex = 0;
  const next = order.map(id => visible.has(id) ? moved[visibleIndex++] : id);
  return next.every((id, index) => id === order[index]) ? order : next;
}

export function reorderPlaylistSongs(
  playlists: UserPlaylist[], playlistId: string | null,
  songId: string, targetId: string, position: LibraryDropPosition,
  visibleIds: readonly string[], now: number,
) {
  const playlist = playlists.find(value => value.id === playlistId);
  if (!playlist) return playlists;
  const songIds = reorderSongIds(playlist.songIds, songId, targetId, position, visibleIds);
  if (songIds === playlist.songIds) return playlists;
  return playlists.map(value => value === playlist ? { ...value, songIds, updatedAt: now } : value);
}

export function canManuallyReorder(mode: LibrarySortMode, searchQuery: string, deferredQuery: string) {
  return mode === "custom" && !searchQuery.trim() && !deferredQuery.trim();
}

export function getAdjacentReorderTarget(ids: readonly string[], songId: string, direction: -1 | 1) {
  const index = ids.indexOf(songId);
  return index < 0 ? null : ids[index + direction] ?? null;
}

export function getDragAutoScrollDelta(y: number, top: number, bottom: number) {
  const edge = Math.min(48, Math.max(0, (bottom - top) / 3));
  if (edge === 0 || y < top - 32 || y > bottom + 32) return 0;
  if (y < top + edge) return -Math.ceil(14 * Math.min(1, (top + edge - y) / edge));
  if (y > bottom - edge) return Math.ceil(14 * Math.min(1, (y - bottom + edge) / edge));
  return 0;
}

export function reconcileSortingMembership(
  preferences: LibrarySortingPreferences,
  allItems: readonly LibrarySongListItem[],
  playlists: readonly UserPlaylist[],
) {
  const validIds = new Set(allItems.map(item => item.librarySong.id));
  const hasBuiltInCatalog = allItems.some(item => item.librarySong.source === "built-in");
  const next = sanitizeLibrarySorting(preferences, playlists, validIds);
  for (const [scope, preference] of Object.entries(next)) {
    if (scope.startsWith("playlist:")) continue;
    const members = new Set(allItems.filter(item => scope === "liked" ? item.isLiked :
      item.librarySong.source === (scope === "built-in" ? "built-in" : "local-import"))
      .map(item => item.librarySong.id));
    // An unavailable index is not evidence that every built-in song was deleted.
    preference.customOrder = preference.customOrder.filter(id => members.has(id) ||
      (!hasBuiltInCatalog && scope !== "local-imports" && id.startsWith("builtin:")));
  }
  return JSON.stringify(next) === JSON.stringify(preferences) ? preferences : next;
}
