import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { UiText, LanguageCode } from "../i18n/uiText";
import {
  buildPersistedAppData,
  sanitizePersistedAppData,
} from "../lib/appData";
import { formatText } from "../lib/formatText";
import { reconcilePersistedImportedScoresWithProgress } from "../lib/importedScoreReconciliation";
import {
  loadAppData,
  reconcileImportedScoreFiles,
  saveAppData,
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
import type { LibrarySong, LikedSongEntry, UserPlaylist } from "../types/library";

const saveDebounceMs = 500;

type UseAppPersistenceOptions = {
  appendLog: (entry: string) => void;
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
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  language: LanguageCode;
  librarySongs: LibrarySong[];
  likedSongs: LikedSongEntry[];
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
  appendLog,
  applyExperimentalInputPreferences,
  applyKeyMapping,
  applyPlaybackSettings,
  applyPlaybackShortcuts,
  applyScoreLibrary,
  canSaveAppData = true,
  experimentalInputEnabled,
  experimentalInputMode,
  isShuffleEnabled,
  keyMapping,
  language,
  librarySongs,
  likedSongs,
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
  const [hasLoadedAppData, setHasLoadedAppData] = useState(false);
  const [
    isImportedScoreReconciliationInProgress,
    setIsImportedScoreReconciliationInProgress,
  ] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadPersistedAppData() {
      try {
        const rawAppData = await loadAppData();

        if (isCancelled) {
          return;
        }

        if (rawAppData === null) {
          appendLog(text.appDataMissing);
          setHasLoadedAppData(true);
          return;
        }

        const appData = sanitizePersistedAppData(rawAppData);

        if (appData === null) {
          appendLog(text.appDataInvalid);
          setHasLoadedAppData(true);
          return;
        }

        const reconciliationPromise =
          reconcilePersistedImportedScoresWithProgress({
            appendLog,
            librarySongs: appData.library.librarySongs,
            reconcileImportedScoreFiles,
            setInProgress: (isInProgress) => {
              if (!isCancelled) {
                setIsImportedScoreReconciliationInProgress(isInProgress);
              }
            },
            showNotice,
            text,
          });

        setLanguage(appData.language);
        applyKeyMapping(appData.keyMapping);
        applyPlaybackSettings(appData.playbackSettings);
        applyPlaybackShortcuts(appData.playbackShortcuts);
        applyScoreLibrary(appData.library);
        applyExperimentalInputPreferences(appData.experimentalInputPreferences);
        appendLog(text.appDataLoaded);
        setHasLoadedAppData(true);
        await reconciliationPromise;
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
    if (!hasLoadedAppData || !canSaveAppData) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      const appData = buildPersistedAppData({
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
        keyMapping,
        language,
        librarySongs,
        likedSongs,
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
    experimentalInputMode,
    experimentalInputEnabled,
    hasLoadedAppData,
    isShuffleEnabled,
    keyMapping,
    language,
    librarySongs,
    likedSongs,
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
  };
}
