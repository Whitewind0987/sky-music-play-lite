import type { Song } from "../types/score";
import { findBuiltInScoreIndexEntry } from "./builtinScoreIndex";
import {
  parseScoreFileContent,
  ScoreFileImportError,
} from "./scoreFileImport";

const builtInScoreCache = new Map<string, Promise<Song | null>>();

export function loadBuiltInScoreById(scoreId: string): Promise<Song | null> {
  const cachedScore = builtInScoreCache.get(scoreId);

  if (cachedScore) {
    return cachedScore;
  }

  const loadingScore = loadBuiltInScore(scoreId);

  builtInScoreCache.set(scoreId, loadingScore);
  return loadingScore;
}

async function loadBuiltInScore(scoreId: string): Promise<Song | null> {
  const entry = await findBuiltInScoreIndexEntry(scoreId);

  if (entry === null) {
    console.warn("[built-in-scores] score id missing from index", { scoreId });
    return null;
  }

  try {
    const response = await fetch(`/builtin-scores/scores/${entry.fileName}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw = await response.text();
    const songs = parseScoreFileContent(raw);

    return songs[entry.songIndex] ?? null;
  } catch (error) {
    if (error instanceof ScoreFileImportError) {
      console.warn("[built-in-scores] lazy load skipped", {
        code: error.code,
        details: error.details,
        id: entry.id,
        title: entry.title,
      });
    } else {
      console.warn("[built-in-scores] lazy load failed", {
        error,
        id: entry.id,
        title: entry.title,
      });
    }

    return null;
  }
}
