import type {
  LibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { Song } from "../types/score";
import type { ImportFailure } from "./importErrors";
import {
  createLibrarySong as createDefaultLibrarySong,
  getLibrarySongFingerprint,
  getSongFingerprint,
  hasReliableDuplicateFingerprint,
} from "./libraryCollections";

export type ParsedImportedSong = {
  fileName: string;
  song: Song;
};

type CreateLibrarySong = (song: Song) => LocalLibrarySong;
type SaveImportedScoreSong = (
  songId: LocalLibrarySong["id"],
  song: Song,
) => Promise<unknown>;

type StoreUniqueImportedSongsOptions = {
  createLibrarySong?: CreateLibrarySong;
  existingLibrarySongs: LibrarySong[];
  importedSongs: ParsedImportedSong[];
  saveImportedScoreSong: SaveImportedScoreSong;
};

export type StoreUniqueImportedSongsResult = {
  failedImports: ImportFailure[];
  skippedDuplicateSongs: Song[];
  storedLibrarySongs: LocalLibrarySong[];
};

export async function storeUniqueImportedSongs({
  createLibrarySong = createDefaultLibrarySong,
  existingLibrarySongs,
  importedSongs,
  saveImportedScoreSong,
}: StoreUniqueImportedSongsOptions): Promise<StoreUniqueImportedSongsResult> {
  const existingSongFingerprints = new Set(
    existingLibrarySongs
      .filter(hasReliableDuplicateFingerprint)
      .map(getLibrarySongFingerprint),
  );
  const failedImports: ImportFailure[] = [];
  const skippedDuplicateSongs: Song[] = [];
  const storedLibrarySongs: LocalLibrarySong[] = [];

  for (const { fileName, song } of importedSongs) {
    const fingerprint = getSongFingerprint(song);

    if (
      song.songNotes.length > 0 &&
      existingSongFingerprints.has(fingerprint)
    ) {
      skippedDuplicateSongs.push(song);
      continue;
    }

    const librarySong = createLibrarySong(song);

    try {
      await saveImportedScoreSong(librarySong.id, song);
    } catch (error) {
      failedImports.push({
        error: formatStorageError(error),
        fileName,
      });
      continue;
    }

    storedLibrarySongs.push(librarySong);

    if (song.songNotes.length > 0) {
      existingSongFingerprints.add(fingerprint);
    }
  }

  return {
    failedImports,
    skippedDuplicateSongs,
    storedLibrarySongs,
  };
}

function formatStorageError(error: unknown) {
  return String(error instanceof Error ? error.message : error);
}
