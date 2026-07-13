import type {
  LibrarySongId,
  LocalLibrarySong,
  MigrationFallbackSongs,
} from "../types/library";
import type {
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
  unresolvedFallbackSongs,
}: {
  librarySongs: LocalLibrarySong[];
  listFiles: ListCommand;
  migrateStorage: MigrationCommand;
  unresolvedFallbackSongs: MigrationFallbackSongs;
}): Promise<{
  fileMetadata: ImportedScoreFileMetadata[];
  report: ImportedScoreStorageMigrationReport;
}> {
  const songIds = collectImportedScoreStorageMigrationIds(
    librarySongs,
    unresolvedFallbackSongs,
  );
  const report = await migrateStorage(songIds);
  const fileMetadata = await listFiles();
  const listedIds = new Set(fileMetadata.map((file) => file.id));

  for (const failure of report.failed) {
    if (!listedIds.has(failure.songId)) {
      fileMetadata.push({
        fileName: "",
        id: failure.songId,
        modifiedMs: null,
        path: "",
        sizeBytes: 0,
      });
    }
  }

  return { fileMetadata, report };
}
