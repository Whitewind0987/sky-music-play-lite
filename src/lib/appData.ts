import type { LibraryCategoryId } from "../components/AppShell";
import type { LanguageCode } from "../i18n/uiText";
import {
  appDataVersion,
  type ExperimentalInputPreferences,
  type PersistedAppData,
} from "../types/appData";
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
import {
  defaultPlaybackShortcuts,
  playbackShortcutActions,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";
import { ensureLibrarySongs } from "./libraryCollections";
import type { LibrarySong, LikedSongEntry, UserPlaylist } from "../types/library";
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
  if (!isRecord(rawData)) {
    return null;
  }

  const rawVersion = rawData.appDataVersion;

  if (rawVersion !== 1 && rawVersion !== appDataVersion) {
    return null;
  }

  const rawLibrary = isRecord(rawData.library) ? rawData.library : {};
  const librarySongs =
    rawVersion === 1
      ? ensureLibrarySongs(sanitizeSongs(rawLibrary.importedSongs))
      : sanitizeLibrarySongs(rawLibrary.librarySongs);
  const likedSongs = sanitizeLikedSongs(rawLibrary.likedSongs, null);
  const playlists = sanitizePlaylists(rawLibrary.playlists, null);
  const selectedPlaylistId = sanitizeSelectedPlaylistId(
    rawLibrary.selectedPlaylistId,
    playlists,
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
      librarySongs,
      likedSongs,
      playlists,
      selectedLibraryCategory: sanitizeEnum(
        rawLibrary.selectedLibraryCategory,
        libraryCategoryIds,
        "local-imports",
      ),
      selectedPlaylistId,
      selectedSongIndex: sanitizeSelectedSongIndex(
        rawLibrary.selectedSongIndex,
        librarySongs.length,
      ),
    },
    playbackShortcuts: sanitizePlaybackShortcuts(rawData.playbackShortcuts),
    playbackSettings: sanitizePlaybackSettings(rawData.playbackSettings),
  };
}

export function buildPersistedAppData({
  experimentalInputPreferences,
  librarySongs,
  likedSongs,
  isShuffleEnabled,
  keyMapping,
  language,
  noteIntervalDelayMs,
  playbackMode,
  playbackShortcuts,
  playbackSpeed,
  playlists,
  validCollectionSongIds,
  selectedLibraryCategory,
  selectedPlaylistId,
  selectedSongIndex,
}: {
  experimentalInputPreferences?: PersistedAppData["experimentalInputPreferences"];
  librarySongs: LibrarySong[];
  likedSongs: LikedSongEntry[];
  isShuffleEnabled: boolean;
  keyMapping: KeyMapping;
  language: LanguageCode;
  noteIntervalDelayMs: number;
  playbackMode: PlaybackMode;
  playbackShortcuts: PlaybackShortcuts;
  playbackSpeed: number;
  playlists: UserPlaylist[];
  validCollectionSongIds?: string[];
  selectedLibraryCategory: LibraryCategoryId;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
}): PersistedAppData {
  const sanitizedLibrarySongs = sanitizeLibrarySongs(librarySongs);
  const validSongIds = new Set(
    sanitizedLibrarySongs.map((librarySong) => librarySong.id),
  );
  const validCollectionSongIdSet = new Set(
    validCollectionSongIds ?? Array.from(validSongIds),
  );
  const sanitizedPlaylists = sanitizePlaylists(
    playlists,
    validCollectionSongIdSet,
  );

  return {
    appDataVersion,
    experimentalInputPreferences,
    keyMapping: sanitizeKeyMapping(keyMapping),
    language,
    library: {
      librarySongs: sanitizedLibrarySongs,
      likedSongs: sanitizeLikedSongs(likedSongs, validCollectionSongIdSet),
      playlists: sanitizedPlaylists,
      selectedLibraryCategory,
      selectedPlaylistId: sanitizeSelectedPlaylistId(
        selectedPlaylistId,
        sanitizedPlaylists,
      ),
      selectedSongIndex: sanitizeSelectedSongIndex(
        selectedSongIndex,
        sanitizedLibrarySongs.length,
      ),
    },
    playbackShortcuts: sanitizePlaybackShortcuts(playbackShortcuts),
    playbackSettings: {
      isShuffleEnabled,
      noteIntervalDelayMs: normalizeNoteIntervalDelay(noteIntervalDelayMs),
      playbackMode,
      playbackSpeed: normalizePlaybackSpeed(playbackSpeed),
    },
  };
}

