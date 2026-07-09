import { useState } from "react";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import type {
  LibrarySong,
  LibrarySongId,
  UserPlaylist,
} from "../types/library";

type PendingDeleteConfirmation =
  | {
      playlistId: string;
      playlistName: string;
      type: "playlist";
    }
  | {
      songId: LibrarySongId;
      songIndex: number;
      songName: string;
      type: "local-song";
    };

type PendingRenamePlaylist = {
  playlistId: string;
  playlistName: string;
};

type UseLibraryDialogsOptions = {
  isLocalSongDeleteBlocked?: boolean;
  librarySongs: LibrarySong[];
  onDeleteLocalSong: (
    songIndex: number,
    songId: LibrarySongId,
    options: { stopPlaybackBeforeDelete: boolean },
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRenamePlaylist: (playlistId: string, nextName: string) => void;
  playlists: UserPlaylist[];
  selectedSongId: LibrarySongId | null;
  text: UiText["library"];
};

export function useLibraryDialogs({
  isLocalSongDeleteBlocked = false,
  librarySongs,
  onDeleteLocalSong,
  onDeletePlaylist,
  onRenamePlaylist,
  playlists,
  selectedSongId,
  text,
}: UseLibraryDialogsOptions) {
  const [pendingDeleteConfirmation, setPendingDeleteConfirmation] =
    useState<PendingDeleteConfirmation | null>(null);
  const [pendingRenamePlaylist, setPendingRenamePlaylist] =
    useState<PendingRenamePlaylist | null>(null);

  function requestRenamePlaylist(playlistId: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    setPendingRenamePlaylist({
      playlistId,
      playlistName: playlist.name,
    });
  }

  function cancelRename() {
    setPendingRenamePlaylist(null);
  }

  function confirmRename(nextName: string) {
    if (pendingRenamePlaylist === null) {
      return;
    }

    onRenamePlaylist(pendingRenamePlaylist.playlistId, nextName);
    setPendingRenamePlaylist(null);
  }

  function requestDeletePlaylist(playlistId: string) {
    const playlist = playlists.find(
      (currentPlaylist) => currentPlaylist.id === playlistId,
    );

    if (!playlist) {
      return;
    }

    setPendingDeleteConfirmation({
      playlistId,
      playlistName: playlist.name,
      type: "playlist",
    });
  }

  function requestDeleteLocalSong(songIndex: number) {
    if (isLocalSongDeleteBlocked) {
      return;
    }

    const librarySong = librarySongs[songIndex];

    if (!librarySong || librarySong.source !== "local-import") {
      return;
    }

    setPendingDeleteConfirmation({
      songId: librarySong.id,
      songIndex,
      songName: librarySong.song.name,
      type: "local-song",
    });
  }

  function confirmDelete() {
    if (pendingDeleteConfirmation === null) {
      return;
    }

    if (pendingDeleteConfirmation.type === "playlist") {
      onDeletePlaylist(pendingDeleteConfirmation.playlistId);
      setPendingDeleteConfirmation(null);
      return;
    }

    if (isLocalSongDeleteBlocked) {
      return;
    }

    const currentSongIndex =
      librarySongs[pendingDeleteConfirmation.songIndex]?.id ===
      pendingDeleteConfirmation.songId
        ? pendingDeleteConfirmation.songIndex
        : librarySongs.findIndex(
            (librarySong) =>
              librarySong.id === pendingDeleteConfirmation.songId,
          );
    const stopPlaybackBeforeDelete =
      selectedSongId === pendingDeleteConfirmation.songId;

    if (currentSongIndex >= 0) {
      onDeleteLocalSong(
        currentSongIndex,
        pendingDeleteConfirmation.songId,
        { stopPlaybackBeforeDelete },
      );
    }

    setPendingDeleteConfirmation(null);
  }

  function cancelDelete() {
    setPendingDeleteConfirmation(null);
  }

  const deleteDialogDescription =
    pendingDeleteConfirmation === null
      ? ""
      : pendingDeleteConfirmation.type === "playlist"
        ? formatText(text.deletePlaylistConfirm, {
            playlistName: pendingDeleteConfirmation.playlistName,
          })
        : formatText(text.deleteLocalSongConfirm, {
            songName: pendingDeleteConfirmation.songName,
          });
  const deleteDialogTitle =
    pendingDeleteConfirmation?.type === "playlist"
      ? text.deletePlaylist
      : text.deleteLocalSong;

  return {
    cancelDelete,
    cancelRename,
    confirmDelete,
    confirmRename,
    deleteDialogDescription,
    deleteDialogTitle,
    isDeleteDialogOpen: pendingDeleteConfirmation !== null,
    pendingRenamePlaylist,
    requestDeleteLocalSong,
    requestDeletePlaylist,
    requestRenamePlaylist,
  };
}
