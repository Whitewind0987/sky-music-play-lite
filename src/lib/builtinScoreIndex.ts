import { builtInScoreSourceName, builtInScoreSourceUrl } from "../data/builtin-scores/manifest";

export type BuiltInScoreIndexEntry = {
  bpm: number;
  bitsPerPage: number;
  durationMs: number;
  fileName: string;
  formatVersion: 1 | 2;
  id: string;
  isComposed: boolean;
  noteCount: number;
  pitchLevel: number;
  songIndex: number;
  title: string;
};

export type BuiltInScoreIndex = {
  entries: BuiltInScoreIndexEntry[];
  generatedAt: string;
  sourceName: string;
  sourceUrl: string;
};

const builtInScoreIndexPath = "/builtin-scores/index.json";
let builtInScoreIndexPromise: Promise<BuiltInScoreIndex> | null = null;

export function loadBuiltInScoreIndex() {
  if (builtInScoreIndexPromise === null) {
    builtInScoreIndexPromise = fetchBuiltInScoreIndex();
  }

  return builtInScoreIndexPromise;
}

export async function findBuiltInScoreIndexEntry(scoreId: string) {
  const index = await loadBuiltInScoreIndex();

  return index.entries.find((entry) => entry.id === scoreId) ?? null;
}

async function fetchBuiltInScoreIndex(): Promise<BuiltInScoreIndex> {
  try {
    const response = await fetch(builtInScoreIndexPath);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const index = sanitizeBuiltInScoreIndex(data);

    console.info("[built-in-scores] loaded index", {
      fileCount: new Set(index.entries.map((entry) => entry.fileName)).size,
      generatedAt: index.generatedAt,
      songCount: index.entries.length,
    });

    return index;
  } catch (error) {
    console.warn("[built-in-scores] index load failed", { error });

    return {
      entries: [],
      generatedAt: "",
      sourceName: builtInScoreSourceName,
      sourceUrl: builtInScoreSourceUrl,
    };
  }
}

export function sanitizeBuiltInScoreIndex(rawIndex: unknown): BuiltInScoreIndex {
  if (!isRecord(rawIndex) || !Array.isArray(rawIndex.entries)) {
    return {
      entries: [],
      generatedAt: "",
      sourceName: builtInScoreSourceName,
      sourceUrl: builtInScoreSourceUrl,
    };
  }

  return {
    entries: rawIndex.entries.reduce<BuiltInScoreIndexEntry[]>((entries, rawEntry) => {
      if (!isRecord(rawEntry)) {
        return entries;
      }

      const entry = sanitizeBuiltInScoreIndexEntry(rawEntry);

      if (entry !== null) {
        entries.push(entry);
      }

      return entries;
    }, []),
    generatedAt:
      typeof rawIndex.generatedAt === "string" ? rawIndex.generatedAt : "",
    sourceName:
      typeof rawIndex.sourceName === "string"
        ? rawIndex.sourceName
        : builtInScoreSourceName,
    sourceUrl:
      typeof rawIndex.sourceUrl === "string"
        ? rawIndex.sourceUrl
        : builtInScoreSourceUrl,
  };
}

function sanitizeBuiltInScoreIndexEntry(
  rawEntry: Record<string, unknown>,
): BuiltInScoreIndexEntry | null {
  if (
    typeof rawEntry.id !== "string" ||
    typeof rawEntry.title !== "string" ||
    typeof rawEntry.fileName !== "string" ||
    !isSafeBuiltInScoreFileName(rawEntry.fileName) ||
    typeof rawEntry.bpm !== "number" ||
    typeof rawEntry.bitsPerPage !== "number" ||
    typeof rawEntry.durationMs !== "number" ||
    typeof rawEntry.pitchLevel !== "number" ||
    typeof rawEntry.noteCount !== "number" ||
    typeof rawEntry.songIndex !== "number" ||
    typeof rawEntry.isComposed !== "boolean"
  ) {
    return null;
  }

  return {
    bpm: rawEntry.bpm,
    bitsPerPage: rawEntry.bitsPerPage,
    durationMs: rawEntry.durationMs,
    fileName: rawEntry.fileName,
    formatVersion:
      rawEntry.formatVersion === 2 ? 2 : 1,
    id: rawEntry.id,
    isComposed: rawEntry.isComposed,
    noteCount: rawEntry.noteCount,
    pitchLevel: rawEntry.pitchLevel,
    songIndex: rawEntry.songIndex,
    title: rawEntry.title,
  };
}

export function isSafeBuiltInScoreFileName(fileName: string) {
  return /^[a-z0-9_-]+\.(txt|json)$/i.test(fileName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
