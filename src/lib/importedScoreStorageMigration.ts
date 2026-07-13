import type {
  LibrarySongId,
  LocalLibrarySong,
  MigrationFallbackSongs,
} from "../types/library";
import type {
  AppLogEntry,
  ImportedScoreFileMetadata,
  ImportedScoreStorageMigrationReport,
} from "./tauriApi";

type MigrationCommand = (
  songIds: LibrarySongId[],
) => Promise<ImportedScoreStorageMigrationReport>;
type ListCommand = () => Promise<ImportedScoreFileMetadata[]>;

export function collectImportedScoreStorageMigrationIds(
  librarySongs: LocalLibrarySong[],
  unresolvedFallbackSongs: MigrationFallbackSongs,
): LibrarySongId[] {
  const unresolvedIds = new Set(Object.keys(unresolvedFallbackSongs));

  return [...new Set(librarySongs.map((song) => song.id))].filter(
    (songId) => !unresolvedIds.has(songId),
  );
}

export async function migrateImportedScoreStorageBeforeListing({
  librarySongs,
  listFiles,
  migrateStorage,
  onDetailedLog,
  unresolvedFallbackSongs,
}: {
  librarySongs: LocalLibrarySong[];
  listFiles: ListCommand;
  migrateStorage: MigrationCommand;
  onDetailedLog?: (entry: AppLogEntry) => void;
  unresolvedFallbackSongs: MigrationFallbackSongs;
}): Promise<{
  fileMetadata: ImportedScoreFileMetadata[];
  protectedSongIds: LibrarySongId[];
  report: ImportedScoreStorageMigrationReport;
}> {
  const songIds = collectImportedScoreStorageMigrationIds(
    librarySongs,
    unresolvedFallbackSongs,
  );
  let report: ImportedScoreStorageMigrationReport;
  try {
    report = await migrateStorage(songIds);
  } catch (error) {
    onDetailedLog?.({
      details: { error: String(error) },
      level: "warn",
      message: "Imported score storage migration failed",
      source: "imported-score-storage",
    });
    throw error;
  }
  onDetailedLog?.({
    details: report,
    level: report.failed.length > 0 ? "warn" : "info",
    message: "Imported score storage migration completed",
    source: "imported-score-storage",
  });
  const fileMetadata = await listFiles();

  return {
    fileMetadata,
    protectedSongIds: report.failed.map((failure) => failure.songId),
    report,
  };
}
