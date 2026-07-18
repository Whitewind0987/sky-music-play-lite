import type {
  LibrarySong,
  LibrarySongId,
  LikedSongEntry,
  LocalLibrarySong,
  LocalSongMetadata,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";
import {
  groupNotesByFiniteSourceTime,
} from "./scoreTiming";

let generatedIdCounter = 0;

export function createLibrarySong(
  song: Song,
  now = Date.now(),
): LocalLibrarySong {
  generatedIdCounter += 1;

  return {
    id: `local-${now}-${generatedIdCounter}`,
    importedAt: now,
    metadata: createLocalSongMetadata(song),
    source: "local-import",
  };
}

export function createLocalSongMetadata(song: Song): LocalSongMetadata {
  const noteGroups = groupNotesByFiniteSourceTime(song.songNotes);
  const noteGroupTimes = noteGroups.map((group) => group.sourceTimeMs);
  const noteGroupDelaysMs = noteGroupTimes.map((time, index) =>
    index === 0 ? Math.max(0, time) : Math.max(0, time - noteGroupTimes[index - 1]),
  );
  const noteGroupMaxHoldMs = noteGroups.map(
    (group) => group.maxExplicitDurationMs,
  );
  const sustainTailMs = getSustainTailMs(song.songNotes);

  return {
    ...(sustainTailMs > 0 ? { sustainTailMs } : {}),
    bitsPerPage: song.bitsPerPage,
    bpm: song.bpm,
    contentFingerprint: getSongContentFingerprint(song),
    fingerprint: getSongFingerprint(song),
    formatVersion: song.formatVersion === 2 ? 2 : 1,
    isComposed: song.isComposed,
    lastNoteTimeMs:
      noteGroupTimes.length === 0
        ? 0
        : Math.max(0, noteGroupTimes[noteGroupTimes.length - 1] ?? 0),
    name: song.name,
    noteCount: song.songNotes.length,
    noteGroupCount: noteGroupTimes.length,
    noteGroupDelaysMs,
    noteGroupMaxHoldMs,
    pitchLevel: song.pitchLevel,
  };
}

export function getLibrarySongFormatVersion(
  librarySong: LibrarySong,
): 1 | 2 | undefined {
  if (librarySong.source === "local-import") {
    const formatVersion = librarySong.metadata.formatVersion;

    return formatVersion === 1 || formatVersion === 2
      ? formatVersion
      : undefined;
  }

  if (librarySong.isBuiltInLoaded) {
    return librarySong.song.formatVersion === 2 ? 2 : 1;
  }

  return librarySong.builtInFormatVersion === 1 ||
    librarySong.builtInFormatVersion === 2
    ? librarySong.builtInFormatVersion
    : undefined;
}

export function enrichLocalSongFormatVersion(
  librarySongs: LocalLibrarySong[],
  songId: LibrarySongId,
  loadedSong: Song,
) {
  const formatVersion: 1 | 2 = loadedSong.formatVersion === 2 ? 2 : 1;
  const songIndex = librarySongs.findIndex(
    (librarySong) => librarySong.id === songId,
  );

  if (
    songIndex < 0 ||
    librarySongs[songIndex]?.metadata.formatVersion === formatVersion
  ) {
    return librarySongs;
  }

  return librarySongs.map((librarySong, index) =>
    index === songIndex
      ? {
          ...librarySong,
          metadata: {
            ...librarySong.metadata,
            formatVersion,
          },
        }
      : librarySong,
  );
}

export function getSustainTailMs(notes: Song["songNotes"]): number {
  const lastGroupTimeMs = notes.reduce(
    (lastTime, note) =>
      Number.isFinite(note.time) ? Math.max(lastTime, note.time) : lastTime,
    0,
  );
  const maxNoteEndMs = notes.reduce((maxEnd, note) => {
    if (!Number.isFinite(note.time) || note.duration === undefined) {
      return maxEnd;
    }

    return Math.max(maxEnd, note.time + note.duration);
  }, 0);

  return Math.max(0, maxNoteEndMs - lastGroupTimeMs);
}

export function getSongFingerprint(song: Song) {
  return hashString(
    JSON.stringify({
      bpm: song.bpm,
      bitsPerPage: song.bitsPerPage,
      isComposed: song.isComposed,
      name: song.name.trim().toLowerCase(),
      notes: song.songNotes.map((note) =>
        note.duration === undefined
          ? [note.time, note.key]
          : [note.time, note.key, note.duration],
      ),
      pitchLevel: song.pitchLevel,
    }),
  );
}

export function getSongContentFingerprint(song: Song) {
  return hashString(
    JSON.stringify({
      formatVersion: song.formatVersion === 2 ? 2 : 1,
      bpm: song.bpm,
      bitsPerPage: song.bitsPerPage,
      pitchLevel: song.pitchLevel,
      isComposed: song.isComposed,
      notes: song.songNotes.map((note) =>
        note.duration === undefined
          ? [note.time, note.key]
          : [note.time, note.key, note.duration],
      ),
    }),
  );
}

export function getLibrarySongFingerprint(librarySong: LibrarySong) {
  return librarySong.source === "local-import"
    ? librarySong.metadata.fingerprint
    : getSongFingerprint(librarySong.song);
}

export function hasReliableDuplicateFingerprint(librarySong: LibrarySong) {
  if (librarySong.source === "local-import") {
    return librarySong.metadata.noteCount > 0;
  }

  return librarySong.isBuiltInLoaded === true && librarySong.song.songNotes.length > 0;
}

export function ensureLibrarySongs(rawSongs: Song[]): LocalLibrarySong[] {
  return rawSongs.map((song, index) => ({
    id: `legacy-${index}-${hashSong(song)}`,
    importedAt: Date.now(),
    metadata: createLocalSongMetadata(song),
    source: "local-import",
  }));
}

export function getLibrarySongName(librarySong: LibrarySong) {
  return librarySong.source === "local-import"
    ? librarySong.metadata.name
    : librarySong.song.name;
}

export function getLibrarySongBpm(librarySong: LibrarySong) {
  return librarySong.source === "local-import"
    ? librarySong.metadata.bpm
    : librarySong.song.bpm;
}

export function getLibrarySongNoteCount(librarySong: LibrarySong) {
  if (librarySong.source === "local-import") {
    return librarySong.metadata.noteCount;
  }

  return librarySong.isBuiltInLoaded
    ? librarySong.song.songNotes.length
    : (librarySong.builtInNoteCount ?? 0);
}

export function getLibrarySongRawDurationMs(librarySong: LibrarySong) {
  if (librarySong.source === "local-import") {
    return (
      librarySong.metadata.lastNoteTimeMs +
      (librarySong.metadata.sustainTailMs ?? 0)
    );
  }

  if (!librarySong.isBuiltInLoaded && librarySong.builtInDurationMs !== undefined) {
    return librarySong.builtInDurationMs;
  }

  return librarySong.song.songNotes.reduce((durationMs, note) => {
    if (!Number.isFinite(note.time)) {
      return durationMs;
    }

    const noteEndMs =
      typeof note.duration === "number" && Number.isFinite(note.duration)
        ? note.time + note.duration
        : note.time;

    return Math.max(durationMs, note.time, noteEndMs, 0);
  }, 0);
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
    getLibrarySongName(item.librarySong)
      .toLocaleLowerCase()
      .includes(normalizedQuery),
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

  return hashString(source);
}

function hashString(source: string) {
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
