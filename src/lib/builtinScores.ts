import { builtInScoreManifest } from "../data/builtin-scores/manifest";
import type { LibrarySong } from "../types/library";
import {
  parseScoreFileContent,
  ScoreFileImportError,
} from "./scoreFileImport";

export type BuiltInLibraryLoadResult = {
  fileCount: number;
  skippedFileCount: number;
  songs: LibrarySong[];
};

export function loadBuiltInLibrarySongs(): BuiltInLibraryLoadResult {
  const builtInSongs: LibrarySong[] = [];
  let skippedFileCount = 0;

  for (const entry of builtInScoreManifest) {
    try {
      const songs = parseScoreFileContent(entry.raw);

      songs.forEach((song, songIndex) => {
        builtInSongs.push({
          id: `builtin:${entry.id}:${songIndex}`,
          importedAt: 0,
          song,
          source: "built-in",
        });
      });
    } catch (error) {
      skippedFileCount += 1;

      if (error instanceof ScoreFileImportError) {
        console.warn("[built-in-scores] skipped", {
          code: error.code,
          details: error.details,
          id: entry.id,
          title: entry.title,
        });
      } else {
        console.warn("[built-in-scores] skipped", {
          error,
          id: entry.id,
          title: entry.title,
        });
      }
    }
  }

  console.info("[built-in-scores] loaded", {
    fileCount: builtInScoreManifest.length,
    skippedFileCount,
    songCount: builtInSongs.length,
  });

  return {
    fileCount: builtInScoreManifest.length,
    skippedFileCount,
    songs: builtInSongs,
  };
}
