import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { UiText, LanguageCode } from "../i18n/uiText";
import {
  buildPersistedAppData,
  sanitizePersistedAppData,
} from "../lib/appData";
import { formatText } from "../lib/formatText";
import { loadAppData, saveAppData } from "../lib/tauriApi";
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
import type { Song } from "../types/score";

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
  applyScoreLibrary: (library: PersistedAppData["library"]) => void;
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  importedSongs: Song[];
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  language: LanguageCode;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  playbackMode: PlaybackMode;
  playbackSpeed: PlaybackSpeed;
  selectedLibraryCategory: LibraryCategoryId;
  selectedSongIndex: number | null;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot: ExperimentalInputPreferences["selectedWindowSnapshot"];
  setLanguage: (language: LanguageCode) => void;
  targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
  targetWindowKeyHoldMs: number;
  targetWindowMessageMethod: TargetWindowMessageMethod;
  text: UiText["logs"];
};

export function useAppPersistence({
  appendLog,
  applyExperimentalInputPreferences,
  applyKeyMapping,
  applyPlaybackSettings,
  applyScoreLibrary,
  experimentalInputEnabled,
  experimentalInputMode,
  importedSongs,
  isShuffleEnabled,
  keyMapping,
  language,
  noteIntervalDelayMs,
  playbackMode,
  playbackSpeed,
  selectedLibraryCategory,
  selectedSongIndex,
  selectedWindowHwnd,
  selectedWindowSnapshot,
  setLanguage,
  targetWindowCompatibilityProfile,
  targetWindowKeyHoldMs,
  targetWindowMessageMethod,
  text,
}: UseAppPersistenceOptions) {
  const saveTimerRef = useRef<number | null>(null);
  const [hasLoadedAppData, setHasLoadedAppData] = useState(false);

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

        setLanguage(appData.language);
        applyKeyMapping(appData.keyMapping);
        applyPlaybackSettings(appData.playbackSettings);
        applyScoreLibrary(appData.library);
        applyExperimentalInputPreferences(appData.experimentalInputPreferences);
        appendLog(text.appDataLoaded);
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
    if (!hasLoadedAppData) {
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
        importedSongs,
        isShuffleEnabled,
        keyMapping,
        language,
        noteIntervalDelayMs,
        playbackMode,
        playbackSpeed,
        selectedLibraryCategory,
        selectedSongIndex,
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
    experimentalInputMode,
    experimentalInputEnabled,
    hasLoadedAppData,
    importedSongs,
    isShuffleEnabled,
    keyMapping,
    language,
    noteIntervalDelayMs,
    playbackMode,
    playbackSpeed,
    selectedLibraryCategory,
    selectedSongIndex,
    selectedWindowHwnd,
    selectedWindowSnapshot,
    targetWindowCompatibilityProfile,
    targetWindowKeyHoldMs,
    targetWindowMessageMethod,
  ]);

  return {
    hasLoadedAppData,
  };
}
