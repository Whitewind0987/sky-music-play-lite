import type { Song } from "../types/score";
import { isValidExplicitDuration } from "./scoreTiming";

export function toCanonicalManagedSong(song: Song): Song {
  const formatVersion = song.songNotes.some((note) =>
    isValidExplicitDuration(note.duration),
  )
    ? 2
    : song.formatVersion;

  return {
    ...(formatVersion === undefined ? {} : { formatVersion }),
    name: song.name,
    bpm: song.bpm,
    bitsPerPage: song.bitsPerPage,
    pitchLevel: song.pitchLevel,
    isComposed: song.isComposed,
    songNotes: song.songNotes.map((note) => ({ ...note })),
  };
}
