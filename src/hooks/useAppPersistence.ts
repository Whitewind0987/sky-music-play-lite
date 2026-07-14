import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { UiText, LanguageCode } from "../i18n/uiText";
import {
  buildPersistedAppData,
  getPersistedAppDataVersion,
  sanitizePersistedAppData,
} from "../lib/appData";
import { formatText } from "../lib/formatText";
import {
  reconcilePersistedImportedScores,
  retainUnverifiedMigrationFallbackSongs,
} from "../lib/importedScoreReconciliation";
import { migrateImportedScoreStorageBeforeListing } from "../lib/importedScoreStorageMigration";
import {
  decideImportedScoreStorageTrust,
  recoverAndCleanupImportedScoreLibrary,
} from "../lib/importedScoreRecovery";
import {
  loadAppData,
  listImportedScoreFiles,
  migrateImportedScoreStorage,
  readImportedScoreSong,
  reconcileImportedScoreFiles,
  resolveImportedScoresDirectory,
  saveAppData,
  type AppLogEntry,
} from "../lib/tauriApi";
import type {
  ExperimentalInputPreferences,
  PersistedAppData,
} from "../types/appData";
import type {
  ExperimentalInputMode,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "../types/playbackOptions";
import type { PlaybackShortcuts } from "../types/playbackShortcuts";
import type {
  LikedSongEntry,
  LocalLibrarySong,
  MigrationFallbackSongs,
  UserPlaylist,
} from "../types/library";

const saveDebounceMs = 500;

type UseAppPersistenceOptions = {
  appendDetailedLog?: (entry: AppLogEntry) => void;
  appendLog: (entry: string) => void;
  applyConfirmBeforeExit: (confirmBeforeExit: boolean) => void;
  applyExperimentalInputPreferences: (
    preferences: PersistedAppData["experimentalInputPreferences"],
  ) => void;
  applyKeyMapping: (keyMapping: KeyMapping) => void;
  applyPlaybackSettings: (
    playbackSettings: PersistedAppData["playbackSettings"],
  ) => void;
  applyPlaybackShortcuts: (playbackShortcuts: PlaybackShortcuts) => void;
  applyScoreLibrary: (library: PersistedAppData["library"]) => void;
  canSaveAppData?: boolean;
  confirmBeforeExit: boolean;
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  language: LanguageCode;
  librarySongs: LocalLibrarySong[];
  likedSongs: LikedSongEntry[];
  migrationFallbackSongs: MigrationFallbackSongs;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackMode: PlaybackMode;
  playbackShortcuts: PlaybackShortcuts;
  playbackSpeed: PlaybackSpeed;
  playlists: UserPlaylist[];
  selectedLibraryCategory: LibraryCategoryId;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot: ExperimentalInputPreferences["selectedWindowSnapshot"];
  setLanguage: (language: LanguageCode) => void;
  showNotice?: (message: string) => void;
  targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
  targetWindowKeyHoldMs: number;
  targetWindowMessageMethod: TargetWindowMessageMethod;
  text: UiText["logs"];
  validCollectionSongIds?: string[];
};

export function useAppPersistence({
  appendDetailedLog,
  appendLog,
  applyConfirmBeforeExit,
  applyExperimentalInputPreferences,
  applyKeyMapping,
  applyPlaybackSettings,
  applyPlaybackShortcuts,
  applyScoreLibrary,
  canSaveAppData = true,
  confirmBeforeExit,
  experimentalInputEnabled,
  experimentalInputMode,
  isShuffleEnabled,
  keyMapping,
  language,
  librarySongs,
  likedSongs,
  migrationFallbackSongs,
  noteIntervalDelayMs,
  playbackMode,
  playbackShortcuts,
  playbackSpeed,
  playlists,
  selectedLibraryCategory,
  selectedPlaylistId,
  selectedSongIndex,
  selectedWindowHwnd,
  selectedWindowSnapshot,
  setLanguage,
  showNotice,
  targetWindowCompatibilityProfile,
  targetWindowKeyHoldMs,
  targetWindowMessageMethod,
  text,
  validCollectionSongIds,
}: UseAppPersistenceOptions) {
  const saveTimerRef = useRef<number | null>(null);
  const explicitlySavedAppDataSnapshotRef = useRef<string | null>(null);
  const currentImportedScoreStoragePathRef = useRef<string | null>(null);
  const importedScoreStoragePathRef = useRef<string | undefined>(undefined);
  const startupLibrarySongIdsRef = useRef<Set<string> | null>(null);
  const [hasLoadedAppData, setHasLoadedAppData] = useState(false);
  const [isNormalPersistenceEnabled, setIsNormalPersistenceEnabled] =
    useState(false);
  const [
    isImportedScoreReconciliationInProgress,
    setIsImportedScoreReconciliationInProgress,
  ] = useState(false);

  function buildCurrentPersistedAppData(
    nextConfirmBeforeExit = confirmBeforeExit,
  ) {
    const startupSongIds = startupLibrarySongIdsRef.current;
    if (
      currentImportedScoreStoragePathRef.current !== null &&
      startupSongIds !== null &&
      librarySongs.some(({ id }) => !startupSongIds.has(id))
    ) {
      importedScoreStoragePathRef.current =
        currentImportedScoreStoragePathRef.current;
    }

    return buildPersistedAppData({
      confirmBeforeExit: nextConfirmBeforeExit,
      experimentalInputPreferences: {
        experimentalInputEnabled,
        experimentalInputMode,
        selectedWindowHwnd,
        selectedWindowSnapshot,
        targetWindowCompatibilityProfile,
        targetWindowKeyHoldMs,
        targetWindowMessageMethod,
      },
      isShuffleEnabled,
      importedScoreStoragePath: importedScoreStoragePathRef.current,
      keyMapping,
      language,
      librarySongs,
      likedSongs,
      migrationFallbackSongs,
      noteIntervalDelayMs,
      playbackMode,
      playbackShortcuts,
      playbackSpeed,
      playlists,
      selectedLibraryCategory,
      selectedPlaylistId,
      selectedSongIndex,
      validCollectionSongIds,
    });
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadPersistedAppData() {
      try {
        const rawAppData = await loadAppData();

        if (isCancelled) {
          return;
        }

        const sourceVersion =
          rawAppData === null ? 3 : getPersistedAppDataVersion(rawAppData);
        const appData =
          rawAppData === null
            ? buildCurrentPersistedAppData()
            : sanitizePersistedAppData(rawAppData);

        if (appData === null || sourceVersion === null) {
          appendLog(text.appDataInvalid);
          setIsNormalPersistenceEnabled(false);
          setHasLoadedAppData(true);
          return;
        }

        let runtimeAppData = appData;
        let canEnableNormalPersistence = true;
        let shouldPersistStartup = rawAppData === null;
        let currentStoragePath: string;

        if (rawAppData === null) {
          appendLog(text.appDataMissing);
        }

        try {
          currentStoragePath = await resolveImportedScoresDirectory();
          currentImportedScoreStoragePathRef.current = currentStoragePath;
          importedScoreStoragePathRef.current = appData.importedScoreStoragePath;
          setIsImportedScoreReconciliationInProgress(true);

          try {
            const initialFileMetadata = await listImportedScoreFiles();
            const trust = decideImportedScoreStorageTrust({
              currentStoragePath,
              fileMetadata: initialFileMetadata,
              librarySongs: appData.library.librarySongs,
              persistedStoragePath: appData.importedScoreStoragePath,
            });

            if (!trust.trusted) {
              appendLog(text.importedScoreStorageUntrusted);
              appendDetailedLog?.({
                details: {
                  currentStoragePath,
                  persistedStoragePath:
                    appData.importedScoreStoragePath ?? null,
                  reason: trust.reason,
                },
                level: "warn",
                message: "Imported score storage directory is not trusted",
                source: "imported-score-storage",
              });
            } else {
              const originalFallbackSongs =
                appData.library.migrationFallbackSongs ?? {};
              const report = await reconcilePersistedImportedScores({
                appendLog,
                librarySongs: appData.library.librarySongs,
                migrationFallbackSongs: originalFallbackSongs,
                reconcileImportedScoreFiles,
                showNotice,
                text,
              });
              const remainingFallbackSongs =
                retainUnverifiedMigrationFallbackSongs(
                  originalFallbackSongs,
                  report,
                );
              runtimeAppData = {
                ...appData,
                library: {
                  ...appData.library,
                  ...(Object.keys(remainingFallbackSongs).length > 0
                    ? { migrationFallbackSongs: remainingFallbackSongs }
                    : { migrationFallbackSongs: undefined }),
                },
              };

              const { fileMetadata, protectedSongIds } =
                await migrateImportedScoreStorageBeforeListing({
                  librarySongs: runtimeAppData.library.librarySongs,
                  listFiles: listImportedScoreFiles,
                  migrateStorage: migrateImportedScoreStorage,
                  onDetailedLog: appendDetailedLog,
                  unresolvedFallbackSongs: remainingFallbackSongs,
                });

              const recovery = await recoverAndCleanupImportedScoreLibrary({
                appData: runtimeAppData,
                fileMetadata,
                onFailure: ({ error, songId }) => {
                  appendDetailedLog?.({
                    details: { error: String(error), songId },
                    level: "warn",
                    message: "Failed to recover managed imported score",
                    source: "imported-score-storage",
                  });
                },
                protectedSongIds,
                readSong: readImportedScoreSong,
                trust,
              });
              runtimeAppData = recovery.appData;

              if (recovery.recoveredSongIds.length > 0) {
                appendLog(
                  formatText(text.orphanedLocalScoresRecovered, {
                    count: recovery.recoveredSongIds.length,
                  }),
                );
              }

              runtimeAppData = {
                ...runtimeAppData,
                importedScoreStoragePath: currentStoragePath,
              };
              importedScoreStoragePathRef.current = currentStoragePath;
              shouldPersistStartup =
                shouldPersistStartup ||
                sourceVersion !== 3 ||
                appData.importedScoreStoragePath !== currentStoragePath ||
                Object.keys(remainingFallbackSongs).length !==
                  Object.keys(originalFallbackSongs).length ||
                recovery.recoveredSongIds.length > 0 ||
                recovery.removedSongIds.length > 0;

              if (recovery.removedSongIds.length > 0) {
                appendLog(
                  formatText(text.missingLocalScoresRemoved, {
                    count: recovery.removedSongIds.length,
                  }),
                );
              }
            }
          } catch (error) {
            runtimeAppData = appData;
            appendLog(text.missingLocalScoresScanFailed);
            appendDetailedLog?.({
              details: { error: String(error) },
              level: "warn",
              message: "Imported score startup scan failed",
              source: "imported-score-storage",
            });
          } finally {
            if (!isCancelled) {
              setIsImportedScoreReconciliationInProgress(false);
            }
          }
        } catch (error) {
          appendLog(text.missingLocalScoresScanFailed);
          appendDetailedLog?.({
            details: { error: String(error) },
            level: "warn",
            message: "Failed to resolve imported score storage directory",
            source: "imported-score-storage",
          });
        }

        if (isCancelled) {
          return;
        }

        if (shouldPersistStartup) {
          try {
            await saveAppData(runtimeAppData);
            explicitlySavedAppDataSnapshotRef.current =
              JSON.stringify(runtimeAppData);
          } catch (persistenceError) {
            canEnableNormalPersistence = false;
            const message = formatText(text.appDataSaveFailed, {
              error: String(persistenceError),
            });
            appendLog(message);
            showNotice?.(message);
          }
        }

        explicitlySavedAppDataSnapshotRef.current =
          JSON.stringify(runtimeAppData);

        startupLibrarySongIdsRef.current = new Set(
          runtimeAppData.library.librarySongs.map(({ id }) => id),
        );
        setLanguage(runtimeAppData.language);
        applyConfirmBeforeExit(runtimeAppData.confirmBeforeExit);
        applyKeyMapping(runtimeAppData.keyMapping);
        applyPlaybackSettings(runtimeAppData.playbackSettings);
        applyPlaybackShortcuts(runtimeAppData.playbackShortcuts);
        applyScoreLibrary(runtimeAppData.library);
        applyExperimentalInputPreferences(
          runtimeAppData.experimentalInputPreferences,
        );
        appendLog(text.appDataLoaded);
        setIsNormalPersistenceEnabled(canEnableNormalPersistence);
        setHasLoadedAppData(true);
      } catch (error) {
        if (!isCancelled) {
          appendLog(
            formatText(text.appDataLoadFailed, {
              error: String(error),
            }),
          );
          setHasLoadedAppData(true);
        }
      }
    }

    void loadPersistedAppData();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !hasLoadedAppData ||
      !canSaveAppData ||
      !isNormalPersistenceEnabled
    ) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      const appData = buildCurrentPersistedAppData();
      const appDataSnapshot = JSON.stringify(appData);

      if (explicitlySavedAppDataSnapshotRef.current === appDataSnapshot) {
        explicitlySavedAppDataSnapshotRef.current = null;
        return;
      }

      void saveAppData(appData).catch((error) => {
        appendLog(
          formatText(text.appDataSaveFailed, {
            error: String(error),
          }),
        );
      });
    }, saveDebounceMs);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    canSaveAppData,
    confirmBeforeExit,
    experimentalInputMode,
    experimentalInputEnabled,
    hasLoadedAppData,
    isNormalPersistenceEnabled,
    isShuffleEnabled,
    keyMapping,
    language,
    librarySongs,
    likedSongs,
    migrationFallbackSongs,
    noteIntervalDelayMs,
    playbackMode,
    playbackShortcuts,
    playbackSpeed,
    playlists,
    selectedLibraryCategory,
    selectedPlaylistId,
    selectedSongIndex,
    selectedWindowHwnd,
    selectedWindowSnapshot,
    targetWindowCompatibilityProfile,
    targetWindowKeyHoldMs,
    targetWindowMessageMethod,
    validCollectionSongIds,
  ]);

  return {
    hasLoadedAppData,
    isImportedScoreReconciliationInProgress,
    async saveConfirmBeforeExitPreference(nextConfirmBeforeExit: boolean) {
      if (
        !hasLoadedAppData ||
        !canSaveAppData ||
        !isNormalPersistenceEnabled
      ) {
        throw new Error("Application data is not ready to save.");
      }

      const appData = buildCurrentPersistedAppData(nextConfirmBeforeExit);
      await saveAppData(appData);
      explicitlySavedAppDataSnapshotRef.current = JSON.stringify(appData);
    },
  };
}
