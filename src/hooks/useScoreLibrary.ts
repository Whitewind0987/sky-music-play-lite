// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import { useLibrarySorting } from "./useLibrarySorting";
import { getLibraryPageItems, getLibrarySongPage } from "../lib/libraryPagination";
import { supportsAdditionSort } from "../lib/librarySorting";
import { getLibraryCategoryItems, getLibrarySongCategory, moveLocalLibrarySong } from "../lib/libraryGroups";
import type { LibrarySortingControls } from "../types/librarySorting";
import type { UiText } from "../i18n/uiText";
import { loadBuiltInScoreById } from "../lib/builtinScoreLoader";
import { loadBuiltInLibrarySongs } from "../lib/builtinScores";
import { formatText } from "../lib/formatText";
import { InFlightByKey } from "../lib/inFlightByKey";
import { ImportedScoreSongLoader } from "../lib/importedScoreSongLoader";
import {
  formatImportError,
  formatImportFailureSummary,
  type ImportFailure,
} from "../lib/importErrors";
import {
  addSongToPlaylist,
  createPlaylist,
  createPlaylistCopyOfLocalSong as createPlaylistCopyRecord,
  enrichLocalSongFormatVersion,
  filterSongsByQuery,
  getLibrarySongFormatVersion,
  getLibrarySongName,
  getSourceSongId,
  isSongLiked,
  removeSongFromPlaylist,
  toggleLikedSong,
} from "../lib/libraryCollections";
import {
  loadLocalImportedSongForPlayback,
  validateLoadedLocalSong,
} from "../lib/localImportedSongPlayback";
import {
  cleanupMissingImportedScores,
  resolveImportedScoreAfterExistenceCheck,
} from "../lib/missingImportedScores";
import {
  collectRemovedLibrarySongs,
  type RemovedLibrarySong,
} from "../lib/missingScorePlaybackSync";
import { deleteLocalSongWithScoreFile } from "../lib/localSongDeletion";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "../lib/scoreFileImport";
import {
  storeUniqueImportedSongs,
  type ParsedImportedSong,
} from "../lib/scoreLibraryImport";
import { persistRecordedSong } from "../lib/recordedScoreLibrary";
import {
  deleteArchiveFolder,
  deleteImportedScoreFile,
  deletePlaylistExportFolder,
  exportImportedScoreSong,
  exportScoresIntoExportedFolder,
  importedScoreFileExists,
  migrateLegacyScoreMirror,
  openExportedScoresDirectory,
  openScoreArchiveDirectory,
  readImportedScoreSong,
  revealImportedScoreFile,
  saveImportedScoreSong as saveImportedScoreSongFile,
  syncScoreMirrorToDisk,
  type ArchiveScoreEntry,
} from "../lib/tauriApi";
import {
  assignMirrorFolderNames,
  getMirrorFolderNameForCategory,
  isReservedMirrorFolderName,
} from "../lib/mirrorFolderNames";
import type { PersistedAppData } from "../types/appData";
import type {
  AddSongToPlaylistResult,
  BuiltInLibrarySong,
  LibrarySong,
  LibrarySongId,
  LikedSongEntry,
  LocalLibrarySong,
  LocalLibraryGroup,
  MigrationFallbackSongs,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";
import {
  V1ToV2ConversionError,
  type V1ToV2ConversionOptions,
} from "../lib/v1ToV2Conversion";
import {
  createV2LocalLibraryCopy,
  getCreatedV2LibraryCopyState,
  getV2UpgradeDuplicateNotice,
} from "../lib/v1ToV2LibraryUpgrade";
import {
  getIsScoreUpgradeInProgress as readScoreUpgradeInProgress,
  runWithScoreUpgradeInProgress,
} from "../lib/scoreUpgradeOperation";

// 归档根目录下由分类固定占用的文件夹名，歌单不得与之冲突删除。
const RESERVED_ARCHIVE_FOLDER_NAMES = new Set(["本地导入", "已转换", "我喜欢"]);type UseScoreLibraryOptions = {
  appendLog: (entry: string) => void;
  onBeforeLibraryMutation: () => void;
  onBeforeMissingPlaybackSongRemoval?: (songId: LibrarySongId) => void;
  onMissingLocalSongsRemoved?: (removedSongs: RemovedLibrarySong[]) => void;
  showNotice?: (message: string) => void;
  text: UiText;
};

type DeleteLocalSongOptions = {
  stopPlaybackBeforeDelete?: boolean;
};

export type LocateScoreRequest = {
  requestId: number;
  songId: LibrarySongId;
};

export type UpgradeSongToV2Result =
  | { status: "created"; librarySong: LocalLibrarySong }
  | { status: "duplicate"; message: string }
  | { status: "failed"; message: string };

type UpgradeSongToV2ExecutionOptions = {
  getBlockedMessage?: () => string | null;
  resolvedSourceSong?: Song;
};

const BUILT_IN_PAGE_SIZE = 100;

export function useScoreLibrary({
  appendLog,
  onBeforeLibraryMutation,
  onBeforeMissingPlaybackSongRemoval,
  onMissingLocalSongsRemoved,
  showNotice,
  text,
}: UseScoreLibraryOptions) {
  const [builtInLibrarySongs, setBuiltInLibrarySongs] = useState<
    BuiltInLibrarySong[]
  >([]);
  const [hasLoadedBuiltInSongs, setHasLoadedBuiltInSongs] = useState(false);
  const librarySongsRef = useRef<LibrarySong[]>([]);
  const localLibrarySongsRef = useRef<LocalLibrarySong[]>([]);
  const [localLibrarySongs, setLocalLibrarySongs] = useState<
    LocalLibrarySong[]
  >([]);
  const migrationFallbackSongsRef = useRef<MigrationFallbackSongs>({});
  const [migrationFallbackSongs, setMigrationFallbackSongs] =
    useState<MigrationFallbackSongs>({});
  const [likedSongs, setLikedSongs] = useState<LikedSongEntry[]>([]);
  const likedSongsRef = useRef<LikedSongEntry[]>([]);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const playlistsRef = useRef<UserPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [importError, setImportError] = useState("");
  const [loadingBuiltInSongIds, setLoadingBuiltInSongIds] = useState<
    Set<LibrarySongId>
  >(new Set());
  const [loadingLocalSongIds, setLoadingLocalSongIds] = useState<
    Set<LibrarySongId>
  >(new Set());
  const [exportingLocalSongIds, setExportingLocalSongIds] = useState<
    Set<LibrarySongId>
  >(new Set());
  const builtInSongLoadRef = useRef(new InFlightByKey<Song | null>());
  const importedScoreSongLoaderRef = useRef(new ImportedScoreSongLoader());
  const isScoreUpgradeInProgressRef = useRef(false);
  const localSongLoadCountsRef = useRef(new Map<LibrarySongId, number>());
  const exportingLocalSongIdsRef = useRef(new Set<LibrarySongId>());
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [builtInPage, setBuiltInPage] = useState(1);
  const [selectedSongId, setSelectedSongId] = useState<LibrarySongId | null>(
    null,
  );
  const selectedSongIdRef = useRef<LibrarySongId | null>(null);
  const [playbackSongId, setPlaybackSongId] = useState<LibrarySongId | null>(
  null,
  );
  const playbackSongIdRef = useRef<LibrarySongId | null>(null);
  const [locateScoreRequest, setLocateScoreRequest] =
    useState<LocateScoreRequest | null>(null);
  const [selectedLibraryCategory, setSelectedLibraryCategory] =
    useState<LibraryCategoryId>("local-imports");
  const librarySongs = useMemo(
    () => [...builtInLibrarySongs, ...localLibrarySongs],
    [builtInLibrarySongs, localLibrarySongs],
  );
  const selectedSongIndex = useMemo(() => {
    if (selectedSongId === null) {
      return null;
    }

    const index = librarySongs.findIndex(
      (librarySong) => librarySong.id === selectedSongId,
    );

    return index >= 0 ? index : null;
  }, [librarySongs, selectedSongId]);
  const playbackSongIndex = useMemo(() => {
  if (playbackSongId === null) {
    return null;
  }

  const index = librarySongs.findIndex(
    (librarySong) => librarySong.id === playbackSongId,
  );

  return index >= 0 ? index : null;
  }, [librarySongs, playbackSongId]);
  const currentSelectedSong =
    selectedSongIndex === null ? null : librarySongs[selectedSongIndex] ?? null;
  const currentPlaybackSong =
  playbackSongIndex === null ? null : librarySongs[playbackSongIndex] ?? null;

  const currentPlaybackLibrarySong =
  playbackSongIndex === null ? null : librarySongs[playbackSongIndex] ?? null;
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
  const categoryLibraryItems = useMemo(
    () => getLibraryCategoryItems(allLibraryItems, selectedLibraryCategory, selectedPlaylist),
    [allLibraryItems, selectedLibraryCategory, selectedPlaylist],
  );
  const librarySorting = useLibrarySorting({
    allItems: allLibraryItems,
    categoryItems: categoryLibraryItems,
    category: selectedLibraryCategory,
    playlistId: selectedPlaylist?.id ?? null,
    playlists,
    setPlaylists,
    likedSongs,
    searchQuery,
    deferredQuery: deferredSearchQuery,
    catalogReady: hasLoadedBuiltInSongs,
  });
  // Playback captures the existing category/search sequence. Display sorting
  // must not silently change repeat/shuffle context when a sort mode changes.
  const visibleLibraryItems = useMemo(
    () => filterSongsByQuery(categoryLibraryItems, deferredSearchQuery),
    [categoryLibraryItems, deferredSearchQuery],
  );
  const sortedVisibleLibraryItems = useMemo(
    () => filterSongsByQuery(librarySorting.sortedItems, deferredSearchQuery),
    [librarySorting.sortedItems, deferredSearchQuery],
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
        startTransition(() => {
          setBuiltInPage((currentPage) => Math.min(currentPage + 1, pageCount));
        }),
      onPageChange: (nextPage: number) => {
        if (!Number.isSafeInteger(nextPage)) {
          return;
        }

        startTransition(() => {
          setBuiltInPage(Math.min(Math.max(nextPage, 1), pageCount));
        });
      },
      onPreviousPage: () =>
        startTransition(() => {
          setBuiltInPage((currentPage) => Math.max(currentPage - 1, 1));
        }),
      page,
      pageCount,
      pageSize: BUILT_IN_PAGE_SIZE,
      start,
      total,
    };
  }, [builtInPage, selectedLibraryCategory, visibleLibraryItems.length]);
  const pagedVisibleLibraryItems = useMemo(() => {
    if (selectedLibraryCategory !== "built-in" || builtInPagination === null) {
      return sortedVisibleLibraryItems;
    }

    return getLibraryPageItems(
      sortedVisibleLibraryItems, builtInPagination.page, builtInPagination.pageSize,
    );
  }, [builtInPagination, selectedLibraryCategory, sortedVisibleLibraryItems]);
  const sortingControls: LibrarySortingControls = {
    mode: librarySorting.mode,
    supportsAdded: supportsAdditionSort(selectedLibraryCategory),
    canEdit: librarySorting.canEdit,
    isEditing: librarySorting.isEditing,
    canReorder: librarySorting.canReorder,
    onToggleEditing: librarySorting.toggleEditing,
    onModeChange: (mode) => {
      const nextItems = librarySorting.setMode(mode);
      if (nextItems) {
        // Keep the selected built-in song visible after sorting; the bottom
        // player still resolves selection against the current visible page.
        setBuiltInPage(selectedLibraryCategory === "built-in"
          ? getLibrarySongPage(filterSongsByQuery(nextItems, deferredSearchQuery), selectedSongId, BUILT_IN_PAGE_SIZE)
          : 1);
      }
    },
    onReorder: (songId, targetId, position) => librarySorting.reorder(
      songId, targetId, position, pagedVisibleLibraryItems.map(item => item.librarySong.id),
    ),
  };
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
    librarySongsRef.current = librarySongs;
  }, [librarySongs]);

  useEffect(() => {
    localLibrarySongsRef.current = localLibrarySongs;
  }, [localLibrarySongs]);

  useEffect(() => {
    likedSongsRef.current = likedSongs;
  }, [likedSongs]);

  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);

  // ---- 自动镜像同步 ----
  // 歌单结构（新增/删除/改名/加曲/移除曲）与收藏变化后，
  // 自动把当前结构镜像到本地文件夹。
  // 首次同步由「启动加载完成」触发；后续变化 debounce 500ms 后同步，
  // 避免连续操作（如批量加歌）产生大量重复写盘。
  const mirrorSyncTimerRef = useRef<number | null>(null);
  const mirrorReadyRef = useRef(false);
  const hasAppliedPersistedLibraryRef = useRef(false);
  const syncScoreMirrorSilentlyRef = useRef<() => Promise<void>>(async () => {});
  // 正在进行的同步任务。防抖 + 手动触发仍可能让两个同步重叠，
  // 互斥保证同一时刻只有一个任务在写盘，排队的那次会在结束后补跑。
  const mirrorSyncInFlightRef = useRef<Promise<void> | null>(null);
  const mirrorSyncPendingRef = useRef(false);

  const scheduleMirrorSync = useCallback(() => {
    if (!mirrorReadyRef.current) {
      return;
    }

    if (mirrorSyncTimerRef.current !== null) {
      window.clearTimeout(mirrorSyncTimerRef.current);
    }

    mirrorSyncTimerRef.current = window.setTimeout(() => {
      mirrorSyncTimerRef.current = null;
      void syncScoreMirrorSilentlyRef.current();
    }, 500);
  }, []);

  useEffect(() => {
    scheduleMirrorSync();
  }, [playlists, likedSongs, localLibrarySongs, scheduleMirrorSync]);

  // 启动加载完成后做一次全量同步，之后再开启自动同步
  useEffect(() => {
    if (!hasAppliedPersistedLibraryRef.current) {
      return;
    }

    mirrorReadyRef.current = true;
    void (async () => {
      // 先迁移旧格式的镜像目录，再做全量同步。
      // 迁移只删除「能解析为合法曲谱 JSON 的 .txt 文件」，用户自建的文件保留。
      try {
        const migration = await migrateLegacyScoreMirror();

        if (migration.migrated) {
          appendLog(
            formatText(text.logs.archiveCompletedWithSkips, {
              details: `已迁移旧版镜像文件 ${migration.removedLegacyFiles} 个`,
              failed: String(migration.removedLegacyFiles),
            }),
          );
        }
      } catch (error) {
        // 迁移失败不影响后续同步。
        appendLog(
          formatText(text.logs.archiveFailed, {
            error: String(error instanceof Error ? error.message : error),
          }),
        );
      }

      await syncScoreMirrorSilentlyRef.current();
    })();
  }, [hasAppliedPersistedLibraryRef.current]);

  useEffect(() => {
    selectedSongIdRef.current = selectedSongId;
  }, [selectedSongId]);

  useEffect(() => {
    playbackSongIdRef.current = playbackSongId;
  }, [playbackSongId]);

  function updateSelectedSongId(songId: LibrarySongId | null) {
    selectedSongIdRef.current = songId;
    setSelectedSongId(songId);
  }

  function updatePlaybackSongId(songId: LibrarySongId | null) {
    playbackSongIdRef.current = songId;
    setPlaybackSongId(songId);
  }

  async function handleImportScoreFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const failedImports: ImportFailure[] = [];
    const importedSongsFromFiles: ParsedImportedSong[] = [];
    let successfulFileCount = 0;

    for (const file of files) {
      try {
        if (!isSupportedScoreFileName(file.name)) {
          throw new Error(text.score.unsupportedFile);
        }

        const content = await file.text();
        const songs = parseScoreFileContent(content);

        importedSongsFromFiles.push(
          ...songs.map((song) => ({
            fileName: file.name,
            song,
          })),
        );
        successfulFileCount += 1;
      } catch (error) {
        failedImports.push({
          error: formatImportError(error, text),
          fileName: file.name,
        });
      }
    }

    if (importedSongsFromFiles.length > 0) {
      const storedImportResult = await storeUniqueImportedSongs({
        existingLibrarySongs: librarySongsRef.current,
        importedSongs: importedSongsFromFiles,
        saveImportedScoreSong: async (songId, song) => {
          await saveImportedScoreSongFile(songId, song);
          importedScoreSongLoaderRef.current.seed(songId, song);
        },
      });
      const { skippedDuplicateSongs, storedLibrarySongs } = storedImportResult;

      failedImports.push(...storedImportResult.failedImports);

      skippedDuplicateSongs.forEach((song) => {
        appendLog(
          formatText(text.logs.duplicateImportSkipped, {
            songName: song.name,
          }),
        );
      });

      if (skippedDuplicateSongs.length > 0) {
        const skippedMessage =
          skippedDuplicateSongs.length === 1
            ? formatText(text.logs.duplicateImportSkipped, {
                songName: skippedDuplicateSongs[0]?.name ?? "",
              })
            : formatText(text.logs.duplicateImportSkippedSummary, {
                count: skippedDuplicateSongs.length,
              });

        showNotice?.(skippedMessage);
      }

      if (storedLibrarySongs.length === 0) {
        if (failedImports.length === 0) {
          setImportError("");
        }
      } else {
        const firstImportedLibrarySong = storedLibrarySongs[0];

        setLocalLibrarySongs((currentSongs) => {
          const nextSongs = [...currentSongs, ...storedLibrarySongs];

          localLibrarySongsRef.current = nextSongs;
          return nextSongs;
        });

        if (firstImportedLibrarySong) {
          updateSelectedSongId(firstImportedLibrarySong.id);
          setSelectedLibraryCategory("local-imports");
          setSearchQuery("");
          requestLocateSong(firstImportedLibrarySong.id);
        }

        setImportError("");
        appendLog(
          formatText(text.logs.importedScoresFromFiles, {
            count: storedLibrarySongs.length,
            fileCount: successfulFileCount,
          }),
        );
      }
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

  async function handleSaveRecordedSong(
    song: Song,
  ): Promise<LocalLibrarySong> {
    onBeforeLibraryMutation();

    const librarySong = await persistRecordedSong({
      saveImportedScoreSong: saveImportedScoreSongFile,
      song,
    });

    importedScoreSongLoaderRef.current.seed(librarySong.id, song);
    applyCreatedScoreToLibrary(librarySong);

    return librarySong;
  }

  async function handleExportLocalSong(songId: LibrarySongId) {
    const librarySong = localLibrarySongsRef.current.find(
      (candidate) => candidate.id === songId,
    );

    if (!librarySong || exportingLocalSongIdsRef.current.has(songId)) {
      return;
    }

    exportingLocalSongIdsRef.current.add(songId);
    setExportingLocalSongIds(new Set(exportingLocalSongIdsRef.current));

    try {
      const exportedFile = await exportImportedScoreSong(songId);
      const successMessage = formatText(text.logs.localScoreExported, {
        fileName: exportedFile.fileName,
      });
      appendLog(successMessage);
      showNotice?.(successMessage);

      try {
        await openExportedScoresDirectory();
      } catch (error) {
        const warningMessage = formatText(
          text.logs.exportedScoreFolderOpenFailed,
          {
            error: formatUpgradeError(error),
            path: exportedFile.path,
          },
        );
        appendLog(warningMessage);
        showNotice?.(warningMessage);
      }
    } catch (error) {
      const failureMessage = formatText(text.logs.localScoreExportFailed, {
        error: formatUpgradeError(error),
        songName: librarySong.metadata.name,
      });
      appendLog(failureMessage);
      showNotice?.(failureMessage);
    } finally {
      exportingLocalSongIdsRef.current.delete(songId);
      setExportingLocalSongIds(new Set(exportingLocalSongIdsRef.current));
    }
  }

  function isLocalSongExporting(songId: LibrarySongId) {
    return exportingLocalSongIds.has(songId);
  }

  async function handleRevealLocalSongFile(songId: LibrarySongId) {
    const librarySong = localLibrarySongsRef.current.find(
      (candidate) => candidate.id === songId,
    );

    if (!librarySong) {
      return;
    }

    try {
      await revealImportedScoreFile(songId);
    } catch (error) {
      const message = formatText(text.logs.revealLocalScoreFileFailed, {
        error: String(error instanceof Error ? error.message : error),
        songName: librarySong.metadata.name,
      });
      appendLog(message);
      showNotice?.(message);
    }
  }

  // 读取任意一首曲谱的完整内容：内置曲谱走内置加载器，本地曲谱走本地文件。
  async function loadSongContentForArchive(
    librarySong: LibrarySong,
  ): Promise<Song | null> {
    if (librarySong.source === "built-in") {
      return loadBuiltInScoreById(librarySong.id);
    }

    const cached =
      importedScoreSongLoaderRef.current.getCachedSong(librarySong.id);
    if (cached) {
      return cached;
    }

    try {
      return await readImportedScoreSong(librarySong.id);
    } catch {
      return null;
    }
  }

  // 把当前曲库/歌单**镜像**到本地文件夹：
  // 本地导入、已转换、我喜欢各一个文件夹；每个歌单一个文件夹（空歌单也建）。
  // 歌单内的乐谱无论来源（内置或本地）都会重新落一份独立文件。
  //
  // 目录名规则见 lib/mirrorFolderNames：歌单目录带 ID 派生后缀，
  // 保证同名歌单不会共用目录，也不会与固定分类目录冲突。
  //
  // silent = true 时为自动同步：不弹提示、不打开目录、失败只记日志。
  // silent = false 时为手动触发：给出明确反馈。
  async function syncScoreMirror({ silent }: { silent: boolean }) {
    // 并发控制：同一时刻只允许一个同步任务在跑。
    // 连续两次同步（防抖后 + 手动触发）可能重叠，后到的那个必须等前一个结束，
    // 否则两个任务会互相覆盖磁盘内容。
    if (mirrorSyncInFlightRef.current) {
      mirrorSyncPendingRef.current = true;
      await mirrorSyncInFlightRef.current;
    }

    const runSync = async () => {
      const entries: ArchiveScoreEntry[] = [];
      const skipped: string[] = [];
      const emptyFolders: string[] = [];
      // 同一文件夹内按曲谱 id 去重（不同歌单之间允许重复）
      const seenKeys = new Set<string>();
      // 本轮读取失败的曲谱：它们对应的旧镜像文件要保留，
      // 否则一次临时读取故障就会让磁盘镜像与曲库状态不一致。
      const preserveSongIds = new Set<string>();

      const pushEntry = async (folder: string, librarySong: LibrarySong) => {
        const dedupeKey = `${folder}\u0001${librarySong.id}`;

        if (seenKeys.has(dedupeKey)) {
          return;
        }
        seenKeys.add(dedupeKey);

        const song = await loadSongContentForArchive(librarySong);

        if (song === null) {
          skipped.push(`${folder}/${getLibrarySongName(librarySong)}`);
          preserveSongIds.add(librarySong.id);
          return;
        }

        entries.push({
          folder,
          song,
          songId: librarySong.id,
          title: getLibrarySongName(librarySong),
        });
      };

      // 1) 本地导入 + 已转换（歌单私有副本不单列，只出现在所属歌单里）
      for (const librarySong of localLibrarySongsRef.current) {
        if (librarySong.libraryGroup === "playlist-copy") {
          continue;
        }

        const folder = getMirrorFolderNameForCategory(
          librarySong.libraryGroup === "converted" ? "已转换" : "本地导入",
        );
        await pushEntry(folder, librarySong);
      }

      // 2) 我喜欢
      const likedSongs = likedSongsRef.current;
      for (const likedEntry of likedSongs) {
        const librarySong = librarySongsRef.current.find(
          (candidate) => candidate.id === likedEntry.songId,
        );

        if (librarySong) {
          await pushEntry(getMirrorFolderNameForCategory("我喜欢"), librarySong);
        }
      }

      // 3) 每个歌单一个文件夹（含来自内置曲谱的条目；空歌单也建文件夹）
      //    目录名默认就是歌单名；只有同名歌单（或与固定分类重名）才加 ID 后缀，
      //    因此目录名保持可读，同时绝不共用。
      const folderAssignments = assignMirrorFolderNames(
        playlistsRef.current.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
        })),
      );

      for (const playlist of playlistsRef.current) {
        const folder =
          folderAssignments.get(playlist.id) ??
          getMirrorFolderNameForCategory(playlist.name);

        if (playlist.songIds.length === 0) {
          emptyFolders.push(folder);
          continue;
        }

        for (const songId of playlist.songIds) {
          const librarySong = librarySongsRef.current.find(
            (candidate) => candidate.id === songId,
          );

          if (librarySong) {
            await pushEntry(folder, librarySong);
          }
        }
      }

      // 分类文件夹保证存在（即使没有内容）
      if (likedSongs.length === 0) {
        emptyFolders.push(getMirrorFolderNameForCategory("我喜欢"));
      }

      try {
        const report = await syncScoreMirrorToDisk(
          entries,
          emptyFolders,
          Array.from(preserveSongIds),
        );

        if (!silent) {
          const baseMessage = formatText(text.logs.archiveCompleted, {
            count: String(report.writtenFiles.length),
            path: report.rootPath,
          });
          appendLog(baseMessage);
          showNotice?.(baseMessage);

          const problemList = [...report.failures, ...skipped];
          if (problemList.length > 0) {
            const partialMessage = formatText(
              text.logs.archiveCompletedWithSkips,
              {
                details: problemList.slice(0, 10).join("; "),
                failed: String(problemList.length),
              },
            );
            appendLog(partialMessage);
            showNotice?.(partialMessage);
          }

          try {
            await openScoreArchiveDirectory();
          } catch {
            // 打不开目录不影响同步结果。
          }
        } else if (report.failures.length > 0) {
          // 静默模式下失败只写日志，不打扰用户
          appendLog(
            formatText(text.logs.archiveCompletedWithSkips, {
              details: report.failures.slice(0, 5).join("; "),
              failed: String(report.failures.length),
            }),
          );
        }
      } catch (error) {
        const message = formatText(text.logs.archiveFailed, {
          error: String(error instanceof Error ? error.message : error),
        });
        appendLog(message);
        if (!silent) {
          showNotice?.(message);
        }
      }
    };

    const task = runSync().finally(() => {
      mirrorSyncInFlightRef.current = null;
    });

    mirrorSyncInFlightRef.current = task;
    await task;

    // 同步期间又有新的变更排队了：再跑一次，把最新状态同步下去。
    if (mirrorSyncPendingRef.current) {
      mirrorSyncPendingRef.current = false;
      await syncScoreMirror({ silent });
    }
  }

  // 手动触发（界面按钮）
  async function handleArchiveLibraryToFolders() {
    await syncScoreMirror({ silent: false });
  }

  // 让 effect 能调用到最新的静默同步函数（避免闭包捕获旧状态）
  syncScoreMirrorSilentlyRef.current = async () => {
    await syncScoreMirror({ silent: true });
  };

  // 把整个歌单导出到以歌单命名的子文件夹（导出的根目录下）。
  async function handleExportPlaylistToFolder(playlistId: string) {
    const playlist = playlistsRef.current.find(
      (candidate) => candidate.id === playlistId,
    );

    if (!playlist || playlist.songIds.length === 0) {
      return;
    }

    // 导出整个歌单：内置曲谱同样会落一份独立乐谱文件。
    const entries: ArchiveScoreEntry[] = [];
    for (const songId of playlist.songIds) {
      const librarySong = librarySongsRef.current.find(
        (candidate) => candidate.id === songId,
      );

      if (!librarySong) {
        continue;
      }

      const song = await loadSongContentForArchive(librarySong);
      if (song === null) {
        continue;
      }

      entries.push({
        folder: playlist.name,
        song,
        songId: librarySong.id,
        title: getLibrarySongName(librarySong),
      });
    }

    if (entries.length === 0) {
      const message = formatText(text.logs.localScoreExportFailed, {
        error: text.logs.archiveNothingToWrite,
        songName: playlist.name,
      });
      appendLog(message);
      showNotice?.(message);
      return;
    }

    try {
      // 导出写入「导出区」（exported-scores），不是自动镜像区（曲谱分类）。
      // 导出区由用户管理，同步不会清理它；镜像区则每次同步都会重建。
      const report = await exportScoresIntoExportedFolder(
        playlist.name,
        entries,
      );

      if (report.failures.length > 0) {
        const message = formatText(text.logs.playlistExportedPartial, {
          count: String(report.writtenFiles.length),
          details: report.failures.join("; "),
          failed: String(report.failures.length),
          folderName: playlist.name,
        });
        appendLog(message);
        showNotice?.(message);
      } else {
        const message = formatText(text.logs.playlistExportedToFolder, {
          count: String(report.writtenFiles.length),
          folderName: playlist.name,
        });
        appendLog(message);
        showNotice?.(message);
      }

      try {
        await openExportedScoresDirectory();
      } catch {
        // 打不开文件夹不影响导出结果，静默忽略。
      }
    } catch (error) {
      const message = formatText(text.logs.localScoreExportFailed, {
        error: String(error instanceof Error ? error.message : error),
        songName: playlist.name,
      });
      appendLog(message);
      showNotice?.(message);
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    selectSongByIndex(songIndex);

    if (songIndex !== null) {
      void preloadSong(songIndex);
    }
  }

  function selectSongByIndex(songIndex: number | null) {
    if (songIndex === null) {
      updateSelectedSongId(null);
      return;
    }

    const nextSelectedSongId = librarySongsRef.current[songIndex]?.id ?? null;

    updateSelectedSongId(nextSelectedSongId);
  }

  function setSelectedSongIndex(songIndex: number | null) {
    selectSongByIndex(songIndex);
  }
  function setPlaybackSongIndex(songIndex: number | null) {
  if (songIndex === null) {
    updatePlaybackSongId(null);
    return;
  }

  const nextPlaybackSongId = librarySongsRef.current[songIndex]?.id ?? null;

  updatePlaybackSongId(nextPlaybackSongId);
  }
  function handleLibraryCategoryChange(category: LibraryCategoryId) {
    startTransition(() => {
      setSelectedLibraryCategory(category);
      setBuiltInPage(1);

      if (category === "playlists" && selectedPlaylistId === null) {
        setSelectedPlaylistId(playlists[0]?.id ?? null);
      }
    });
  }

  function handleSearchQueryChange(query: string) {
    setSearchQuery(query);
    setBuiltInPage(1);
  }

  function requestLocateSong(songId: LibrarySongId) {
    setLocateScoreRequest((currentRequest) => ({
      requestId: (currentRequest?.requestId ?? 0) + 1,
      songId,
    }));
  }

  function handleLocateSelectedSong() {
    if (selectedSongId === null) {
      return;
    }

    const selectedLibrarySong = librarySongsRef.current.find(
      (librarySong) => librarySong.id === selectedSongId,
    );

    if (!selectedLibrarySong) {
      return;
    }

    setSearchQuery("");

    if (selectedLibrarySong.source === "built-in") {
      const builtInItems = librarySorting.sortForScope(
        allLibraryItems.filter(item => item.librarySong.source === "built-in"), "built-in",
      );

      setSelectedLibraryCategory("built-in");
      setBuiltInPage(getLibrarySongPage(builtInItems, selectedLibrarySong.id, BUILT_IN_PAGE_SIZE));
    } else {
      setSelectedLibraryCategory(getLibrarySongCategory(selectedLibrarySong));
    }

    requestLocateSong(selectedLibrarySong.id);
  }

  function handleMoveLocalSong(songId: LibrarySongId, group: LocalLibraryGroup) {
    const nextSongs = moveLocalLibrarySong(localLibrarySongsRef.current, songId, group);
    if (nextSongs === localLibrarySongsRef.current) return;
    librarySorting.moveSongToCategory(songId, group === "converted" ? "converted" : "local-imports");
    localLibrarySongsRef.current = nextSongs;
    const byId = new Map(nextSongs.map(song => [song.id, song]));
    librarySongsRef.current = librarySongsRef.current.map(song => byId.get(song.id) ?? song);
    setLocalLibrarySongs(nextSongs);
  }

  // 批量移动分类（多选工具栏）。
  // moveLocalLibrarySong 会拒绝非法移动（私有副本、非 V2 去已转换），
  // 所以这里只收集真正发生变化的曲谱，排序层同步整批更新一次。
  function handleMoveLocalSongs(songIds: LibrarySongId[], group: LocalLibraryGroup) {
    const idSet = new Set(songIds);
    if (idSet.size === 0) return;

    let changed = false;
    const nextSongs = localLibrarySongsRef.current.map(song => {
      if (!idSet.has(song.id)) return song;
      const moved = moveLocalLibrarySong([song], song.id, group);
      if (moved[0] !== song) changed = true;
      return moved[0] ?? song;
    });

    if (!changed) return;

    const destination = group === "converted" ? "converted" : "local-imports";
    librarySorting.moveSongsToCategory([...idSet], destination);
    localLibrarySongsRef.current = nextSongs;
    const byId = new Map(nextSongs.map(song => [song.id, song]));
    librarySongsRef.current = librarySongsRef.current.map(song => byId.get(song.id) ?? song);
    setLocalLibrarySongs(nextSongs);
  }

  function handleToggleLikedSong(songIndex: number) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      return;
    }

    setLikedSongs((currentLikedSongs) =>
      toggleLikedSong(currentLikedSongs, librarySong.id),
    );
  }

  function handleRemoveFromLiked(songId: LibrarySongId) {
    setLikedSongs((currentLikedSongs) =>
      currentLikedSongs.filter((entry) => entry.songId !== songId),
    );
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

  function handleRenamePlaylist(playlistId: string, nextName: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    const trimmedName = nextName.trim() || playlist.name;

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((currentPlaylist) =>
        currentPlaylist.id === playlistId
          ? {
              ...currentPlaylist,
              name: trimmedName,
              updatedAt: Date.now(),
            }
          : currentPlaylist,
      ),
    );

    // 歌单改名后，镜像目录名会随之变化（标题 + ID 后缀）。
    // 旧目录由下一次自动同步按清单清理、新目录由同步写入，
    // 因此这里不再手工改名目录，避免与清单记录打架。
    if (trimmedName !== playlist.name) {
      scheduleMirrorSync();
    }
  }

  function handleDeletePlaylist(playlistId: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    // 删歌单时，歌单内私有副本若不再被其它歌单引用，一并清理。
    cleanupPlaylistCopies(
      playlist.songIds,
      playlists.filter((currentPlaylist) => currentPlaylist.id !== playlistId),
    );

    // 删歌单时，同时删掉它对应的文件夹（含其中的乐谱）：
    // ① exported-scores\<歌单名>   —— 手动导出区，只删精确匹配的那个目录
    // ② 曲谱分类\<镜像目录名>       —— 自动镜像区，只删清单登记的文件
    //
    // 镜像目录名必须与「同步时算出来的」一致，否则会删错目录。
    // 因此这里用删除前的完整歌单集合做分配（同步也是基于完整集合分配）。
    void (async () => {
      const folderAssignments = assignMirrorFolderNames(
        playlistsRef.current.map((currentPlaylist) => ({
          id: currentPlaylist.id,
          name: currentPlaylist.name,
        })),
      );
      const mirrorFolderName =
        folderAssignments.get(playlist.id) ??
        getMirrorFolderNameForCategory(playlist.name);

      // 分类文件夹名不能被歌单占用：歌单若叫「本地导入」，绝不删该分类目录。
      if (
        RESERVED_ARCHIVE_FOLDER_NAMES.has(playlist.name.trim()) ||
        isReservedMirrorFolderName(mirrorFolderName)
      ) {
        const message = formatText(
          text.logs.playlistExportFolderSkippedReserved,
          { folderName: playlist.name },
        );
        appendLog(message);
        showNotice?.(message);
        return;
      }

      try {
        const removedExportFolder = await deletePlaylistExportFolder(
          playlist.name,
        );
        const removedArchiveFolder = await deleteArchiveFolder(mirrorFolderName);

        if (removedExportFolder || removedArchiveFolder) {
          const message = formatText(text.logs.playlistExportFolderRemoved, {
            folderName: playlist.name,
          });
          appendLog(message);
          showNotice?.(message);
        }
      } catch (error) {
        const message = formatText(text.logs.playlistExportFolderRemoveFailed, {
          error: String(error instanceof Error ? error.message : error),
          folderName: playlist.name,
        });
        appendLog(message);
        showNotice?.(message);
      }
    })();

    setPlaylists((currentPlaylists) => {
      const deletedPlaylistIndex = currentPlaylists.findIndex(
        (currentPlaylist) => currentPlaylist.id === playlistId,
      );
      const nextPlaylists = currentPlaylists.filter(
        (currentPlaylist) => currentPlaylist.id !== playlistId,
      );

      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(
          nextPlaylists[Math.min(deletedPlaylistIndex, nextPlaylists.length - 1)]
            ?.id ?? null,
        );
      }

      return nextPlaylists;
    });
  }

  // 加入歌单即与源曲解耦：为本地导入曲谱复制一份独立的歌单私有副本
  // （新 id + 独立曲谱文件）。删除原曲只影响原 id，歌单副本不受牵连。
  async function createPlaylistCopyForRound(
    librarySong: LibrarySong,
  ): Promise<LibrarySongId> {
    if (librarySong.source !== "local-import") {
      return librarySong.id;
    }
    // 已就是歌单私有副本，直接复用，避免副本套娃。
    if (librarySong.libraryGroup === "playlist-copy") {
      return librarySong.id;
    }

    const copyRecord = createPlaylistCopyRecord(librarySong);
    const sourceSong =
      importedScoreSongLoaderRef.current.getCachedSong(librarySong.id) ??
      (await readImportedScoreSong(librarySong.id));

    await saveImportedScoreSongFile(copyRecord.id, sourceSong);
    importedScoreSongLoaderRef.current.seed(copyRecord.id, sourceSong);

    localLibrarySongsRef.current = [
      ...localLibrarySongsRef.current,
      copyRecord,
    ];
    librarySongsRef.current = [
      ...librarySongsRef.current,
      copyRecord,
    ];
    setLocalLibrarySongs(localLibrarySongsRef.current);

    return copyRecord.id;
  }

  /**
   * 删除一个「已经落盘、但没有任何歌单引用」的私有副本。
   *
   * 用于异步复制完成后发现目标歌单已被删除的场景：
   * 文件与曲库记录必须一起清掉，否则会留下无法通过曲库管理的孤儿文件。
   */
  async function removePlaylistCopyWithoutReference(songId: LibrarySongId) {
    try {
      await deleteImportedScoreFile(songId);
    } catch (error) {
      // 文件删不掉时保留曲库记录，用户可以在界面上再次删除它。
      const message = formatText(text.logs.localScoreDeleteFailed, {
        error: String(error instanceof Error ? error.message : error),
        songName: songId,
      });
      appendLog(message);
      showNotice?.(message);
      return;
    }

    localLibrarySongsRef.current = localLibrarySongsRef.current.filter(
      (candidate) => candidate.id !== songId,
    );
    librarySongsRef.current = librarySongsRef.current.filter(
      (candidate) => candidate.id !== songId,
    );
    setLocalLibrarySongs(localLibrarySongsRef.current);
    importedScoreSongLoaderRef.current.invalidate(songId);
  }

  function handleAddSongToPlaylist(
    playlistId: string,
    songIndex: number,
  ): AddSongToPlaylistResult {
    const librarySong = librarySongsRef.current[songIndex];
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!librarySong || !playlist) {
      return { status: "missing" };
    }

    // 重复检测必须按「原曲身份」比较：歌单里保存的是副本 ID，
    // 直接比较副本 ID 会把同一首原曲的第二次加入当成新曲谱放行。
    const sourceSongId = getSourceSongId(librarySong);
    const alreadyInPlaylist = playlist.songIds.some((songId) => {
      const candidate = librarySongsRef.current.find(
        (librarySongCandidate) => librarySongCandidate.id === songId,
      );

      return candidate
        ? getSourceSongId(candidate) === sourceSongId
        : songId === sourceSongId;
    });

    if (alreadyInPlaylist) {
      const message = formatText(text.logs.playlistSongAlreadyExists, {
        songName: getLibrarySongName(librarySong),
      });

      appendLog(message);
      showNotice?.(message);
      return { message, status: "duplicate" };
    }

    // 加入歌单即与源曲解耦：后台复制独立副本，再挂到歌单。
    void (async () => {
      let targetSongId = librarySong.id;
      try {
        targetSongId = await createPlaylistCopyForRound(librarySong);
      } catch (error) {
        const message = formatText(text.logs.playlistCopyFailed, {
          error: String(error instanceof Error ? error.message : error),
          songName: getLibrarySongName(librarySong),
        });
        appendLog(message);
        showNotice?.(message);
        return;
      }

      // 复制是异步的：这期间目标歌单可能已被删除。
      // 此时副本文件已落盘却没有引用，会变成无主文件，必须回滚删除。
      const targetPlaylist = playlistsRef.current.find(
        (currentPlaylist) => currentPlaylist.id === playlistId,
      );

      if (!targetPlaylist) {
        await removePlaylistCopyWithoutReference(targetSongId);
        return;
      }

      setPlaylists((currentPlaylists) =>
        currentPlaylists.map((currentPlaylist) =>
          currentPlaylist.id === playlistId
            ? addSongToPlaylist(currentPlaylist, targetSongId)
            : currentPlaylist,
        ),
      );
    })();

    return { status: "added" };
  }

  function handleCreatePlaylistWithSong(
    songIndex: number,
    playlistName: string = text.library.defaultPlaylistName,
  ) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      return;
    }

    const trimmedName =
      playlistName.trim() || text.library.defaultPlaylistName;

    void (async () => {
      let targetSongId = librarySong.id;
      try {
        targetSongId = await createPlaylistCopyForRound(librarySong);
      } catch (error) {
        const message = formatText(text.logs.playlistCopyFailed, {
          error: String(error instanceof Error ? error.message : error),
          songName: getLibrarySongName(librarySong),
        });
        appendLog(message);
        showNotice?.(message);
        return;
      }

      const playlist = addSongToPlaylist(createPlaylist(trimmedName), targetSongId);

      setPlaylists((currentPlaylists) => [...currentPlaylists, playlist]);
      setSelectedPlaylistId(playlist.id);
      setSelectedLibraryCategory("playlists");
    })();
  }

  function handleRemoveSongFromPlaylist(
    playlistId: string,
    songId: LibrarySongId,
  ) {
    const remainingPlaylists = playlistsRef.current.map((playlist) =>
      playlist.id === playlistId
        ? removeSongFromPlaylist(playlist, songId)
        : playlist,
    );

    cleanupPlaylistCopies([songId], remainingPlaylists);

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((playlist) =>
        playlist.id === playlistId
          ? removeSongFromPlaylist(playlist, songId)
          : playlist,
      ),
    );
  }

  // 移除/删除歌单后，把不再被任何歌单引用的歌单私有副本清理掉（文件 + 记录）。
  function cleanupPlaylistCopies(
    candidateSongIds: LibrarySongId[],
    remainingPlaylists: UserPlaylist[] = playlistsRef.current,
  ) {
    const stillReferenced = new Set(
      remainingPlaylists.flatMap((playlist) => playlist.songIds),
    );

    // 被「我喜欢」收藏的私有副本同样要保留：删掉文件会让收藏变成无效引用。
    const stillLiked = new Set(
      likedSongsRef.current.map((entry) => entry.songId),
    );

    const removableIds = candidateSongIds.filter((songId) => {
      if (stillReferenced.has(songId)) {
        return false;
      }
      if (stillLiked.has(songId)) {
        return false;
      }
      const librarySong = localLibrarySongsRef.current.find(
        (candidate) => candidate.id === songId,
      );

      return librarySong?.libraryGroup === "playlist-copy";
    });

    if (removableIds.length === 0) {
      return;
    }

    // 先删文件，成功后再移除曲库记录。
    // 反过来做（先删记录）会在删除失败时留下无法通过曲库管理的孤儿文件。
    void (async () => {
      const deletedIds = new Set<LibrarySongId>();

      for (const songId of removableIds) {
        try {
          await deleteImportedScoreFile(songId);
          deletedIds.add(songId);
        } catch (error) {
          // 删除失败：保留曲库记录，用户可再次尝试删除，避免产生孤儿文件。
          const message = formatText(text.logs.localScoreDeleteFailed, {
            error: String(error instanceof Error ? error.message : error),
            songName: songId,
          });
          appendLog(message);
          showNotice?.(message);
        }
      }

      if (deletedIds.size === 0) {
        return;
      }

      localLibrarySongsRef.current = localLibrarySongsRef.current.filter(
        (candidate) => !deletedIds.has(candidate.id),
      );
      librarySongsRef.current = librarySongsRef.current.filter(
        (candidate) => !deletedIds.has(candidate.id),
      );
      setLocalLibrarySongs(localLibrarySongsRef.current);

      deletedIds.forEach((songId) => {
        importedScoreSongLoaderRef.current.invalidate(songId);
      });
    })();
  }

  async function handleDeleteLocalSong(
    songIndex: number,
    onDeleted?: (deletedSongIndex: number, deletedSongId: LibrarySongId) => void,
    options: DeleteLocalSongOptions = {},
  ): Promise<boolean> {
    return deleteLocalSongWithScoreFile({
      appendLog,
      deleteScoreFile: async (songId) => {
        const deleteResult = await deleteImportedScoreFile(songId);

        importedScoreSongLoaderRef.current.invalidate(songId);
        clearLocalSongLoading(songId);

        return deleteResult;
      },
      formatDeleteFailure: (songName, error) =>
        formatText(text.logs.localScoreDeleteFailed, {
          error: String(error instanceof Error ? error.message : error),
          songName,
        }),
      librarySongs: librarySongsRef.current,
      onBeforeLibraryMutation,
      onDeleted,
      onSuccessfulDelete: (librarySong) => {
        const nextFallbackSongs = {
          ...migrationFallbackSongsRef.current,
        };

        delete nextFallbackSongs[librarySong.id];
        migrationFallbackSongsRef.current = nextFallbackSongs;
        setMigrationFallbackSongs(nextFallbackSongs);

        // 连续删除时不能用闭包里的旧快照：第二次删除会把第一次的结果覆盖回去。
        // 这里统一用函数式更新，基于当前 state 逐次累积删除效果。
        setLikedSongs((currentLikedSongs) =>
          currentLikedSongs.filter(
            (entry) => entry.songId !== librarySong.id,
          ),
        );
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((playlist) =>
            removeSongFromPlaylist(playlist, librarySong.id),
          ),
        );
        setLocalLibrarySongs((currentSongs) => {
          const nextSongs = currentSongs.filter(
            (currentSong) => currentSong.id !== librarySong.id,
          );

          localLibrarySongsRef.current = nextSongs;
          return nextSongs;
        });
        if (selectedSongIdRef.current === librarySong.id) {
          updateSelectedSongId(null);
        }
        if (playbackSongIdRef.current === librarySong.id) {
          updatePlaybackSongId(null);
        }
      },
      showNotice,
      songIndex,
      stopPlaybackBeforeDelete: options.stopPlaybackBeforeDelete,
    });
  }



  async function handleAddSongsToPlaylist(
    playlistId: string,
    songIds: LibrarySongId[],
  ) {
    const ids = Array.from(new Set(songIds));
    if (ids.length === 0) {
      return;
    }

    // 批量加入同样走副本解耦：先把每首源曲复制成歌单私有副本，再挂到歌单。
    const targetSongIds: LibrarySongId[] = [];
    for (const songId of ids) {
      const librarySong = librarySongsRef.current.find(
        (candidate) => candidate.id === songId,
      );

      if (!librarySong) {
        continue;
      }

      try {
        targetSongIds.push(await createPlaylistCopyForRound(librarySong));
      } catch (error) {
        const message = formatText(text.logs.playlistCopyFailed, {
          error: String(error instanceof Error ? error.message : error),
          songName: getLibrarySongName(librarySong),
        });
        appendLog(message);
        showNotice?.(message);
      }
    }

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((currentPlaylist) => {
        if (currentPlaylist.id !== playlistId) {
          return currentPlaylist;
        }
        let next = currentPlaylist;
        for (const songId of targetSongIds) {
          if (!next.songIds.includes(songId)) {
            next = addSongToPlaylist(next, songId);
          }
        }
        return next;
      }),
    );
  }

  function handleRemoveSongsFromPlaylist(
    playlistId: string,
    songIds: LibrarySongId[],
  ) {
    const ids = Array.from(new Set(songIds));
    if (ids.length === 0) {
      return;
    }

    const remainingPlaylists = playlistsRef.current.map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }
      let next = playlist;
      for (const songId of ids) {
        next = removeSongFromPlaylist(next, songId);
      }
      return next;
    });

    cleanupPlaylistCopies(ids, remainingPlaylists);

    setPlaylists((currentPlaylists) =>
      currentPlaylists.map((currentPlaylist) => {
        if (currentPlaylist.id !== playlistId) {
          return currentPlaylist;
        }
        let next = currentPlaylist;
        for (const songId of ids) {
          next = removeSongFromPlaylist(next, songId);
        }
        return next;
      }),
    );
  }

  async function handleUpgradeSongToV2(
    sourceSongId: LibrarySongId,
    conversionOptions: V1ToV2ConversionOptions,
    executionOptions: UpgradeSongToV2ExecutionOptions = {},
  ): Promise<UpgradeSongToV2Result> {
    if (getIsScoreUpgradeInProgress()) {
      return reportUpgradeFailure(text.logs.scoreUpgradeAlreadyInProgress);
    }

    const sourceLibrarySong = librarySongsRef.current.find(
      (librarySong) => librarySong.id === sourceSongId,
    );

    if (!sourceLibrarySong) {
      return reportUpgradeFailure(
        formatText(text.logs.scoreUpgradeSourceLoadFailed, {
          songName: text.logs.queueUnknownSong,
        }),
      );
    }

    const knownFormatVersion =
      getLibrarySongFormatVersion(sourceLibrarySong);

    if (knownFormatVersion !== 1) {
      return reportUpgradeFailure(
        knownFormatVersion === 2
          ? text.logs.scoreUpgradeAlreadyV2
          : text.logs.scoreUpgradeUnknownFormat,
      );
    }

    const blockedMessage = executionOptions.getBlockedMessage?.() ?? null;

    if (blockedMessage !== null) {
      return reportUpgradeFailure(blockedMessage);
    }

    return runWithScoreUpgradeInProgress(
      isScoreUpgradeInProgressRef,
      async () => {
        const result = await createV2LocalLibraryCopy({
          conversionOptions,
          getExistingLibrarySongs: () => librarySongsRef.current,
          isMutationBlocked: () =>
            (executionOptions.getBlockedMessage?.() ?? null) !== null,
          loadSourceSong: () => {
            if (executionOptions.resolvedSourceSong) {
              return Promise.resolve(
                executionOptions.resolvedSourceSong,
              );
            }

            const currentSongIndex = librarySongsRef.current.findIndex(
              (librarySong) => librarySong.id === sourceSongId,
            );

            return currentSongIndex < 0
              ? Promise.resolve(null)
              : resolveLibrarySong(currentSongIndex, {
                  shouldLogFailure: false,
                });
          },
          loadExistingSong: async (songId) => {
            const currentSongIndex = librarySongsRef.current.findIndex(
              (librarySong) => librarySong.id === songId,
            );

            return currentSongIndex < 0
              ? null
              : resolveLibrarySong(currentSongIndex, {
                  shouldLogFailure: false,
                });
          },
          saveImportedScoreSong: saveImportedScoreSongFile,
          seedImportedScoreSong: (songId, song) => {
            importedScoreSongLoaderRef.current.seed(songId, song);
          },
          sourceSongId,
        });

        if (result.status === "duplicate") {
          const message = getV2UpgradeDuplicateNotice(
            result.existingLibrarySong,
            text.logs.scoreUpgradeDuplicate,
          );

          appendLog(message);
          showNotice?.(message);
          return { message, status: "duplicate" };
        }

        if (result.status === "failed") {
          if (result.reason === "blocked") {
            return reportUpgradeFailure(
              executionOptions.getBlockedMessage?.() ??
                text.logs.scoreUpgradeMutationBlocked,
            );
          }

          if (result.reason === "source-load") {
            return reportUpgradeFailure(
              formatText(text.logs.scoreUpgradeSourceLoadFailed, {
                songName: getLibrarySongName(sourceLibrarySong),
              }),
            );
          }

          if (result.reason === "storage") {
            return reportUpgradeFailure(
              formatText(text.logs.scoreUpgradeStorageFailed, {
                error: formatUpgradeError(result.error),
                songName: conversionOptions.name.trim(),
              }),
            );
          }

          return reportUpgradeFailure(
            getConversionFailureMessage(result.error, text),
          );
        }

        applyCreatedScoreToLibrary(result.librarySong);

        const message = formatText(text.logs.scoreUpgradeSucceeded, {
          songName: result.librarySong.metadata.name,
        });

        appendLog(message);
        showNotice?.(message);
        return { librarySong: result.librarySong, status: "created" };
      },
    );
  }

  function reportUpgradeSourceLoadFailure(
    sourceSongId: LibrarySongId,
  ) {
    const sourceLibrarySong = librarySongsRef.current.find(
      (librarySong) => librarySong.id === sourceSongId,
    );
    reportUpgradeFailure(
      formatText(text.logs.scoreUpgradeSourceLoadFailed, {
        songName: sourceLibrarySong
          ? getLibrarySongName(sourceLibrarySong)
          : text.logs.queueUnknownSong,
      }),
    );
  }

  function applyCreatedScoreToLibrary(librarySong: LocalLibrarySong) {
    const successState = getCreatedV2LibraryCopyState(
      localLibrarySongsRef.current,
      librarySong,
    );

    localLibrarySongsRef.current = successState.localLibrarySongs;
    librarySongsRef.current = [
      ...librarySongsRef.current.filter(
        (currentSong) => currentSong.source === "built-in",
      ),
      ...successState.localLibrarySongs,
    ];
    setLocalLibrarySongs(successState.localLibrarySongs);
    updateSelectedSongId(successState.selectedSongId);
    setSelectedLibraryCategory(successState.selectedCategory);
    setSearchQuery(successState.searchQuery);
    requestLocateSong(successState.locateSongId);
  }

  function getIsScoreUpgradeInProgress() {
    return readScoreUpgradeInProgress(isScoreUpgradeInProgressRef);
  }

  function reportUpgradeFailure(message: string): UpgradeSongToV2Result {
    appendLog(message);
    showNotice?.(message);
    return { message, status: "failed" };
  }

  function removeMissingLocalSongs(missingSongIds: LibrarySongId[]) {
    const cleanup = cleanupMissingImportedScores({
      likedSongs: likedSongsRef.current,
      localLibrarySongs: localLibrarySongsRef.current,
      migrationFallbackSongs: migrationFallbackSongsRef.current,
      missingSongIds,
      playbackSongId: playbackSongIdRef.current,
      playlists: playlistsRef.current,
      selectedSongId: selectedSongIdRef.current,
    });

    if (cleanup.removedSongIds.length === 0) {
      return cleanup;
    }

    const removedSongIds = new Set(cleanup.removedSongIds);
    const removedLibrarySongs = collectRemovedLibrarySongs(
      librarySongsRef.current,
      cleanup.removedSongIds,
    );

    cleanup.removedSongIds.forEach((songId) => {
      importedScoreSongLoaderRef.current.invalidate(songId);
      clearLocalSongLoading(songId);
    });
    localLibrarySongsRef.current = cleanup.localLibrarySongs;
    librarySongsRef.current = librarySongsRef.current.filter(
      (librarySong) => !removedSongIds.has(librarySong.id),
    );
    migrationFallbackSongsRef.current = cleanup.migrationFallbackSongs;
    likedSongsRef.current = cleanup.likedSongs;
    playlistsRef.current = cleanup.playlists;
    setLocalLibrarySongs(cleanup.localLibrarySongs);
    setMigrationFallbackSongs(cleanup.migrationFallbackSongs);
    setLikedSongs(cleanup.likedSongs);
    setPlaylists(cleanup.playlists);

    if (cleanup.selectedSongId !== selectedSongIdRef.current) {
      updateSelectedSongId(cleanup.selectedSongId);
    }

    const removedPlaybackSongId = playbackSongIdRef.current;
    if (cleanup.playbackSongId !== removedPlaybackSongId) {
      if (removedPlaybackSongId !== null) {
        onBeforeMissingPlaybackSongRemoval?.(removedPlaybackSongId);
      }
      updatePlaybackSongId(cleanup.playbackSongId);
    }

    onMissingLocalSongsRemoved?.(removedLibrarySongs);

    setLocateScoreRequest((currentRequest) =>
      currentRequest !== null && removedSongIds.has(currentRequest.songId)
        ? null
        : currentRequest,
    );

    return cleanup;
  }

  function applyScoreLibrary(library: PersistedAppData["library"]) {
    const nextLocalLibrarySongs = library.librarySongs;
    const nextLibrarySongs = [...builtInLibrarySongs, ...nextLocalLibrarySongs];
    const nextSelectedPlaylistId =
      library.selectedPlaylistId !== null &&
      library.playlists.some((playlist) => playlist.id === library.selectedPlaylistId)
        ? library.selectedPlaylistId
        : library.playlists[0]?.id ?? null;
    const nextSelectedSongId =
      library.selectedSongIndex !== null
        ? nextLocalLibrarySongs[library.selectedSongIndex]?.id ?? null
        : null;

    localLibrarySongsRef.current = nextLocalLibrarySongs;
    librarySongsRef.current = nextLibrarySongs;
    importedScoreSongLoaderRef.current.clear();
    const nextFallbackSongs = library.migrationFallbackSongs ?? {};

    migrationFallbackSongsRef.current = nextFallbackSongs;
    likedSongsRef.current = library.likedSongs;
    playlistsRef.current = library.playlists;
    selectedSongIdRef.current = nextSelectedSongId;
    clearAllLocalSongLoading();
    setLocalLibrarySongs(nextLocalLibrarySongs);
    setMigrationFallbackSongs(nextFallbackSongs);
    setLikedSongs(library.likedSongs);
    setPlaylists(library.playlists);
    librarySorting.applyPreferences(library.sorting, library.playlists);
    setSelectedPlaylistId(nextSelectedPlaylistId);
    setSelectedLibraryCategory(library.selectedLibraryCategory);
    setBuiltInPage(1);
    updateSelectedSongId(nextSelectedSongId);
    setImportError("");
    setSearchQuery("");
    // 启动加载完成，后续可以开始自动镜像同步
    hasAppliedPersistedLibraryRef.current = true;
  }

  function isBuiltInSongLoading(songId: LibrarySongId) {
    return loadingBuiltInSongIds.has(songId);
  }

  function isSongLoading(songId: LibrarySongId) {
    return loadingBuiltInSongIds.has(songId) || loadingLocalSongIds.has(songId);
  }

  function preloadSong(songIndex: number) {
    return resolveLibrarySong(songIndex, { shouldLogFailure: false });
  }

  function preloadBuiltInSong(songIndex: number) {
    return loadBuiltInSong(songIndex, { shouldLogFailure: false });
  }

  function resolveSongForPlayback(songIndex: number) {
    return resolveLibrarySong(songIndex, { shouldLogFailure: true });
  }

  function resolveSongForWarmPreparation(songIndex: number) {
    return resolveLibrarySong(songIndex, { shouldLogFailure: false });
  }

  function resolveLibrarySong(
    songIndex: number,
    { shouldLogFailure }: { shouldLogFailure: boolean },
  ) {
    const librarySong = librarySongsRef.current[songIndex];

    if (!librarySong) {
      if (shouldLogFailure) {
        appendLog(text.logs.noSelectedScore);
      }
      return Promise.resolve(null);
    }

    if (librarySong.source === "built-in") {
      return loadBuiltInSong(songIndex, { shouldLogFailure });
    }

    return loadLocalImportedSong(librarySong, { shouldLogFailure });
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

    if (librarySong.source !== "built-in") {
      return null;
    }

    if (librarySong.isBuiltInLoaded) {
      return librarySong.song;
    }

    const songId = librarySong.id;
    const { promise } = builtInSongLoadRef.current.getOrStart(
      songId,
      async () => {
        setBuiltInSongLoading(songId, true);

        try {
          const loadedSong = await loadBuiltInScoreById(songId);

          if (loadedSong === null) {
            return null;
          }

          setBuiltInLibrarySongs((currentBuiltInLibrarySongs) => {
            const nextBuiltInLibrarySongs = currentBuiltInLibrarySongs.map(
              (currentSong) =>
                currentSong.id === songId
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
            return nextBuiltInLibrarySongs;
          });

          return loadedSong;
        } finally {
          setBuiltInSongLoading(songId, false);
        }
      },
    );
    const loadedSong = await promise;

    if (loadedSong === null && shouldLogFailure) {
      appendLog(
        formatText(text.logs.builtInScoreLoadFailed, {
          songName: librarySong.song.name,
        }),
      );
    }

    return loadedSong;
  }

  async function loadLocalImportedSong(
    librarySong: LocalLibrarySong,
    { shouldLogFailure }: { shouldLogFailure: boolean },
  ) {
    const loadSong = () => loadLocalImportedSongForPlayback({
      appendLog,
      formatLoadFailure: (songName, failedSongId, error) =>
        formatText(text.logs.localScoreLoadFailed, {
          error: String(error instanceof Error ? error.message : error),
          songId: failedSongId,
          songName,
        }),
      formatRecoveryWarning: (songName, recoveredSongId, error) =>
        formatText(text.logs.localScoreRecoveryFallbackUsed, {
          error: String(error instanceof Error ? error.message : error),
          songId: recoveredSongId,
          songName,
        }),
      getMigrationFallbackSong: (currentSongId) =>
        migrationFallbackSongsRef.current[currentSongId] ?? null,
      isSongStillInLibrary: (currentSongId) =>
        librarySongsRef.current.some(
          (currentLibrarySong) =>
            currentLibrarySong.id === currentSongId &&
            currentLibrarySong.source === "local-import",
        ),
      librarySong,
      loadSongById: (currentSongId) =>
        importedScoreSongLoaderRef.current.load(
          currentSongId,
          async (loadingSongId) => {
            const finishLoading = beginLocalSongLoading(loadingSongId);

            try {
              const loadedSong = await readImportedScoreSong(loadingSongId);
              const validatedSong = validateLoadedLocalSong(
                librarySong,
                loadedSong,
              );

              setLocalLibrarySongs((currentSongs) => {
                const nextSongs = enrichLocalSongFormatVersion(
                  currentSongs,
                  loadingSongId,
                  validatedSong,
                );

                if (nextSongs === currentSongs) {
                  return currentSongs;
                }

                localLibrarySongsRef.current = nextSongs;
                librarySongsRef.current = [
                  ...librarySongsRef.current.filter(
                    (currentSong) => currentSong.source === "built-in",
                  ),
                  ...nextSongs,
                ];
                return nextSongs;
              });

              return validatedSong;
            } finally {
              finishLoading();
            }
          },
        ),
      onStaleLoad: (staleSongId) => {
        importedScoreSongLoaderRef.current.invalidate(staleSongId);
      },
      shouldLogFailure,
      showNotice,
    });

    if (!shouldLogFailure) {
      return loadSong();
    }

    return resolveImportedScoreAfterExistenceCheck({
      fileExists: () => importedScoreFileExists(librarySong.id),
      load: loadSong,
      onMissing: () => {
        const cleanup = removeMissingLocalSongs([librarySong.id]);

        if (!cleanup.removedSongIds.includes(librarySong.id)) {
          return false;
        }

        const message = formatText(text.logs.localScoreMissingRemoved, {
          songName: librarySong.metadata.name,
        });

        appendLog(message);
        showNotice?.(message);
        return true;
      },
    });
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

  function beginLocalSongLoading(songId: LibrarySongId) {
    localSongLoadCountsRef.current.set(
      songId,
      (localSongLoadCountsRef.current.get(songId) ?? 0) + 1,
    );
    setLocalSongLoading(songId, true);

    return () => {
      const nextCount = (localSongLoadCountsRef.current.get(songId) ?? 1) - 1;

      if (nextCount <= 0) {
        localSongLoadCountsRef.current.delete(songId);
        setLocalSongLoading(songId, false);
        return;
      }

      localSongLoadCountsRef.current.set(songId, nextCount);
    };
  }

  function clearLocalSongLoading(songId: LibrarySongId) {
    localSongLoadCountsRef.current.delete(songId);
    setLocalSongLoading(songId, false);
  }

  function clearAllLocalSongLoading() {
    localSongLoadCountsRef.current.clear();
    setLoadingLocalSongIds(new Set());
  }

  function setLocalSongLoading(songId: LibrarySongId, isLoading: boolean) {
    setLoadingLocalSongIds((currentLoadingIds) => {
      const nextLoadingIds = new Set(currentLoadingIds);

      if (isLoading) {
        nextLoadingIds.add(songId);
      } else {
        nextLoadingIds.delete(songId);
      }

      return nextLoadingIds;
    });
  }

  return {
    sortingControls,
    librarySortingPreferences: librarySorting.preferences,
    libraryOrderRevision: librarySorting.orderRevision,
    allLibraryItems,
    applyScoreLibrary,
    currentSelectedSong,
    handleAddSongToPlaylist,
    handleAddSongsToPlaylist,
    handleRemoveSongsFromPlaylist,
    handleCreatePlaylist,
    handleCreatePlaylistWithSong,
    handleDeleteLocalSong,
    handleDeletePlaylist,
    handleExportLocalSong,
    handleRevealLocalSongFile,
    handleExportPlaylistToFolder,
    handleArchiveLibraryToFolders,
    handleMoveLocalSong,
    handleMoveLocalSongs,
    handleImportScoreFiles,
    handleLibraryCategoryChange,
    handleLocateSelectedSong,
    handleRemoveFromLiked,
    handleRemoveSongFromPlaylist,
    handleRenamePlaylist,
    handleSaveRecordedSong,
    handleSelectImportedSong,
    handleToggleLikedSong,
    handleUpgradeSongToV2,
    reportUpgradeSourceLoadFailure,
    getIsScoreUpgradeInProgress,
    builtInPagination,
    hasSearchQuery,
    hasLoadedBuiltInSongs,
    importError,
    isBuiltInSongLoading,
    isLocalSongExporting,
    isSongLoading,
    librarySongs,
    librarySongsRef,
    playbackSongIdRef,
    likedSongs,
    localLibrarySongs,
    locateScoreRequest,
    pagedVisibleLibraryItems,
    persistedSelectedSongIndex,
    playlists,
    preloadBuiltInSong,
    preloadSong,
    resolveSongForPlayback,
    resolveSongForWarmPreparation,
    searchQuery,
    selectSongByIndex,
    selectedLibraryCategory,
    selectedPlaylist,
    selectedPlaylistId,
    selectedSongId,
    selectedSongIndex,
    setSearchQuery: handleSearchQueryChange,
    setSelectedPlaylistId,
    setSelectedSongId: updateSelectedSongId,
    setSelectedSongIndex,
    validCollectionSongIds,
    visibleLibraryItems,
    currentPlaybackLibrarySong,
    currentPlaybackSong,
    migrationFallbackSongs,
    playbackSongIndex,
    setPlaybackSongId: updatePlaybackSongId,
    setPlaybackSongIndex,
  };
}

function getConversionFailureMessage(error: unknown, text: UiText) {
  if (error instanceof V1ToV2ConversionError) {
    if (error.code === "already-v2") {
      return text.logs.scoreUpgradeAlreadyV2;
    }

    if (error.code === "empty-score" || error.code === "invalid-note-time") {
      return text.logs.scoreUpgradeEmptyScore;
    }

    if (error.code === "empty-name") {
      return text.library.upgradeToV2.validation.emptyName;
    }

    return text.logs.scoreUpgradeInvalidOptions;
  }

  return formatText(text.logs.scoreUpgradeFailed, {
    error: formatUpgradeError(error),
  });
}

function formatUpgradeError(error: unknown) {
  return String(error instanceof Error ? error.message : error ?? "unknown");
}
