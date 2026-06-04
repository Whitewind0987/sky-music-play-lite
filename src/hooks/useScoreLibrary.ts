import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { UiText } from "../i18n/uiText";
import { loadBuiltInScoreById } from "../lib/builtinScoreLoader";
import { loadBuiltInLibrarySongs } from "../lib/builtinScores";
import { formatText } from "../lib/formatText";
import {
  formatImportError,
  formatImportFailureSummary,
  type ImportFailure,
} from "../lib/importErrors";
import {
  addSongToPlaylist,
  createLibrarySong,
  createPlaylist,
  filterSongsByQuery,
  isSongLiked,
  removeSongFromAllCollections,
  removeSongFromPlaylist,
  toggleLikedSong,
} from "../lib/libraryCollections";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "../lib/scoreFileImport";
import type { PersistedAppData } from "../types/appData";
import type {
  LibrarySong,
  LibrarySongId,
  LibrarySongListItem,
  LikedSongEntry,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";

type UseScoreLibraryOptions = {
  appendLog: (entry: string) => void;
  onBeforeLibraryMutation: () => void;
  text: UiText;
};

const BUILT_IN_PAGE_SIZE = 100;

export function useScoreLibrary({
  appendLog,
  onBeforeLibraryMutation,
  text,
}: UseScoreLibraryOptions) {
  const [builtInLibrarySongs, setBuiltInLibrarySongs] = useState<LibrarySong[]>([]);
  const [hasLoadedBuiltInSongs, setHasLoadedBuiltInSongs] = useState(false);
  const pendingPersistedSelectedLocalIndexRef = useRef<number | null>(null);
  const importedSongsRef = useRef<Song[]>([]);
  const librarySongsRef = useRef<LibrarySong[]>([]);
  const localLibrarySongsRef = useRef<LibrarySong[]>([]);
  const [localLibrarySongs, setLocalLibrarySongs] = useState<LibrarySong[]>([]);
  const [likedSongs, setLikedSongs] = useState<LikedSongEntry[]>([]);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [importError, setImportError] = useState("");
  const [loadingBuiltInSongIds, setLoadingBuiltInSongIds] = useState<
    Set<LibrarySongId>
  >(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [builtInPage, setBuiltInPage] = useState(1);
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(
    null,
  );
  const [selectedLibraryCategory, setSelectedLibraryCategory] =
    useState<LibraryCategoryId>("local-imports");
  const librarySongs = useMemo(
    () => [...builtInLibrarySongs, ...localLibrarySongs],
    [builtInLibrarySongs, localLibrarySongs],
  );
  const importedSongs = useMemo(
    () => librarySongs.map((librarySong) => librarySong.song),
    [librarySongs],
  );
  const currentSelectedSong =
    selectedSongIndex === null ? null : importedSongs[selectedSongIndex] ?? null;
  const selectedPlaylist =
    selectedPlaylistId === null
      ? null
      : playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const allLibraryItems = useMemo(
    () =>
      librarySongs.map((librarySong, songIndex) => ({
        isLiked: isSongLiked(likedSongs, librarySong.id),
        librarySong,
        songIndex,
      })),
    [librarySongs, likedSongs],
  );
  const categoryLibraryItems = useMemo(() => {
    if (selectedLibraryCategory === "built-in") {
      return allLibraryItems.filter(
        (item) => item.librarySong.source === "built-in",
      );
    }

    if (selectedLibraryCategory === "liked") {
      return allLibraryItems.filter((item) => item.isLiked);
    }

    if (selectedLibraryCategory === "playlists") {
      if (!selectedPlaylist) {
        return [];
      }

      return selectedPlaylist.songIds
        .map((songId) =>
          allLibraryItems.find((item) => item.librarySong.id === songId),
        )
        .filter((item): item is (typeof allLibraryItems)[number] =>
          Boolean(item),
        );
    }

    if (selectedLibraryCategory === "local-imports") {
      return allLibraryItems.filter(
        (item) => item.librarySong.source === "local-import",
      );
    }

    return [];
  }, [allLibraryItems, selectedLibraryCategory, selectedPlaylist]);
  const visibleLibraryItems = useMemo(
    () => filterSongsByQuery(categoryLibraryItems, searchQuery),
    [categoryLibraryItems, searchQuery],
  );
  const builtInPagination = useMemo(() => {
    if (selectedLibraryCategory !== "built-in") {
      return null;
    }

    const total = visibleLibraryItems.length;
    const pageCount = Math.max(1, Math.ceil(total / BUILT_IN_PAGE_SIZE));
    const page = Math.min(Math.max(builtInPage, 1), pageCount);
    const start = total === 0 ? 0 : (page - 1) * BUILT_IN_PAGE_SIZE + 1;
    const end = Math.min(page * BUILT_IN_PAGE_SIZE, total);

    return {
      end,
      onNextPage: () =>
        setBuiltInPage((currentPage) => Math.min(currentPage + 1, pageCount)),
      onPreviousPage: () =>
        setBuiltInPage((currentPage) => Math.max(currentPage - 1, 1)),
      page,
      pageCount,
      pageSize: BUILT_IN_PAGE_SIZE,
      start,
      total,
    };
  }, [builtInPage, selectedLibraryCategory, visibleLibraryItems.length]);
  const pagedVisibleLibraryItems = useMemo(() => {
    if (selectedLibraryCategory !== "built-in" || builtInPagination === null) {
      return visibleLibraryItems;
    }

    return visibleLibraryItems.slice(
      builtInPagination.start === 0 ? 0 : builtInPagination.start - 1,
      builtInPagination.end,
    );
  }, [builtInPagination, selectedLibraryCategory, visibleLibraryItems]);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const validCollectionSongIds = useMemo(
    () => librarySongs.map((librarySong) => librarySong.id),
    [librarySongs],
  );
  const persistedSelectedSongIndex = useMemo(() => {
    if (selectedSongIndex === null) {
      return null;
    }

    const selectedLibrarySong = librarySongs[selectedSongIndex];

    if (!selectedLibrarySong || selectedLibrarySong.source !== "local-import") {
      return null;
    }

    const localSongIndex = localLibrarySongs.findIndex(
      (librarySong) => librarySong.id === selectedLibrarySong.id,
    );

    return localSongIndex >= 0 ? localSongIndex : null;
  }, [librarySongs, localLibrarySongs, selectedSongIndex]);

  useEffect(() => {
    let isCancelled = false;

    async function loadBuiltInSongs() {
      const result = await loadBuiltInLibrarySongs();

      if (isCancelled) {
        return;
      }

      setBuiltInLibrarySongs(result.songs);
      setHasLoadedBuiltInSongs(true);
    }

    void loadBuiltInSongs().catch((error) => {
      console.warn("[built-in-scores] load failed", error);

      if (!isCancelled) {
        setBuiltInLibrarySongs([]);
        setHasLoadedBuiltInSongs(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setBuiltInPage(1);
  }, [searchQuery, selectedLibraryCategory]);

  useEffect(() => {
    const persistedLocalIndex = pendingPersistedSelectedLocalIndexRef.current;

    if (persistedLocalIndex === null || !hasLoadedBuiltInSongs) {
      return;
    }

    pendingPersistedSelectedLocalIndexRef.current = null;

    if (localLibrarySongsRef.current[persistedLocalIndex]) {
      setSelectedSongIndex(builtInLibrarySongs.length + persistedLocalIndex);
    }
  }, [builtInLibrarySongs.length, hasLoadedBuiltInSongs]);

  useEffect(() => {
    importedSongsRef.current = importedSongs;
  }, [importedSongs]);

  useEffect(() => {
    librarySongsRef.current = librarySongs;
  }, [librarySongs]);

  useEffect(() => {
    if (selectedSongIndex !== null && !librarySongs[selectedSongIndex]) {
      setSelectedSongIndex(null);
    }
  }, [librarySongs, selectedSongIndex]);

  useEffect(() => {
    localLibrarySongsRef.current = localLibrarySongs;
  }, [localLibrarySongs]);

  async function handleImportScoreFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const failedImports: ImportFailure[] = [];
    const importedSongsFromFiles: Song[] = [];
    let successfulFileCount = 0;

    for (const file of files) {
      try {
        if (!isSupportedScoreFileName(file.name)) {
          throw new Error(text.score.unsupportedFile);
        }

        const content = await file.text();
        const songs = parseScoreFileContent(content);

        importedSongsFromFiles.push(...songs);
        successfulFileCount += 1;
      } catch (error) {
        failedImports.push({
          error: formatImportError(error, text),
          fileName: file.name,
        });
      }
    }

    if (importedSongsFromFiles.length > 0) {
      const firstNewSongIndex =
        builtInLibrarySongs.length + localLibrarySongsRef.current.length;
      const shouldSelectFirstImportedSong = selectedSongIndex === null;
      const nextLocalLibrarySongs = importedSongsFromFiles.map((song) =>
        createLibrarySong(song),
      );

      setLocalLibrarySongs((currentSongs) => {
        const nextSongs = [...currentSongs, ...nextLocalLibrarySongs];

        localLibrarySongsRef.current = nextSongs;
        return nextSongs;
      });

      if (shouldSelectFirstImportedSong) {
        setSelectedSongIndex(firstNewSongIndex);
      }

      setImportError("");
      appendLog(
        formatText(text.logs.importedScoresFromFiles, {
          count: importedSongsFromFiles.length,
          fileCount: successfulFileCount,
        }),
      );
    }

    if (failedImports.length > 0) {
      setImportError(formatImportFailureSummary(failedImports));

      failedImports.forEach(({ error, fileName }) => {
        appendLog(
          formatText(text.logs.importFailed, {
            error,
            fileName,
          }),
        );
      });
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    onBeforeLibraryMutation();
    setSelectedSongIndex(songIndex);

    if (songIndex !== null) {
      void preloadBuiltInSong(songIndex);
    }
  }

  function handleLibraryCategoryChange(category: LibraryCategoryId) {
    setSelectedLibraryCategory(category);

    if (category === "playlists" && selectedPlaylistId === null) {
      setSelectedPlaylistId(playlists[0]?.id ?? null);
    }
  }

  function handleToggleLikedSong(songIndex: number) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      return;
    }

    const nextLikedSongs = toggleLikedSong(likedSongs, librarySong.id);

    setLikedSongs(nextLikedSongs);
    clearSelectedSongIfMissingFromCurrentView({
      likedSongs: nextLikedSongs,
    });
  }

  function handleRemoveFromLiked(songId: LibrarySongId) {
    const nextLikedSongs = likedSongs.filter((entry) => entry.songId !== songId);

    setLikedSongs(nextLikedSongs);
    clearSelectedSongIfMissingFromCurrentView({
      likedSongs: nextLikedSongs,
    });
  }

  function handleCreatePlaylist(
    playlistName: string = text.library.defaultPlaylistName,
  ) {
    const playlist = createPlaylist(
      playlistName.trim() || text.library.defaultPlaylistName,
    );

    setPlaylists((currentPlaylists) => [...currentPlaylists, playlist]);
    setSelectedPlaylistId(playlist.id);
    setSelectedLibraryCategory("playlists");
  }

  function handleRenamePlaylist(playlistId: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    const nextName = window.prompt(text.library.renamePlaylistPrompt, playlist.name);

    if (nextName === null) {
      return;
    }

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((currentPlaylist) =>
        currentPlaylist.id === playlistId
          ? {
              ...currentPlaylist,
              name: nextName.trim() || playlist.name,
              updatedAt: Date.now(),
            }
          : currentPlaylist,
      ),
    );
  }

  function handleDeletePlaylist(playlistId: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    if (
      !window.confirm(
        formatText(text.library.deletePlaylistConfirm, {
          playlistName: playlist.name,
        }),
      )
    ) {
      return;
    }

    const deletedPlaylistIndex = playlists.findIndex(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );
    const nextPlaylists = playlists.filter(
      (currentPlaylist) => currentPlaylist.id !== playlistId,
    );
    const nextSelectedPlaylistId =
      selectedPlaylistId === playlistId
        ? nextPlaylists[Math.min(deletedPlaylistIndex, nextPlaylists.length - 1)]
            ?.id ?? null
        : selectedPlaylistId;

    setPlaylists(nextPlaylists);
    setSelectedPlaylistId(nextSelectedPlaylistId);
    clearSelectedSongIfMissingFromCurrentView({
      playlists: nextPlaylists,
      selectedPlaylistId: nextSelectedPlaylistId,
    });
  }

  function handleAddSongToPlaylist(playlistId: string, songIndex: number) {
    const librarySong = librarySongsRef.current[songIndex];
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!librarySong || !playlist) {
      return;
    }

    if (playlist.songIds.includes(librarySong.id)) {
      appendLog(
        formatText(text.logs.playlistSongAlreadyExists, {
          songName: librarySong.song.name,
        }),
      );
      return;
    }

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((currentPlaylist) =>
        currentPlaylist.id === playlistId
          ? addSongToPlaylist(currentPlaylist, librarySong.id)
          : currentPlaylist,
      ),
    );
  }

  function handleCreatePlaylistWithSong(
    songIndex: number,
    playlistName: string = text.library.defaultPlaylistName,
  ) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      return;
    }

    const playlist = addSongToPlaylist(
      createPlaylist(playlistName.trim() || text.library.defaultPlaylistName),
      librarySong.id,
    );

    setPlaylists((currentPlaylists) => [...currentPlaylists, playlist]);
    setSelectedPlaylistId(playlist.id);
    setSelectedLibraryCategory("playlists");
  }

  function handleRemoveSongFromPlaylist(
    playlistId: string,
    songId: LibrarySongId,
  ) {
    const nextPlaylists = playlists.map((playlist) =>
      playlist.id === playlistId
        ? removeSongFromPlaylist(playlist, songId)
        : playlist,
    );

    setPlaylists(nextPlaylists);
    clearSelectedSongIfMissingFromCurrentView({
      playlists: nextPlaylists,
    });
  }

  function handleDeleteLocalSong(
    songIndex: number,
    onDeleted?: (deletedSongIndex: number, deletedSongId: LibrarySongId) => void,
  ) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong || librarySong.source !== "local-import") {
      return;
    }

    if (
      !window.confirm(
        formatText(text.library.deleteLocalSongConfirm, {
          songName: librarySong.song.name,
        }),
      )
    ) {
      return;
    }

    onBeforeLibraryMutation();
    onDeleted?.(songIndex, librarySong.id);

    const removedCollections = removeSongFromAllCollections({
      likedSongs,
      playlists,
      songId: librarySong.id,
    });
    const nextCombinedSongCount = Math.max(0, librarySongsRef.current.length - 1);

    setLikedSongs(removedCollections.likedSongs);
    setPlaylists(removedCollections.playlists);
    setLocalLibrarySongs((currentSongs) => {
      const nextSongs = currentSongs.filter(
        (currentSong) => currentSong.id !== librarySong.id,
      );

      localLibrarySongsRef.current = nextSongs;
      return nextSongs;
    });
    setSelectedSongIndex((currentSelectedSongIndex) =>
      getNextSelectedSongIndexAfterDelete(
        currentSelectedSongIndex,
        songIndex,
        nextCombinedSongCount,
      ),
    );
  }

  function applyScoreLibrary(library: PersistedAppData["library"]) {
    const nextLocalLibrarySongs = library.librarySongs;
    const nextLibrarySongs = [...builtInLibrarySongs, ...nextLocalLibrarySongs];
    const nextSelectedPlaylistId =
      library.selectedPlaylistId !== null &&
      library.playlists.some((playlist) => playlist.id === library.selectedPlaylistId)
        ? library.selectedPlaylistId
        : library.playlists[0]?.id ?? null;
    const nextSelectedSongIndex =
      library.selectedSongIndex !== null &&
      nextLocalLibrarySongs[library.selectedSongIndex]
        ? builtInLibrarySongs.length + library.selectedSongIndex
        : null;

    pendingPersistedSelectedLocalIndexRef.current = library.selectedSongIndex;
    localLibrarySongsRef.current = nextLocalLibrarySongs;
    librarySongsRef.current = nextLibrarySongs;
    setLocalLibrarySongs(nextLocalLibrarySongs);
    setLikedSongs(library.likedSongs);
    setPlaylists(library.playlists);
    setSelectedPlaylistId(nextSelectedPlaylistId);
    setSelectedLibraryCategory(library.selectedLibraryCategory);
    setSelectedSongIndex(nextSelectedSongIndex);
    setImportError("");
    setSearchQuery("");
  }

  function isBuiltInSongLoading(songId: LibrarySongId) {
    return loadingBuiltInSongIds.has(songId);
  }

  function preloadBuiltInSong(songIndex: number) {
    return loadBuiltInSong(songIndex, { shouldLogFailure: false });
  }

  function resolveSongForPlayback(songIndex: number) {
    return loadBuiltInSong(songIndex, { shouldLogFailure: true });
  }

  async function loadBuiltInSong(
    songIndex: number,
    { shouldLogFailure }: { shouldLogFailure: boolean },
  ) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      if (shouldLogFailure) {
        appendLog(text.logs.noSelectedScore);
      }
      return null;
    }

    if (librarySong.source !== "built-in" || librarySong.isBuiltInLoaded) {
      return librarySong.song;
    }

    setBuiltInSongLoading(librarySong.id, true);

    const loadedSong = await loadBuiltInScoreById(librarySong.id);

    if (loadedSong === null) {
      setBuiltInSongLoading(librarySong.id, false);

      if (shouldLogFailure) {
        appendLog(
          formatText(text.logs.builtInScoreLoadFailed, {
            songName: librarySong.song.name,
          }),
        );
      }

      return null;
    }

    setBuiltInSongLoading(librarySong.id, false);
    setBuiltInLibrarySongs((currentBuiltInLibrarySongs) => {
      const nextBuiltInLibrarySongs = currentBuiltInLibrarySongs.map(
        (currentSong) =>
          currentSong.id === librarySong.id
            ? {
                ...currentSong,
                isBuiltInLoaded: true,
                song: loadedSong,
              }
            : currentSong,
      );
      const nextLibrarySongs = [
        ...nextBuiltInLibrarySongs,
        ...localLibrarySongsRef.current,
      ];

      librarySongsRef.current = nextLibrarySongs;
      importedSongsRef.current = nextLibrarySongs.map(
        (currentSong) => currentSong.song,
      );

      return nextBuiltInLibrarySongs;
    });

    return loadedSong;
  }

  function setBuiltInSongLoading(songId: LibrarySongId, isLoading: boolean) {
    setLoadingBuiltInSongIds((currentLoadingIds) => {
      const nextLoadingIds = new Set(currentLoadingIds);

      if (isLoading) {
        nextLoadingIds.add(songId);
      } else {
        nextLoadingIds.delete(songId);
      }

      return nextLoadingIds;
    });
  }

  function clearSelectedSongIfMissingFromCurrentView({
    likedSongs: nextLikedSongs = likedSongs,
    playlists: nextPlaylists = playlists,
    selectedPlaylistId: nextSelectedPlaylistId = selectedPlaylistId,
  }: {
    likedSongs?: LikedSongEntry[];
    playlists?: UserPlaylist[];
    selectedPlaylistId?: string | null;
  }) {
    const nextVisibleItems = getVisibleLibraryItemsForState({
      likedSongs: nextLikedSongs,
      playlists: nextPlaylists,
      selectedPlaylistId: nextSelectedPlaylistId,
    });

    setSelectedSongIndex((currentSelectedSongIndex) => {
      if (currentSelectedSongIndex === null) {
        return null;
      }

      const selectedSong = librarySongsRef.current[currentSelectedSongIndex];

      if (!selectedSong) {
        return null;
      }

      return nextVisibleItems.some(
        (item) => item.librarySong.id === selectedSong.id,
      )
        ? currentSelectedSongIndex
        : null;
    });
  }

  function getVisibleLibraryItemsForState({
    likedSongs: nextLikedSongs,
    playlists: nextPlaylists,
    selectedPlaylistId: nextSelectedPlaylistId,
  }: {
    likedSongs: LikedSongEntry[];
    playlists: UserPlaylist[];
    selectedPlaylistId: string | null;
  }): LibrarySongListItem[] {
    const nextAllItems = librarySongsRef.current.map((librarySong, songIndex) => ({
      isLiked: isSongLiked(nextLikedSongs, librarySong.id),
      librarySong,
      songIndex,
    }));

    let nextCategoryItems: LibrarySongListItem[];

    if (selectedLibraryCategory === "liked") {
      nextCategoryItems = nextAllItems.filter((item) => item.isLiked);
    } else if (selectedLibraryCategory === "playlists") {
      const nextSelectedPlaylist =
        nextSelectedPlaylistId === null
          ? null
          : nextPlaylists.find(
              (playlist) => playlist.id === nextSelectedPlaylistId,
            ) ?? null;

      nextCategoryItems =
        nextSelectedPlaylist?.songIds
          .map((songId) =>
            nextAllItems.find((item) => item.librarySong.id === songId),
          )
          .filter((item): item is LibrarySongListItem => Boolean(item)) ?? [];
    } else if (selectedLibraryCategory === "built-in") {
      nextCategoryItems = nextAllItems.filter(
        (item) => item.librarySong.source === "built-in",
      );
    } else {
      nextCategoryItems = nextAllItems.filter(
        (item) => item.librarySong.source === "local-import",
      );
    }

    return filterSongsByQuery(nextCategoryItems, searchQuery);
  }

  return {
    allLibraryItems,
    applyScoreLibrary,
    currentSelectedSong,
    handleAddSongToPlaylist,
    handleCreatePlaylist,
    handleCreatePlaylistWithSong,
    handleDeleteLocalSong,
    handleDeletePlaylist,
    handleImportScoreFiles,
    handleLibraryCategoryChange,
    handleRemoveFromLiked,
    handleRemoveSongFromPlaylist,
    handleRenamePlaylist,
    handleSelectImportedSong,
    handleToggleLikedSong,
    builtInPagination,
    hasSearchQuery,
    hasLoadedBuiltInSongs,
    importError,
    importedSongs,
    importedSongsRef,
    isBuiltInSongLoading,
    librarySongs,
    likedSongs,
    localLibrarySongs,
    pagedVisibleLibraryItems,
    persistedSelectedSongIndex,
    playlists,
    preloadBuiltInSong,
    resolveSongForPlayback,
    searchQuery,
    selectedLibraryCategory,
    selectedPlaylist,
    selectedPlaylistId,
    selectedSongIndex,
    setSearchQuery,
    setSelectedPlaylistId,
    setSelectedSongIndex,
    validCollectionSongIds,
    visibleLibraryItems,
  };
}

function getNextSelectedSongIndexAfterDelete(
  currentSelectedSongIndex: number | null,
  deletedSongIndex: number,
  nextSongCount: number,
) {
  if (currentSelectedSongIndex === null) {
    return null;
  }

  if (currentSelectedSongIndex > deletedSongIndex) {
    return currentSelectedSongIndex - 1;
  }

  if (currentSelectedSongIndex < deletedSongIndex) {
    return currentSelectedSongIndex;
  }

  if (nextSongCount <= 0) {
    return null;
  }

  return Math.min(deletedSongIndex, nextSongCount - 1);
}
