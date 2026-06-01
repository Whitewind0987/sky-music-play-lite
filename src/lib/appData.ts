import type { LibraryCategoryId } from "../components/AppShell";
import type { LanguageCode } from "../i18n/uiText";
import { appDataVersion, type PersistedAppData } from "../types/appData";
import {
  type ExperimentalInputMode,
  type TargetWindowCompatibilityProfile,
  type TargetWindowMessageMethod,
} from "../types/experimentalInput";
import {
  defaultKeyMapping,
  skyKeyNames,
  type KeyMapping,
} from "../types/keyMapping";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
  normalizeNoteIntervalDelay,
  normalizePlaybackSpeed,
  playbackModes,
  type PlaybackMode,
} from "../types/playbackOptions";
import type { Song } from "../types/score";

const languageCodes: LanguageCode[] = ["zh-CN", "en-US"];
const libraryCategoryIds: LibraryCategoryId[] = [
  "built-in",
  "local-imports",
  "playlists",
  "liked",
];
const experimentalInputModes: ExperimentalInputMode[] = [
  "target-window-message",
  "foreground",
];
const targetWindowMessageMethods: TargetWindowMessageMethod[] = [
  "post-message",
  "send-message",
];
const targetWindowCompatibilityProfiles: TargetWindowCompatibilityProfile[] = [
  "standard",
  "legacy-vkscan-zero-lparam",
  "legacy-vkscan-scan-lparam",
  "grouped-legacy",
  "legacy-activate-scan-lparam",
];
const defaultTargetWindowKeyHoldMs = 30;
const targetWindowKeyHoldMinMs = 10;
const targetWindowKeyHoldMaxMs = 200;

export function sanitizePersistedAppData(
  rawData: unknown,
): PersistedAppData | null {
  if (!isRecord(rawData) || rawData.appDataVersion !== appDataVersion) {
    return null;
  }

  const importedSongs = sanitizeSongs(
    isRecord(rawData.library) ? rawData.library.importedSongs : null,
  );

  return {
    appDataVersion,
    experimentalInputPreferences:
      sanitizeExperimentalInputPreferences(
        rawData.experimentalInputPreferences,
      ),
    keyMapping: sanitizeKeyMapping(rawData.keyMapping),
    language: sanitizeEnum(rawData.language, languageCodes, "zh-CN"),
    library: {
      importedSongs,
      selectedLibraryCategory: sanitizeEnum(
        isRecord(rawData.library)
          ? rawData.library.selectedLibraryCategory
          : null,
        libraryCategoryIds,
        "local-imports",
      ),
      selectedSongIndex: sanitizeSelectedSongIndex(
        isRecord(rawData.library) ? rawData.library.selectedSongIndex : null,
        importedSongs.length,
      ),
    },
    playbackSettings: sanitizePlaybackSettings(rawData.playbackSettings),
  };
}

export function buildPersistedAppData({
  experimentalInputPreferences,
  importedSongs,
  isShuffleEnabled,
  keyMapping,
  language,
  noteIntervalDelayMs,
  playbackMode,
  playbackSpeed,
  selectedLibraryCategory,
  selectedSongIndex,
}: {
  experimentalInputPreferences?: PersistedAppData["experimentalInputPreferences"];
  importedSongs: Song[];
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  language: LanguageCode;
  noteIntervalDelayMs: number;
  playbackMode: PlaybackMode;
  playbackSpeed: number;
  selectedLibraryCategory: LibraryCategoryId;
  selectedSongIndex: number | null;
}): PersistedAppData {
  return {
    appDataVersion,
    experimentalInputPreferences,
    keyMapping: sanitizeKeyMapping(keyMapping),
    language,
    library: {
      importedSongs: sanitizeSongs(importedSongs),
      selectedLibraryCategory,
      selectedSongIndex: sanitizeSelectedSongIndex(
        selectedSongIndex,
        importedSongs.length,
      ),
    },
    playbackSettings: {
      isShuffleEnabled,
      noteIntervalDelayMs: normalizeNoteIntervalDelay(noteIntervalDelayMs),
      playbackMode,
      playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
    },
  };
}

function sanitizePlaybackSettings(
  rawPlaybackSettings: unknown,
): PersistedAppData["playbackSettings"] {
  const playbackSettings = isRecord(rawPlaybackSettings)
    ? rawPlaybackSettings
    : {};

  return {
    isShuffleEnabled:
      typeof playbackSettings.isShuffleEnabled === "boolean"
        ? playbackSettings.isShuffleEnabled
        : false,
    noteIntervalDelayMs: normalizeNoteIntervalDelay(
      Number(playbackSettings.noteIntervalDelayMs),
      defaultNoteIntervalDelayMs,
    ),
    playbackMode: sanitizeEnum(
      playbackSettings.playbackMode,
      playbackModes,
      defaultPlaybackMode,
    ),
    playbackSpeed: normalizePlaybackSpeed(
      Number(playbackSettings.playbackSpeed),
      defaultPlaybackSpeed,
    ),
  };
}

function sanitizeExperimentalInputPreferences(
  rawPreferences: unknown,
): PersistedAppData["experimentalInputPreferences"] | undefined {
  if (!isRecord(rawPreferences)) {
    return undefined;
  }

  return {
    experimentalInputMode: sanitizeEnum(
      rawPreferences.experimentalInputMode,
      experimentalInputModes,
      "target-window-message",
    ),
    targetWindowCompatibilityProfile: sanitizeEnum(
      rawPreferences.targetWindowCompatibilityProfile,
      targetWindowCompatibilityProfiles,
      "standard",
    ),
    targetWindowKeyHoldMs: clampNumber(
      Number(rawPreferences.targetWindowKeyHoldMs),
      targetWindowKeyHoldMinMs,
      targetWindowKeyHoldMaxMs,
      defaultTargetWindowKeyHoldMs,
    ),
    targetWindowMessageMethod: sanitizeEnum(
      rawPreferences.targetWindowMessageMethod,
      targetWindowMessageMethods,
      "post-message",
    ),
  };
}

function sanitizeKeyMapping(rawKeyMapping: unknown): KeyMapping {
  if (!isRecord(rawKeyMapping)) {
    return defaultKeyMapping;
  }

  return skyKeyNames.reduce<KeyMapping>(
    (nextMapping, skyKeyName) => ({
      ...nextMapping,
      [skyKeyName]:
        typeof rawKeyMapping[skyKeyName] === "string"
          ? rawKeyMapping[skyKeyName]
          : defaultKeyMapping[skyKeyName],
    }),
    { ...defaultKeyMapping },
  );
}

function sanitizeSongs(rawSongs: unknown): Song[] {
  if (!Array.isArray(rawSongs)) {
    return [];
  }

  return rawSongs.filter(isSong);
}

function sanitizeSelectedSongIndex(
  rawSongIndex: unknown,
  songCount: number,
) {
  if (
    typeof rawSongIndex !== "number" ||
    !Number.isInteger(rawSongIndex) ||
    rawSongIndex < 0 ||
    rawSongIndex >= songCount
  ) {
    return null;
  }

  return rawSongIndex;
}

function sanitizeEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fallback: T,
) {
  return typeof value === "string" && allowedValues.includes(value as T)
    ? (value as T)
    : fallback;
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function isSong(value: unknown): value is Song {
  if (!isRecord(value) || !Array.isArray(value.songNotes)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.bpm === "number" &&
    typeof value.bitsPerPage === "number" &&
    typeof value.pitchLevel === "number" &&
    typeof value.isComposed === "boolean" &&
    value.songNotes.every(isNote)
  );
}

function isNote(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.time === "number" &&
    typeof value.key === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
