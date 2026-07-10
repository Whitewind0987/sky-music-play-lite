import type { LibrarySong, LibrarySongId } from "../types/library";
import { getLibrarySongName } from "./libraryCollections";

type DeleteLocalSongWithScoreFileOptions = {
  appendLog: (entry: string) => void;
  deleteScoreFile: (songId: LibrarySongId) => Promise<unknown>;
  formatDeleteFailure: (songName: string, error: unknown) => string;
  librarySongs: LibrarySong[];
  onBeforeLibraryMutation: () => void;
  onDeleted?: (deletedSongIndex: number, deletedSongId: LibrarySongId) => void;
  onSuccessfulDelete: (librarySong: LibrarySong) => void;
  showNotice?: (message: string) => void;
  songIndex: number;
  stopPlaybackBeforeDelete?: boolean;
};

export async function deleteLocalSongWithScoreFile({
  appendLog,
  deleteScoreFile,
  formatDeleteFailure,
  librarySongs,
  onBeforeLibraryMutation,
  onDeleted,
  onSuccessfulDelete,
  showNotice,
  songIndex,
  stopPlaybackBeforeDelete = false,
}: DeleteLocalSongWithScoreFileOptions): Promise<boolean> {
  const librarySong = librarySongs[songIndex];

  if (!librarySong || librarySong.source !== "local-import") {
    return false;
  }

  try {
    await deleteScoreFile(librarySong.id);
  } catch (error) {
    const message = formatDeleteFailure(getLibrarySongName(librarySong), error);

    appendLog(message);
    showNotice?.(message);
    return false;
  }

  if (stopPlaybackBeforeDelete) {
    onBeforeLibraryMutation();
  }

  onDeleted?.(songIndex, librarySong.id);
  onSuccessfulDelete(librarySong);

  return true;
}
