import type { LibraryCategoryId } from "../components/AppShell";
import type { LanguageCode } from "../i18n/uiText";
import {
  appDataVersion,
  type ExperimentalInputPreferences,
  type PersistedAppData,
} from "../types/appData";
import type { ExperimentalInputMode } from "../types/experimentalInput";
import {
  defaultExperimentalInputEnabled,
  defaultExperimentalInputMode,
  normalizeExperimentalInputPreferences,
  normalizeTargetWindowCompatibilityProfile,
  normalizeTargetWindowMessageMethod,
} from "./experimentalInputPreferences";
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
  type PlaybackShortcutBinding,
  type PlaybackShortcuts,
} from "../types/playbackShortcuts";
import {
  createLocalSongMetadata,
  ensureLibrarySongs,
} from "./libraryCollections";
import type {
  LikedSongEntry,
  LocalLibrarySong,
  LocalSongMetadata,
  MigrationFallbackSongs,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";
import { normalizePersistedSong } from "./scoreNormalization";
import {
  createDefaultV1ToV2UpgradePreferences,
  sanitizeV1ToV2UpgradePreferences,
} from "./v1ToV2UpgradePreferences";
import type { V1ToV2UpgradePreferences } from "../types/v1ToV2Upgrade";

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
const defaultTargetWindowKeyHoldMs = 30;
const targetWindowKeyHoldMinMs = 10;
const targetWindowKeyHoldMaxMs = 200;
export const defaultConfirmBeforeExit = true;

export type SupportedAppDataVersion = 1 | 2 | typeof appDataVersion;

export function getPersistedAppDataVersion(
  rawData: unknown,
): SupportedAppDataVersion | null {
  if (!isRecord(rawData)) {
    return null;
  }

  const rawVersion = rawData.appDataVersion;

  return rawVersion === 1 || rawVersion === 2 || rawVersion === appDataVersion
    ? rawVersion
    : null;
}

export function sanitizePersistedAppData(
  rawData: unknown,
): PersistedAppData | null {
  if (!isRecord(rawData)) {
    return null;
  }

  const rawVersion = getPersistedAppDataVersion(rawData);

  if (rawVersion === null) {
    return null;
  }

  const rawLibrary = isRecord(rawData.library) ? rawData.library : {};
  const { librarySongs, migrationFallbackSongs } = sanitizeLibraryForVersion(
    rawVersion,
    rawLibrary,
  );
  const likedSongs = sanitizeLikedSongs(rawLibrary.likedSongs, null);
  const playlists = sanitizePlaylists(rawLibrary.playlists, null);
  const selectedPlaylistId = sanitizeSelectedPlaylistId(
    rawLibrary.selectedPlaylistId,
    playlists,
  );

  return {
    alwaysOnTop:
      typeof rawData.alwaysOnTop === "boolean"
        ? rawData.alwaysOnTop
        : false,
    appDataVersion,
    confirmBeforeExit:
      typeof rawData.confirmBeforeExit === "boolean"
        ? rawData.confirmBeforeExit
        : defaultConfirmBeforeExit,
    ...(typeof rawData.importedScoreStoragePath === "string" &&
    rawData.importedScoreStoragePath.trim().length > 0
      ? { importedScoreStoragePath: rawData.importedScoreStoragePath }
      : {}),
    experimentalInputPreferences:
      sanitizeExperimentalInputPreferences(
        rawData.experimentalInputPreferences,
      ),
    keyMapping: sanitizeKeyMapping(rawData.keyMapping),
    language: sanitizeEnum(rawData.language, languageCodes, "zh-CN"),
    library: {
      librarySongs,
      likedSongs,
      ...(Object.keys(migrationFallbackSongs).length > 0
        ? { migrationFallbackSongs }
        : {}),
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
    v1ToV2UpgradePreferences: sanitizeV1ToV2UpgradePreferences(
      rawData.v1ToV2UpgradePreferences,
    ),
  };
}

export function buildPersistedAppData({
  alwaysOnTop = false,
  confirmBeforeExit = defaultConfirmBeforeExit,
  experimentalInputPreferences,
  librarySongs,
  likedSongs,
  isShuffleEnabled,
  importedScoreStoragePath,
  keyMapping,
  language,
  migrationFallbackSongs = {},
  noteIntervalDelayMs,
  playbackMode,
  playbackShortcuts,
  playbackSpeed,
  playlists,
  validCollectionSongIds,
  selectedLibraryCategory,
  selectedPlaylistId,
  selectedSongIndex,
  v1ToV2UpgradePreferences =
    createDefaultV1ToV2UpgradePreferences(),
}: {
  alwaysOnTop?: boolean;
  confirmBeforeExit?: boolean;
  experimentalInputPreferences?: PersistedAppData["experimentalInputPreferences"];
  librarySongs: LocalLibrarySong[];
  likedSongs: LikedSongEntry[];
  isShuffleEnabled: boolean;
  importedScoreStoragePath?: string;
  keyMapping: KeyMapping;
  language: LanguageCode;
  migrationFallbackSongs?: MigrationFallbackSongs;
  noteIntervalDelayMs: number;
  playbackMode: PlaybackMode;
  playbackShortcuts: PlaybackShortcuts;
  playbackSpeed: number;
  playlists: UserPlaylist[];
  validCollectionSongIds?: string[];
  selectedLibraryCategory: LibraryCategoryId;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  v1ToV2UpgradePreferences?: V1ToV2UpgradePreferences;
}): PersistedAppData {
  const sanitizedLibrary = sanitizeV3Library(
    librarySongs,
    migrationFallbackSongs,
  );
  const sanitizedLibrarySongs = sanitizedLibrary.librarySongs;
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
    alwaysOnTop,
    appDataVersion,
    confirmBeforeExit,
    ...(importedScoreStoragePath === undefined
      ? {}
      : { importedScoreStoragePath }),
    experimentalInputPreferences:
      experimentalInputPreferences === undefined
        ? undefined
        : normalizeExperimentalInputPreferences(experimentalInputPreferences),
    keyMapping: sanitizeKeyMapping(keyMapping),
    language,
    library: {
      librarySongs: sanitizedLibrarySongs,
      likedSongs: sanitizeLikedSongs(likedSongs, validCollectionSongIdSet),
      ...(Object.keys(sanitizedLibrary.migrationFallbackSongs).length > 0
        ? {
            migrationFallbackSongs:
              sanitizedLibrary.migrationFallbackSongs,
          }
        : {}),
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
    v1ToV2UpgradePreferences: sanitizeV1ToV2UpgradePreferences(
      v1ToV2UpgradePreferences,
    ),
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
      const defaultBinding = defaultPlaybackShortcuts[action];
      const binding = isRecord(shortcut) ? shortcut : null;
      return {
        ...nextShortcuts,
        [action]: sanitizePlaybackShortcutBinding(
          typeof shortcut === "string" ? shortcut : binding,
          defaultBinding,
        ),
      };
    },
    { ...defaultPlaybackShortcuts },
  );
}

function sanitizePlaybackShortcutBinding(
  rawBinding: string | Record<string, unknown> | null,
  defaultBinding: PlaybackShortcutBinding,
): PlaybackShortcutBinding {
  if (typeof rawBinding === "string") {
    return {
      code:
        rawBinding.trim().length > 0 ? rawBinding : defaultBinding.code,
      scope: defaultBinding.scope,
    };
  }

  return {
    code:
      typeof rawBinding?.code === "string" && rawBinding.code.trim().length > 0
        ? rawBinding.code
        : defaultBinding.code,
    scope:
      rawBinding?.scope === "in-app" || rawBinding?.scope === "global"
        ? rawBinding.scope
        : defaultBinding.scope,
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
    experimentalInputEnabled:
      typeof rawPreferences.experimentalInputEnabled === "boolean"
        ? rawPreferences.experimentalInputEnabled
        : defaultExperimentalInputEnabled,
    experimentalInputMode: sanitizeEnum(
      rawPreferences.experimentalInputMode,
      experimentalInputModes,
      defaultExperimentalInputMode,
    ),
    selectedWindowHwnd:
      typeof rawPreferences.selectedWindowHwnd === "string"
        ? rawPreferences.selectedWindowHwnd
        : null,
    selectedWindowSnapshot: sanitizeSelectedWindowSnapshot(
      rawPreferences.selectedWindowSnapshot,
    ),
    targetWindowCompatibilityProfile: normalizeTargetWindowCompatibilityProfile(
      rawPreferences.targetWindowCompatibilityProfile,
    ),
    targetWindowKeyHoldMs: clampNumber(
      Number(rawPreferences.targetWindowKeyHoldMs),
      targetWindowKeyHoldMinMs,
      targetWindowKeyHoldMaxMs,
      defaultTargetWindowKeyHoldMs,
    ),
    targetWindowMessageMethod: normalizeTargetWindowMessageMethod(
      rawPreferences.targetWindowMessageMethod,
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

  return rawSongs.reduce<Song[]>((songs, rawSong) => {
    const song = normalizePersistedSong(rawSong);
    if (song !== null) {
      songs.push(song);
    }
    return songs;
  }, []);
}

function sanitizeLibraryForVersion(
  version: SupportedAppDataVersion,
  rawLibrary: Record<string, unknown>,
): {
  librarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
} {
  if (version === 1) {
    const songs = sanitizeSongs(rawLibrary.importedSongs);
    const librarySongs = ensureLibrarySongs(songs);

    return {
      librarySongs,
      migrationFallbackSongs: Object.fromEntries(
        librarySongs.map((librarySong, index) => [
          librarySong.id,
          songs[index] as Song,
        ]),
      ),
    };
  }

  if (version === 2) {
    return sanitizeV2Library(rawLibrary.librarySongs);
  }

  return sanitizeV3Library(
    rawLibrary.librarySongs,
    rawLibrary.migrationFallbackSongs,
  );
}

function sanitizeV2Library(rawLibrarySongs: unknown): {
  librarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
} {
  if (!Array.isArray(rawLibrarySongs)) {
    return { librarySongs: [], migrationFallbackSongs: {} };
  }

  const seenIds = new Set<string>();
  const migrationFallbackSongs: MigrationFallbackSongs = {};
  const librarySongs = rawLibrarySongs.reduce<LocalLibrarySong[]>(
    (nextSongs, rawLibrarySong) => {
      if (
        !isRecord(rawLibrarySong) ||
        !isValidLocalSongId(rawLibrarySong.id) ||
        seenIds.has(rawLibrarySong.id) ||
        (rawLibrarySong.source !== undefined &&
          rawLibrarySong.source !== "local-import")
      ) {
        return nextSongs;
      }

      const song = normalizePersistedSong(rawLibrarySong.song);
      if (song === null) {
        return nextSongs;
      }
      seenIds.add(rawLibrarySong.id);

      nextSongs.push({
        id: rawLibrarySong.id,
        importedAt: sanitizeImportedAt(rawLibrarySong.importedAt),
        metadata: createLocalSongMetadata(song),
        source: "local-import",
      });
      migrationFallbackSongs[rawLibrarySong.id] = song;

      return nextSongs;
    },
    [],
  );

  return { librarySongs, migrationFallbackSongs };
}

function sanitizeV3Library(
  rawLibrarySongs: unknown,
  rawMigrationFallbackSongs: unknown,
): {
  librarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
} {
  const seenIds = new Set<string>();
  const candidates = Array.isArray(rawLibrarySongs)
    ? rawLibrarySongs.reduce<
        Array<{
          id: string;
          importedAt: number;
          rawMetadata: unknown;
        }>
      >((nextCandidates, rawLibrarySong) => {
        if (
          !isRecord(rawLibrarySong) ||
          !isValidLocalSongId(rawLibrarySong.id) ||
          seenIds.has(rawLibrarySong.id) ||
          rawLibrarySong.source !== "local-import"
        ) {
          return nextCandidates;
        }

        seenIds.add(rawLibrarySong.id);
        nextCandidates.push({
          id: rawLibrarySong.id,
          importedAt: sanitizeImportedAt(rawLibrarySong.importedAt),
          rawMetadata: rawLibrarySong.metadata,
        });

        return nextCandidates;
      }, [])
    : [];
  const rawFallbackSongs = isRecord(rawMigrationFallbackSongs)
    ? rawMigrationFallbackSongs
    : {};
  const migrationFallbackSongs: MigrationFallbackSongs = {};
  const librarySongs = candidates.reduce<LocalLibrarySong[]>(
    (nextSongs, candidate) => {
      const persistedMetadata = sanitizeLocalSongMetadata(
        candidate.rawMetadata,
      );
      const rawFallbackSong = rawFallbackSongs[candidate.id];
      const fallbackSong = normalizePersistedSong(rawFallbackSong);
      const metadata =
        fallbackSong === null
          ? persistedMetadata
          : createLocalSongMetadata(fallbackSong);

      if (metadata === null) {
        return nextSongs;
      }

      if (fallbackSong !== null) {
        migrationFallbackSongs[candidate.id] = fallbackSong;
      }

      nextSongs.push({
        id: candidate.id,
        importedAt: candidate.importedAt,
        metadata,
        source: "local-import",
      });

      return nextSongs;
    },
    [],
  );

  return { librarySongs, migrationFallbackSongs };
}

function sanitizeLocalSongMetadata(rawMetadata: unknown): LocalSongMetadata | null {
  if (!isRecord(rawMetadata)) {
    return null;
  }

  const scalarFields = [
    "bpm",
    "bitsPerPage",
    "pitchLevel",
    "lastNoteTimeMs",
  ] as const;

  if (
    typeof rawMetadata.name !== "string" ||
    typeof rawMetadata.isComposed !== "boolean" ||
    typeof rawMetadata.fingerprint !== "string" ||
    rawMetadata.fingerprint.length === 0 ||
    !scalarFields.every(
      (field) =>
        typeof rawMetadata[field] === "number" &&
        Number.isFinite(rawMetadata[field]),
    ) ||
    !isNonnegativeInteger(rawMetadata.noteCount) ||
    !isNonnegativeInteger(rawMetadata.noteGroupCount) ||
    rawMetadata.noteGroupCount > rawMetadata.noteCount ||
    (rawMetadata.lastNoteTimeMs as number) < 0
  ) {
    return null;
  }

  const noteGroupDelaysMs = sanitizeNoteGroupDelays(
    rawMetadata.noteGroupDelaysMs,
    rawMetadata.noteGroupCount,
  );

  if (rawMetadata.noteGroupDelaysMs !== undefined && noteGroupDelaysMs === null) {
    return null;
  }

  const noteGroupMaxHoldMs = sanitizeNoteGroupMaxHolds(
    rawMetadata.noteGroupMaxHoldMs,
    rawMetadata.noteGroupCount,
  );

  const rawSustainTailMs = rawMetadata.sustainTailMs;
  const contentFingerprint =
    typeof rawMetadata.contentFingerprint === "string" &&
    rawMetadata.contentFingerprint.length > 0
      ? rawMetadata.contentFingerprint
      : undefined;

  if (
    rawSustainTailMs !== undefined &&
    (typeof rawSustainTailMs !== "number" ||
      !Number.isFinite(rawSustainTailMs) ||
      rawSustainTailMs < 0)
  ) {
    return null;
  }

  return {
    bitsPerPage: rawMetadata.bitsPerPage as number,
    bpm: rawMetadata.bpm as number,
    ...(contentFingerprint === undefined ? {} : { contentFingerprint }),
    fingerprint: rawMetadata.fingerprint,
    ...(rawMetadata.formatVersion === 1 || rawMetadata.formatVersion === 2
      ? { formatVersion: rawMetadata.formatVersion }
      : {}),
    isComposed: rawMetadata.isComposed,
    lastNoteTimeMs: rawMetadata.lastNoteTimeMs as number,
    name: rawMetadata.name,
    noteCount: rawMetadata.noteCount,
    noteGroupCount: rawMetadata.noteGroupCount,
    ...(noteGroupDelaysMs === null ? {} : { noteGroupDelaysMs }),
    ...(noteGroupMaxHoldMs === null ? {} : { noteGroupMaxHoldMs }),
    pitchLevel: rawMetadata.pitchLevel as number,
    ...(typeof rawSustainTailMs === "number" && rawSustainTailMs > 0
      ? { sustainTailMs: rawSustainTailMs }
      : {}),
  };
}

function sanitizeNoteGroupMaxHolds(
  rawHolds: unknown,
  noteGroupCount: number,
) {
  if (rawHolds === undefined) {
    return null;
  }

  if (
    !Array.isArray(rawHolds) ||
    rawHolds.length !== noteGroupCount ||
    !rawHolds.every(
      (holdMs) =>
        typeof holdMs === "number" &&
        Number.isFinite(holdMs) &&
        holdMs >= 0 &&
        holdMs <= 60000,
    )
  ) {
    return null;
  }

  return [...rawHolds] as number[];
}

function sanitizeNoteGroupDelays(
  rawDelays: unknown,
  noteGroupCount: number,
) {
  if (rawDelays === undefined) {
    return null;
  }

  if (
    !Array.isArray(rawDelays) ||
    rawDelays.length !== noteGroupCount ||
    !rawDelays.every(
      (delay) =>
        typeof delay === "number" && Number.isFinite(delay) && delay >= 0,
    )
  ) {
    return null;
  }

  return [...rawDelays] as number[];
}

function sanitizeImportedAt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : Date.now();
}

function isNonnegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidLocalSongId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^(?:local|legacy)-[A-Za-z0-9_-]+$/.test(value)
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
