import type { Song } from "./score";

export type LibrarySongId = string;
export type LibrarySongSource = "built-in" | "local-import";

export type LibrarySong = {
  builtInFileName?: string;
  builtInSongIndex?: number;
  id: LibrarySongId;
  importedAt: number;
  isBuiltInLoaded?: boolean;
  song: Song;
  source: LibrarySongSource;
};

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

export type LibrarySongListItem = {
  isLiked: boolean;
  librarySong: LibrarySong;
  songIndex: number;
};
