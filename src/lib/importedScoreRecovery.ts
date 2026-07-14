import type { PersistedAppData } from "../types/appData";
import type { LibrarySongId, LocalLibrarySong } from "../types/library";
import type { Song } from "../types/score";
import { createLocalSongMetadata } from "./libraryCollections";
import { cleanupMissingImportedScoresFromPersistedLibrary } from "./missingImportedScores";
import type { ImportedScoreFileMetadata } from "./tauriApi";

export type ImportedScoreStorageTrustDecision =
  | { reason: "empty-library" | "matching-path" | "matching-song"; trusted: true }
  | { reason: "path-mismatch" | "unverified-legacy-path"; trusted: false };

export function normalizeImportedScoreStoragePath(path: string): string {
  const normalized = path.trim().replace(/\//g, "\\");
  const withoutTrailingSeparators = normalized.replace(/\\+(?=[^:]*)$/, "");

  return (withoutTrailingSeparators || normalized).toLocaleLowerCase("en-US");
}

export function decideImportedScoreStorageTrust({
  currentStoragePath,
  fileMetadata,
  librarySongs,
  persistedStoragePath,
}: {
  currentStoragePath: string;
  fileMetadata: ImportedScoreFileMetadata[];
  librarySongs: LocalLibrarySong[];
  persistedStoragePath?: string;
}): ImportedScoreStorageTrustDecision {
  if (persistedStoragePath !== undefined) {
    return normalizeImportedScoreStoragePath(persistedStoragePath) ===
      normalizeImportedScoreStoragePath(currentStoragePath)
      ? { reason: "matching-path", trusted: true }
      : { reason: "path-mismatch", trusted: false };
  }

  if (librarySongs.length === 0) {
    return { reason: "empty-library", trusted: true };
  }

  const persistedIds = new Set(librarySongs.map(({ id }) => id));
  return fileMetadata.some(({ id }) => persistedIds.has(id))
    ? { reason: "matching-song", trusted: true }
    : { reason: "unverified-legacy-path", trusted: false };
}

export type OrphanedImportedScoreRecoveryFailure = {
  error: unknown;
  songId: LibrarySongId;
};

export async function recoverOrphanedImportedScores({
  appData,
  fileMetadata,
  now = Date.now,
  onFailure,
  readSong,
}: {
  appData: PersistedAppData;
  fileMetadata: ImportedScoreFileMetadata[];
  now?: () => number;
  onFailure?: (failure: OrphanedImportedScoreRecoveryFailure) => void;
  readSong: (songId: LibrarySongId) => Promise<Song>;
}): Promise<{ appData: PersistedAppData; recoveredSongIds: LibrarySongId[] }> {
  const knownIds = new Set(appData.library.librarySongs.map(({ id }) => id));
  const recoveredSongs: LocalLibrarySong[] = [];

  for (const metadata of fileMetadata) {
    if (knownIds.has(metadata.id)) {
      continue;
    }

    try {
      const song = await readSong(metadata.id);
      const importedAt =
        typeof metadata.modifiedMs === "number" &&
        Number.isFinite(metadata.modifiedMs) &&
        Number.isSafeInteger(metadata.modifiedMs) &&
        metadata.modifiedMs >= 0
          ? metadata.modifiedMs
          : now();
      recoveredSongs.push({
        id: metadata.id,
        importedAt,
        metadata: createLocalSongMetadata(song),
        source: "local-import",
      });
      knownIds.add(metadata.id);
    } catch (error) {
      onFailure?.({ error, songId: metadata.id });
    }
  }

  if (recoveredSongs.length === 0) {
    return { appData, recoveredSongIds: [] };
  }

  return {
    appData: {
      ...appData,
      library: {
        ...appData.library,
        librarySongs: [...appData.library.librarySongs, ...recoveredSongs],
      },
    },
    recoveredSongIds: recoveredSongs.map(({ id }) => id),
  };
}

export async function recoverAndCleanupImportedScoreLibrary({
  appData,
  fileMetadata,
  onFailure,
  protectedSongIds = [],
  readSong,
  trust,
}: {
  appData: PersistedAppData;
  fileMetadata: ImportedScoreFileMetadata[];
  onFailure?: (failure: OrphanedImportedScoreRecoveryFailure) => void;
  protectedSongIds?: Iterable<LibrarySongId>;
  readSong: (songId: LibrarySongId) => Promise<Song>;
  trust: ImportedScoreStorageTrustDecision;
}): Promise<{
  appData: PersistedAppData;
  recoveredSongIds: LibrarySongId[];
  removedSongIds: LibrarySongId[];
}> {
  if (!trust.trusted) {
    return { appData, recoveredSongIds: [], removedSongIds: [] };
  }

  const recovery = await recoverOrphanedImportedScores({
    appData,
    fileMetadata,
    onFailure,
    readSong,
  });
  const cleanup = cleanupMissingImportedScoresFromPersistedLibrary({
    fileMetadata,
    library: recovery.appData.library,
    protectedSongIds,
  });

  return {
    appData: { ...recovery.appData, library: cleanup.library },
    recoveredSongIds: recovery.recoveredSongIds,
    removedSongIds: cleanup.removedSongIds,
  };
}
