import type { LocalLibrarySong } from "../types/library";
import type { Song } from "../types/score";
import { createLibrarySong as createDefaultLibrarySong } from "./libraryCollections";

type PersistRecordedSongOptions = {
  createLibrarySong?: (song: Song) => LocalLibrarySong;
  saveImportedScoreSong: (
    songId: LocalLibrarySong["id"],
    song: Song,
  ) => Promise<unknown>;
  song: Song;
};

export async function persistRecordedSong({
  createLibrarySong = createDefaultLibrarySong,
  saveImportedScoreSong,
  song,
}: PersistRecordedSongOptions): Promise<LocalLibrarySong> {
  const librarySong = createLibrarySong(song);

  await saveImportedScoreSong(librarySong.id, song);

  return librarySong;
}
