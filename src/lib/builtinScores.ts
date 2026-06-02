import { builtInScoreManifest } from "../data/builtin-scores/manifest";
import type { LibrarySong } from "../types/library";
import { parseScoreFileContent } from "./scoreFileImport";

export function loadBuiltInLibrarySongs(): LibrarySong[] {
  return builtInScoreManifest.flatMap((entry) =>
    parseScoreFileContent(entry.raw).map((song, songIndex) => ({
      id: `builtin:${entry.id}:${songIndex}`,
      importedAt: 0,
      song,
      source: "built-in" as const,
    })),
  );
}
