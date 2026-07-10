import type {
  LibrarySongId,
  LikedSongEntry,
  LocalLibrarySong,
  MigrationFallbackSongs,
  UserPlaylist,
} from "../types/library";
import type { PersistedAppData } from "../types/appData";
import type { ImportedScoreFileMetadata } from "./tauriApi";

type MissingImportedScoresCleanupInput = {
  likedSongs: LikedSongEntry[];
  localLibrarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
  missingSongIds: Iterable<LibrarySongId>;
  playbackSongId: LibrarySongId | null;
  playlists: UserPlaylist[];
  selectedSongId: LibrarySongId | null;
};

export type MissingImportedScoresCleanupResult = {
  likedSongs: LikedSongEntry[];
  localLibrarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
  playbackSongId: LibrarySongId | null;
  playlists: UserPlaylist[];
  removedSongIds: LibrarySongId[];
  selectedSongId: LibrarySongId | null;
};

export type PersistedMissingImportedScoresCleanupResult = {
  library: PersistedAppData["library"];
  removedSongIds: LibrarySongId[];
};

export async function resolveImportedScoreAfterExistenceCheck<T>({
  fileExists,
  load,
  onMissing,
}: {
  fileExists: () => Promise<boolean>;
  load: () => Promise<T | null>;
  onMissing: () => boolean;
}): Promise<T | null> {
  try {
    if (!(await fileExists()) && onMissing()) {
      return null;
    }
  } catch {
    // An inconclusive check must not remove a persisted library record.
  }

  return load();
}

export function getMissingImportedScoreIds({
  fileMetadata,
  localLibrarySongs,
  migrationFallbackSongs,
}: {
  fileMetadata: ImportedScoreFileMetadata[];
  localLibrarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
}): LibrarySongId[] {
  const existingSongIds = new Set(
    fileMetadata.map((metadata) => metadata.id),
  );

  return localLibrarySongs
    .filter(
      (librarySong) =>
        !existingSongIds.has(librarySong.id) &&
        migrationFallbackSongs[librarySong.id] === undefined,
    )
    .map((librarySong) => librarySong.id);
}

export function cleanupMissingImportedScores({
  likedSongs,
  localLibrarySongs,
  migrationFallbackSongs,
  missingSongIds,
  playbackSongId,
  playlists,
  selectedSongId,
}: MissingImportedScoresCleanupInput): MissingImportedScoresCleanupResult {
  const requestedSongIds = new Set(missingSongIds);
  const removedSongIds = localLibrarySongs
    .filter(
      (librarySong) =>
        requestedSongIds.has(librarySong.id) &&
        migrationFallbackSongs[librarySong.id] === undefined,
    )
    .map((librarySong) => librarySong.id);

  if (removedSongIds.length === 0) {
    return {
      likedSongs,
      localLibrarySongs,
      migrationFallbackSongs,
      playbackSongId,
      playlists,
      removedSongIds,
      selectedSongId,
    };
  }

  const removedSongIdSet = new Set(removedSongIds);
  const nextMigrationFallbackSongs = { ...migrationFallbackSongs };

  removedSongIds.forEach((songId) => {
    delete nextMigrationFallbackSongs[songId];
  });

  return {
    likedSongs: likedSongs.filter(
      (entry) => !removedSongIdSet.has(entry.songId),
    ),
    localLibrarySongs: localLibrarySongs.filter(
      (librarySong) => !removedSongIdSet.has(librarySong.id),
    ),
    migrationFallbackSongs: nextMigrationFallbackSongs,
    playbackSongId:
      playbackSongId !== null && removedSongIdSet.has(playbackSongId)
        ? null
        : playbackSongId,
    playlists: playlists.map((playlist) => {
      const nextSongIds = playlist.songIds.filter(
        (songId) => !removedSongIdSet.has(songId),
      );

      return nextSongIds.length === playlist.songIds.length
        ? playlist
        : {
            ...playlist,
            songIds: nextSongIds,
            updatedAt: Date.now(),
          };
    }),
    removedSongIds,
    selectedSongId:
      selectedSongId !== null && removedSongIdSet.has(selectedSongId)
        ? null
        : selectedSongId,
  };
}

export function cleanupMissingImportedScoresFromPersistedLibrary({
  fileMetadata,
  library,
}: {
  fileMetadata: ImportedScoreFileMetadata[];
  library: PersistedAppData["library"];
}): PersistedMissingImportedScoresCleanupResult {
  const migrationFallbackSongs = library.migrationFallbackSongs ?? {};
  const missingSongIds = getMissingImportedScoreIds({
    fileMetadata,
    localLibrarySongs: library.librarySongs,
    migrationFallbackSongs,
  });

  if (missingSongIds.length === 0) {
    return { library, removedSongIds: [] };
  }

  const selectedSongId =
    library.selectedSongIndex === null
      ? null
      : library.librarySongs[library.selectedSongIndex]?.id ?? null;
  const cleanup = cleanupMissingImportedScores({
    likedSongs: library.likedSongs,
    localLibrarySongs: library.librarySongs,
    migrationFallbackSongs,
    missingSongIds,
    playbackSongId: null,
    playlists: library.playlists,
    selectedSongId,
  });
  const selectedSongIndex =
    cleanup.selectedSongId === null
      ? null
      : cleanup.localLibrarySongs.findIndex(
          (librarySong) => librarySong.id === cleanup.selectedSongId,
        );

  return {
    library: {
      ...library,
      librarySongs: cleanup.localLibrarySongs,
      likedSongs: cleanup.likedSongs,
      ...(Object.keys(cleanup.migrationFallbackSongs).length > 0
        ? { migrationFallbackSongs: cleanup.migrationFallbackSongs }
        : { migrationFallbackSongs: undefined }),
      playlists: cleanup.playlists,
      selectedSongIndex:
        selectedSongIndex === null || selectedSongIndex < 0
          ? null
          : selectedSongIndex,
    },
    removedSongIds: cleanup.removedSongIds,
  };
}
