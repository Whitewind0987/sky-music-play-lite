import type { BuiltInLibrarySong } from "../types/library";
import { loadBuiltInScoreIndex } from "./builtinScoreIndex";

export type BuiltInLibraryLoadResult = {
  fileCount: number;
  songs: BuiltInLibrarySong[];
};

export async function loadBuiltInLibrarySongs(): Promise<BuiltInLibraryLoadResult> {
  const index = await loadBuiltInScoreIndex();
  const builtInSongs = index.entries.map<BuiltInLibrarySong>((entry) => ({
    builtInFileName: entry.fileName,
    builtInFormatVersion: entry.formatVersion,
    builtInDurationMs: entry.durationMs,
    builtInNoteCount: entry.noteCount,
    builtInSongIndex: entry.songIndex,
    id: entry.id,
    importedAt: 0,
    isBuiltInLoaded: false,
    song: {
      bpm: entry.bpm,
      bitsPerPage: entry.bitsPerPage,
      isComposed: entry.isComposed,
      name: entry.title,
      pitchLevel: entry.pitchLevel,
      songNotes: [],
    },
    source: "built-in",
  }));

  return {
    fileCount: new Set(index.entries.map((entry) => entry.fileName)).size,
    songs: builtInSongs,
  };
}
