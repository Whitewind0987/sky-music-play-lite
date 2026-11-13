// SPDX-FileCopyrightText: 2026 Whitewind0987
// SPDX-FileCopyrightText: 2026 wjhhuizi (LemonGo)
// SPDX-License-Identifier: GPL-3.0-only

import type { Song } from "./score";

export type LibrarySongId = string;
export type LibrarySongSource = "built-in" | "local-import";
export type LocalLibraryGroup = "imported" | "converted" | "playlist-copy";

export type LocalSongMetadata = {
  bitsPerPage: number;
  bpm: number;
  contentFingerprint?: string;
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
  libraryGroup?: LocalLibraryGroup;
  metadata: LocalSongMetadata;
  /**
   * 歌单私有副本的来源曲谱 ID。
   *
   * 歌单里保存的是副本 ID，用它判断「同一首原曲是否已在歌单中」会失效，
   * 因此副本必须记住自己源自哪首原曲。
   */
  sourceSongId?: LibrarySongId;
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
