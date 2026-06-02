import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "../components/AppShell";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  formatImportError,
  formatImportFailureSummary,
  type ImportFailure,
} from "../lib/importErrors";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
} from "../lib/scoreFileImport";
import type { Song } from "../types/score";

type UseScoreLibraryOptions = {
  appendLog: (entry: string) => void;
  onBeforeLibraryMutation: () => void;
  text: UiText;
};

export function useScoreLibrary({
  appendLog,
  onBeforeLibraryMutation,
  text,
}: UseScoreLibraryOptions) {
  const importedSongsRef = useRef<Song[]>([]);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(
    null,
  );
  const [selectedLibraryCategory, setSelectedLibraryCategory] =
    useState<LibraryCategoryId>("local-imports");
  const currentSelectedSong =
    selectedSongIndex === null ? null : importedSongs[selectedSongIndex] ?? null;

  useEffect(() => {
    importedSongsRef.current = importedSongs;
  }, [importedSongs]);

  async function handleImportScoreFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const failedImports: ImportFailure[] = [];
    const importedSongsFromFiles: Song[] = [];
    let successfulFileCount = 0;

    for (const file of files) {
      try {
        if (!isSupportedScoreFileName(file.name)) {
          throw new Error(text.score.unsupportedFile);
        }

        const content = await file.text();
        const songs = parseScoreFileContent(content);

        importedSongsFromFiles.push(...songs);
        successfulFileCount += 1;
      } catch (error) {
        failedImports.push({
          error: formatImportError(error, text),
          fileName: file.name,
        });
      }
    }

    if (importedSongsFromFiles.length > 0) {
      const firstNewSongIndex = importedSongsRef.current.length;
      const shouldSelectFirstImportedSong = selectedSongIndex === null;

      setImportedSongs((currentSongs) => {
        const nextSongs = [...currentSongs, ...importedSongsFromFiles];

        importedSongsRef.current = nextSongs;
        return nextSongs;
      });

      if (shouldSelectFirstImportedSong) {
        setSelectedSongIndex(firstNewSongIndex);
      }

      setImportError("");
      appendLog(
        formatText(text.logs.importedScoresFromFiles, {
          count: importedSongsFromFiles.length,
          fileCount: successfulFileCount,
        }),
      );
    }

    if (failedImports.length > 0) {
      setImportError(formatImportFailureSummary(failedImports));

      failedImports.forEach(({ error, fileName }) => {
        appendLog(
          formatText(text.logs.importFailed, {
            error,
            fileName,
          }),
        );
      });
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    onBeforeLibraryMutation();
    setSelectedSongIndex(songIndex);
  }

  function handleLibraryCategoryChange(category: LibraryCategoryId) {
    setSelectedLibraryCategory(category);
  }

  function applyScoreLibrary({
    importedSongs: nextImportedSongs,
    selectedLibraryCategory: nextSelectedLibraryCategory,
    selectedSongIndex: nextSelectedSongIndex,
  }: {
    importedSongs: Song[];
    selectedLibraryCategory: LibraryCategoryId;
    selectedSongIndex: number | null;
  }) {
    importedSongsRef.current = nextImportedSongs;
    setImportedSongs(nextImportedSongs);
    setSelectedLibraryCategory(nextSelectedLibraryCategory);
    setSelectedSongIndex(nextSelectedSongIndex);
    setImportError("");
  }

  return {
    applyScoreLibrary,
    currentSelectedSong,
    handleImportScoreFiles,
    handleLibraryCategoryChange,
    handleSelectImportedSong,
    importError,
    importedSongs,
    importedSongsRef,
    selectedLibraryCategory,
    selectedSongIndex,
    setSelectedSongIndex,
  };
}
