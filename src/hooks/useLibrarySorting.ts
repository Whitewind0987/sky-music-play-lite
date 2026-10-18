import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { LibrarySongListItem, LikedSongEntry, UserPlaylist } from "../types/library";
import type { LibraryDropPosition, LibrarySortMode, LibrarySortingPreferences } from "../types/librarySorting";
import {
  canManuallyReorder, getLibrarySortScope, reconcileSortingMembership,
  reorderSongIds, reorderPlaylistSongs, sanitizeLibrarySorting, sortLibraryItems, supportsAdditionSort,
  updateLibrarySortMode,
} from "../lib/librarySorting";

type Options = {
  allItems: LibrarySongListItem[];
  categoryItems: LibrarySongListItem[];
  category: LibraryCategoryId;
  playlistId: string | null;
  playlists: UserPlaylist[];
  setPlaylists: Dispatch<SetStateAction<UserPlaylist[]>>;
  likedSongs: LikedSongEntry[];
  searchQuery: string;
  deferredQuery: string;
  catalogReady: boolean;
};

export function useLibrarySorting({
  allItems, categoryItems, category, playlistId, playlists, setPlaylists,
  likedSongs, searchQuery, deferredQuery, catalogReady,
}: Options) {
  const [preferences, setPreferences] = useState<LibrarySortingPreferences>({});
  const [orderRevision, setOrderRevision] = useState(0);
  const scope = getLibrarySortScope(category, playlistId);
  const preference = scope === null ? undefined : preferences[scope];
  const mode = preference?.mode ?? "custom";
  const canReorder = scope !== null && canManuallyReorder(mode, searchQuery, deferredQuery);
  const sortedItems = useMemo(() => sortLibraryItems(
    categoryItems, mode, preference?.customOrder, likedSongs, category,
  ), [categoryItems, mode, preference, likedSongs, category]);

  useEffect(() => {
    if (catalogReady) setPreferences(current => reconcileSortingMembership(current, allItems, playlists));
  }, [catalogReady, allItems, playlists]);

  const applyPreferences = useCallback((value: unknown, savedPlaylists: UserPlaylist[]) => {
    setPreferences(sanitizeLibrarySorting(value, savedPlaylists));
  }, []);

  function setMode(nextMode: LibrarySortMode) {
    if (scope === null || nextMode === mode ||
        (nextMode.startsWith("added-") && !supportsAdditionSort(category))) return;
    setPreferences(current => updateLibrarySortMode(current, scope, nextMode));
    setOrderRevision(revision => revision + 1);
    return sortLibraryItems(categoryItems, nextMode, preference?.customOrder, likedSongs, category);
  }

  function reorder(songId: string, targetId: string, position: LibraryDropPosition, visibleIds: string[]) {
    if (!canReorder || scope === null) return;
    const order = sortedItems.map(item => item.librarySong.id);
    const next = reorderSongIds(order, songId, targetId, position, visibleIds);
    if (next === order) return;

    if (category === "playlists") {
      setPlaylists(current => reorderPlaylistSongs(
        current, playlistId, songId, targetId, position, visibleIds, Date.now(),
      ));
    } else {
      setPreferences(current => ({
        ...current,
        [scope]: { mode: "custom", customOrder: next },
      }));
    }
    setOrderRevision(revision => revision + 1);
  }

  function sortForScope(items: LibrarySongListItem[], targetCategory: LibraryCategoryId, targetPlaylistId: string | null = null) {
    const key = getLibrarySortScope(targetCategory, targetPlaylistId);
    const target = key === null ? undefined : preferences[key];
    return sortLibraryItems(items, target?.mode ?? "custom", target?.customOrder, likedSongs, targetCategory);
  }

  return { preferences, orderRevision, mode, canReorder, sortedItems, applyPreferences, setMode, reorder, sortForScope };
}