function sanitizePlaybackShortcuts(
  rawPlaybackShortcuts: unknown,
): PlaybackShortcuts {
  const playbackShortcuts = isRecord(rawPlaybackShortcuts)
    ? rawPlaybackShortcuts
    : {};

  return playbackShortcutActions.reduce<PlaybackShortcuts>(
    (nextShortcuts, action) => {
      const shortcut = playbackShortcuts[action];
      return {
        ...nextShortcuts,
        [action]:
          typeof shortcut === "string" && shortcut.trim().length > 0
            ? shortcut
            : defaultPlaybackShortcuts[action],
      };
    },
    { ...defaultPlaybackShortcuts },
  );
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
    experimentalInputEnabled:
      typeof rawPreferences.experimentalInputEnabled === "boolean"
        ? rawPreferences.experimentalInputEnabled
        : false,
    experimentalInputMode: sanitizeEnum(
      rawPreferences.experimentalInputMode,
      experimentalInputModes,
      "target-window-message",
    ),
    selectedWindowHwnd:
      typeof rawPreferences.selectedWindowHwnd === "string"
        ? rawPreferences.selectedWindowHwnd
        : null,
    selectedWindowSnapshot: sanitizeSelectedWindowSnapshot(
      rawPreferences.selectedWindowSnapshot,
    ),
    targetWindowCompatibilityProfile: sanitizeEnum(
      rawPreferences.targetWindowCompatibilityProfile,
      targetWindowCompatibilityProfiles,
      "legacy-activate-scan-lparam",
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

function sanitizeSelectedWindowSnapshot(
  rawSnapshot: unknown,
): ExperimentalInputPreferences["selectedWindowSnapshot"] {
  if (!isRecord(rawSnapshot) || typeof rawSnapshot.hwnd !== "string") {
    return undefined;
  }

  return {
    className:
      typeof rawSnapshot.className === "string" ? rawSnapshot.className : "",
    hwnd: rawSnapshot.hwnd,
    processName:
      typeof rawSnapshot.processName === "string"
        ? rawSnapshot.processName
        : undefined,
    title: typeof rawSnapshot.title === "string" ? rawSnapshot.title : "",
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

function sanitizeLibrarySongs(rawLibrarySongs: unknown): LibrarySong[] {
  if (!Array.isArray(rawLibrarySongs)) {
    return [];
  }

  return rawLibrarySongs.reduce<LibrarySong[]>((nextSongs, rawLibrarySong) => {
    if (
      !isRecord(rawLibrarySong) ||
      typeof rawLibrarySong.id !== "string" ||
      !isSong(rawLibrarySong.song) ||
      (rawLibrarySong.source !== undefined &&
        rawLibrarySong.source !== "local-import")
    ) {
      return nextSongs;
    }

    nextSongs.push({
      id: rawLibrarySong.id,
      importedAt:
        typeof rawLibrarySong.importedAt === "number"
          ? rawLibrarySong.importedAt
          : Date.now(),
      song: rawLibrarySong.song,
      source: "local-import",
    });

    return nextSongs;
  }, []);
}

function sanitizeLikedSongs(
  rawLikedSongs: unknown,
  validSongIds: Set<string> | null,
): LikedSongEntry[] {
  if (!Array.isArray(rawLikedSongs)) {
    return [];
  }

  const seenSongIds = new Set<string>();

  return rawLikedSongs.reduce<LikedSongEntry[]>((nextEntries, rawEntry) => {
    if (
      !isRecord(rawEntry) ||
      typeof rawEntry.songId !== "string" ||
      (validSongIds !== null && !validSongIds.has(rawEntry.songId)) ||
      seenSongIds.has(rawEntry.songId)
    ) {
      return nextEntries;
    }

    seenSongIds.add(rawEntry.songId);
    nextEntries.push({
      likedAt: typeof rawEntry.likedAt === "number" ? rawEntry.likedAt : Date.now(),
      songId: rawEntry.songId,
    });

    return nextEntries;
  }, []);
}

function sanitizePlaylists(
  rawPlaylists: unknown,
  validSongIds: Set<string> | null,
): UserPlaylist[] {
  if (!Array.isArray(rawPlaylists)) {
    return [];
  }

  return rawPlaylists.reduce<UserPlaylist[]>((nextPlaylists, rawPlaylist) => {
    if (
      !isRecord(rawPlaylist) ||
      typeof rawPlaylist.id !== "string" ||
      typeof rawPlaylist.name !== "string"
    ) {
      return nextPlaylists;
    }

    const songIds = Array.isArray(rawPlaylist.songIds)
      ? Array.from(
          new Set(
            rawPlaylist.songIds.filter(
              (songId): songId is string =>
                typeof songId === "string" &&
                (validSongIds === null || validSongIds.has(songId)),
            ),
          ),
        )
      : [];

    nextPlaylists.push({
      createdAt:
        typeof rawPlaylist.createdAt === "number"
          ? rawPlaylist.createdAt
          : Date.now(),
      id: rawPlaylist.id,
      name: rawPlaylist.name.trim() || "Playlist",
      songIds,
      updatedAt:
        typeof rawPlaylist.updatedAt === "number"
          ? rawPlaylist.updatedAt
          : Date.now(),
    });

    return nextPlaylists;
  }, []);
}

function sanitizeSelectedPlaylistId(
  rawPlaylistId: unknown,
  playlists: UserPlaylist[],
) {
  if (
    typeof rawPlaylistId === "string" &&
    playlists.some((playlist) => playlist.id === rawPlaylistId)
  ) {
    return rawPlaylistId;
  }

  return playlists[0]?.id ?? null;
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
