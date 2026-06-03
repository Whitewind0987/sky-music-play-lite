import { builtInScoreManifest } from "../data/builtin-scores/manifest";
import type { LibrarySong } from "../types/library";
import { parseScoreFileContent } from "./scoreFileImport";

export type BuiltInLibraryLoadResult = {
  fileCount: number;
  skippedFileCount: number;
  songs: LibrarySong[];
};

export async function loadBuiltInLibrarySongs(): Promise<BuiltInLibraryLoadResult> {
  const builtInSongs: LibrarySong[] = [];
  let skippedFileCount = 0;

  for (const entry of builtInScoreManifest) {
    try {
      const raw = await entry.loadRaw();
      const songs = parseScoreFileContent(raw);

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
      console.warn("[built-in-scores] skipped", entry.id, entry.title, error);
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
