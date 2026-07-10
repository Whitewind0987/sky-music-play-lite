import type { LibrarySongId, LocalLibrarySong } from "../types/library";
import type { Song } from "../types/score";
import { getLibrarySongName } from "./libraryCollections";

type LoadLocalImportedSongForPlaybackOptions = {
  appendLog: (entry: string) => void;
  formatLoadFailure: (
    songName: string,
    songId: LibrarySongId,
    error: unknown,
  ) => string;
  formatRecoveryWarning?: (
    songName: string,
    songId: LibrarySongId,
    error: unknown,
  ) => string;
  getMigrationFallbackSong?: (songId: LibrarySongId) => Song | null;
  isSongStillInLibrary: (songId: LibrarySongId) => boolean;
  librarySong: LocalLibrarySong;
  loadSongById: (songId: LibrarySongId) => Promise<Song | null>;
  onStaleLoad?: (songId: LibrarySongId) => void;
  shouldLogFailure: boolean;
  showNotice?: (message: string) => void;
};

export async function loadLocalImportedSongForPlayback({
  appendLog,
  formatLoadFailure,
  formatRecoveryWarning,
  getMigrationFallbackSong,
  isSongStillInLibrary,
  librarySong,
  loadSongById,
  onStaleLoad,
  shouldLogFailure,
  showNotice,
}: LoadLocalImportedSongForPlaybackOptions): Promise<Song | null> {
  try {
    const loadedSong = await loadSongById(librarySong.id);

    if (loadedSong === null) {
      return null;
    }

    if (!isSongStillInLibrary(librarySong.id)) {
      onStaleLoad?.(librarySong.id);
      return null;
    }

    return loadedSong;
  } catch (error) {
    const fallbackSong = getMigrationFallbackSong?.(librarySong.id) ?? null;

    if (fallbackSong !== null) {
      if (!isSongStillInLibrary(librarySong.id)) {
        onStaleLoad?.(librarySong.id);
        return null;
      }

      if (shouldLogFailure && formatRecoveryWarning) {
        const message = formatRecoveryWarning(
          getLibrarySongName(librarySong),
          librarySong.id,
          error,
        );

        appendLog(message);
        showNotice?.(message);
      }

      return fallbackSong;
    }

    if (shouldLogFailure) {
      const message = formatLoadFailure(
        getLibrarySongName(librarySong),
        librarySong.id,
        error,
      );

      appendLog(message);
      showNotice?.(message);
    }

    return null;
  }
}
