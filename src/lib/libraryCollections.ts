import type {
  LibrarySong,
  LibrarySongId,
  LikedSongEntry,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";

let generatedIdCounter = 0;

export function createLibrarySong(song: Song, now = Date.now()): LibrarySong {
  generatedIdCounter += 1;

  return {
    id: `local-${now}-${generatedIdCounter}`,
    importedAt: now,
    song,
    source: "local-import",
  };
}

export function ensureLibrarySongs(rawSongs: Song[]): LibrarySong[] {
  return rawSongs.map((song, index) => ({
    id: `legacy-${index}-${hashSong(song)}`,
    importedAt: Date.now(),
    song,
    source: "local-import",
  }));
}

export function findSongIndexById(
  librarySongs: LibrarySong[],
  songId: LibrarySongId,
) {
  const songIndex = librarySongs.findIndex((librarySong) => librarySong.id === songId);

  return songIndex >= 0 ? songIndex : null;
}

export function filterSongsByQuery<T extends { librarySong: LibrarySong }>(
  items: T[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    item.librarySong.song.name.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function isSongLiked(
  likedSongs: LikedSongEntry[],
  songId: LibrarySongId,
) {
  return likedSongs.some((entry) => entry.songId === songId);
}

export function toggleLikedSong(
  likedSongs: LikedSongEntry[],
  songId: LibrarySongId,
) {
  if (isSongLiked(likedSongs, songId)) {
    return likedSongs.filter((entry) => entry.songId !== songId);
  }

  return [...likedSongs, { likedAt: Date.now(), songId }];
}

export function createPlaylist(name: string): UserPlaylist {
  const now = Date.now();
  generatedIdCounter += 1;

  return {
    createdAt: now,
    id: `playlist-${now}-${generatedIdCounter}`,
    name,
    songIds: [],
    updatedAt: now,
  };
}

export function addSongToPlaylist(
  playlist: UserPlaylist,
  songId: LibrarySongId,
) {
  if (playlist.songIds.includes(songId)) {
    return playlist;
  }

  return {
    ...playlist,
    songIds: [...playlist.songIds, songId],
    updatedAt: Date.now(),
  };
}

export function removeSongFromPlaylist(
  playlist: UserPlaylist,
  songId: LibrarySongId,
) {
  if (!playlist.songIds.includes(songId)) {
    return playlist;
  }

  return {
    ...playlist,
    songIds: playlist.songIds.filter((currentSongId) => currentSongId !== songId),
    updatedAt: Date.now(),
  };
}

export function removeSongFromAllCollections({
  likedSongs,
  playlists,
  songId,
}: {
  likedSongs: LikedSongEntry[];
  playlists: UserPlaylist[];
  songId: LibrarySongId;
}) {
  return {
    likedSongs: likedSongs.filter((entry) => entry.songId !== songId),
    playlists: playlists.map((playlist) => removeSongFromPlaylist(playlist, songId)),
  };
}

function hashSong(song: Song) {
  const source = JSON.stringify({
    bpm: song.bpm,
    bitsPerPage: song.bitsPerPage,
    isComposed: song.isComposed,
    name: song.name,
    noteCount: song.songNotes.length,
    pitchLevel: song.pitchLevel,
  });
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
