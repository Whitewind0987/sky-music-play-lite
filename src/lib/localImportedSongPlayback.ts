import type { LibrarySong, LibrarySongId } from "../types/library";
import type { Song } from "../types/score";

type LoadLocalImportedSongForPlaybackOptions = {
  appendLog: (entry: string) => void;
  formatLoadFailure: (
    songName: string,
    songId: LibrarySongId,
    error: unknown,
  ) => string;
  isSongStillInLibrary: (songId: LibrarySongId) => boolean;
  librarySong: LibrarySong;
  loadSongById: (songId: LibrarySongId) => Promise<Song | null>;
  onStaleLoad?: (songId: LibrarySongId) => void;
  shouldLogFailure: boolean;
  showNotice?: (message: string) => void;
};

export async function loadLocalImportedSongForPlayback({
  appendLog,
  formatLoadFailure,
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
    if (shouldLogFailure) {
      const message = formatLoadFailure(
        librarySong.song.name,
        librarySong.id,
        error,
      );

      appendLog(message);
      showNotice?.(message);
    }

    return null;
  }
}
