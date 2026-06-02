import { useRef } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type {
  LibrarySong,
  LibrarySongId,
  LibrarySongListItem,
} from "../types/library";
import type { PlaybackMode } from "../types/playbackOptions";

export type ActivePlaybackContext = {
  currentSongId: LibrarySongId;
  songIds: LibrarySongId[];
  source: "local-imports" | "liked" | "playlist" | "search";
};

type PlaybackOrderNextOptions = {
  currentSongIndex: number;
  isShuffleEnabled: boolean;
  librarySongs: LibrarySong[];
  playbackMode: PlaybackMode;
};

export function usePlaybackOrder() {
  const activePlaybackContextRef = useRef<ActivePlaybackContext | null>(null);

  function setPlaybackContext({
    currentSongId,
    selectedCategory,
    songIds,
    usesSearch,
  }: {
    currentSongId: LibrarySongId;
    selectedCategory: LibraryCategoryId;
    songIds: LibrarySongId[];
    usesSearch: boolean;
  }) {
    activePlaybackContextRef.current = {
      currentSongId,
      songIds,
      source: usesSearch ? "search" : normalizeCategorySource(selectedCategory),
    };
  }

  function clearPlaybackContext() {
    activePlaybackContextRef.current = null;
  }

  function removeSongFromPlaybackContext(songId: LibrarySongId) {
    const currentContext = activePlaybackContextRef.current;

    if (!currentContext) {
      return;
    }

    const nextSongIds = currentContext.songIds.filter(
      (currentSongId) => currentSongId !== songId,
    );

    activePlaybackContextRef.current =
      nextSongIds.length === 0 || currentContext.currentSongId === songId
        ? null
        : { ...currentContext, songIds: nextSongIds };
  }

  function markCurrentSong(songId: LibrarySongId) {
    if (!activePlaybackContextRef.current) {
      return;
    }

    activePlaybackContextRef.current = {
      ...activePlaybackContextRef.current,
      currentSongId: songId,
    };
  }

  function getNextPlaybackOrderSongIndex({
    currentSongIndex,
    isShuffleEnabled,
    librarySongs,
    playbackMode,
  }: PlaybackOrderNextOptions) {
    const currentContext = activePlaybackContextRef.current;

    if (!currentContext) {
      return null;
    }

    const currentSongId =
      librarySongs[currentSongIndex]?.id ?? currentContext.currentSongId;
    const visibleSongIds = currentContext.songIds.filter((songId) =>
      librarySongs.some((librarySong) => librarySong.id === songId),
    );
    const currentPosition = visibleSongIds.indexOf(currentSongId);

    if (currentPosition === -1) {
      return null;
    }

    const nextSongId =
      isShuffleEnabled && playbackMode === "repeat-all"
        ? getRandomNextSongId(visibleSongIds, currentSongId)
        : getOrderedNextSongId(visibleSongIds, currentPosition, playbackMode);

    return nextSongId === null
      ? null
      : librarySongs.findIndex((librarySong) => librarySong.id === nextSongId);
  }

  return {
    activePlaybackContextRef,
    clearPlaybackContext,
    getNextPlaybackOrderSongIndex,
    markCurrentSong,
    removeSongFromPlaybackContext,
    setPlaybackContext,
  };
}

export function buildPlaybackOrderFromVisibleItems(
  items: LibrarySongListItem[],
  clickedSongId: LibrarySongId,
) {
  const songIds = items.map((item) => item.librarySong.id);
  const clickedIndex = songIds.indexOf(clickedSongId);

  return clickedIndex < 0 ? songIds : songIds.slice(clickedIndex);
}

function normalizeCategorySource(
  selectedCategory: LibraryCategoryId,
): ActivePlaybackContext["source"] {
  if (selectedCategory === "liked" || selectedCategory === "playlists") {
    return selectedCategory === "liked" ? "liked" : "playlist";
  }

  return "local-imports";
}

function getOrderedNextSongId(
  songIds: LibrarySongId[],
  currentPosition: number,
  playbackMode: PlaybackMode,
) {
  const nextSongId = songIds[currentPosition + 1];

  if (nextSongId) {
    return nextSongId;
  }

  return playbackMode === "repeat-all" ? songIds[0] ?? null : null;
}

function getRandomNextSongId(
  songIds: LibrarySongId[],
  currentSongId: LibrarySongId,
) {
  if (songIds.length <= 1) {
    return songIds[0] ?? null;
  }

  let nextSongId = currentSongId;

  while (nextSongId === currentSongId) {
    nextSongId = songIds[Math.floor(Math.random() * songIds.length)];
  }

  return nextSongId;
}
