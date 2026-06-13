import type { Song } from "../types/score";
import { findBuiltInScoreIndexEntry } from "./builtinScoreIndex";
import {
  parseScoreFileSongAtIndex,
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

  // Cache successful loads, but let transient fetch or parse failures retry.
  void loadingScore.then(
    (song) => {
      if (song === null && builtInScoreCache.get(scoreId) === loadingScore) {
        builtInScoreCache.delete(scoreId);
      }
    },
    () => {
      if (builtInScoreCache.get(scoreId) === loadingScore) {
        builtInScoreCache.delete(scoreId);
      }
    },
  );

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
    const song = parseScoreFileSongAtIndex(raw, entry.songIndex);

    if (song === null) {
      console.warn("[built-in-scores] lazy load song index missing", {
        fileName: entry.fileName,
        id: entry.id,
        songIndex: entry.songIndex,
        title: entry.title,
      });
    }

    return song;
  } catch (error) {
    if (error instanceof ScoreFileImportError) {
      console.warn("[built-in-scores] lazy load skipped", {
        code: error.code,
        details: error.details,
        fileName: entry.fileName,
        id: entry.id,
        songIndex: entry.songIndex,
        title: entry.title,
      });
    } else {
      console.warn("[built-in-scores] lazy load failed", {
        error,
        fileName: entry.fileName,
        id: entry.id,
        songIndex: entry.songIndex,
        title: entry.title,
      });
    }

    return null;
  }
}
