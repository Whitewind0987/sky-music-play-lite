import type { Song } from "./score";

export type LibrarySongId = string;

export type LibrarySong = {
  id: LibrarySongId;
  importedAt: number;
  song: Song;
  source: "local-import";
};

export type LikedSongEntry = {
  likedAt: number;
  songId: LibrarySongId;
};

export type UserPlaylist = {
  createdAt: number;
  id: string;
  isPrivate?: boolean;
  name: string;
  songIds: LibrarySongId[];
  updatedAt: number;
};

export type LibrarySongListItem = {
  isLiked: boolean;
  librarySong: LibrarySong;
  songIndex: number;
};
