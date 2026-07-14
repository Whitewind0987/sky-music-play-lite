import type { Song } from "./score";

export type LibrarySongId = string;
export type LibrarySongSource = "built-in" | "local-import";

export type LocalSongMetadata = {
  bitsPerPage: number;
  bpm: number;
  fingerprint: string;
  formatVersion?: 1 | 2;
  isComposed: boolean;
  lastNoteTimeMs: number;
  name: string;
  noteCount: number;
  noteGroupCount: number;
  noteGroupDelaysMs?: number[];
  noteGroupMaxHoldMs?: number[];
  pitchLevel: number;
  sustainTailMs?: number;
};

export type BuiltInLibrarySong = {
  builtInDurationMs?: number;
  builtInFileName?: string;
  builtInFormatVersion?: 1 | 2;
  builtInNoteCount?: number;
  builtInSongIndex?: number;
  id: LibrarySongId;
  importedAt: number;
  isBuiltInLoaded?: boolean;
  song: Song;
  source: "built-in";
};

export type LocalLibrarySong = {
  id: LibrarySongId;
  importedAt: number;
  metadata: LocalSongMetadata;
  source: "local-import";
};

export type LibrarySong = BuiltInLibrarySong | LocalLibrarySong;

export type MigrationFallbackSongs = Record<LibrarySongId, Song>;

export type LikedSongEntry = {
  likedAt: number;
  songId: LibrarySongId;
};

export type UserPlaylist = {
  createdAt: number;
  id: string;
  name: string;
  songIds: LibrarySongId[];
  updatedAt: number;
};

export type AddSongToPlaylistResult =
  | { status: "added"; message?: string }
  | { status: "duplicate"; message: string }
  | { status: "missing"; message?: string };

export type LibrarySongListItem = {
  isLiked: boolean;
  librarySong: LibrarySong;
  songIndex: number;
};
