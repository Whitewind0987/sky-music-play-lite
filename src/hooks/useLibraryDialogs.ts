import { useRef, useState } from "react";
import type { UiText } from "../i18n/uiText";
import {
  canCloseDeleteConfirmation,
  runSingleFlightDelete,
} from "../lib/deleteConfirmationFlow";
import { formatText } from "../lib/formatText";
import { shouldBlockLibraryDeleteRequest } from "../lib/libraryDeletionBlocking";
import type {
  LibrarySong,
  LibrarySongId,
  UserPlaylist,
} from "../types/library";
import { getLibrarySongName } from "../lib/libraryCollections";

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
  ) => Promise<boolean>;
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
  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false);
  const isDeleteInProgressRef = useRef(false);
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
    if (
      shouldBlockLibraryDeleteRequest({
        isLocalSongDeleteBlocked,
        requestType: "playlist",
      }) ||
      !canCloseDeleteConfirmation(isDeleteInProgressRef)
    ) {
      return;
    }

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
    if (
      shouldBlockLibraryDeleteRequest({
        isLocalSongDeleteBlocked,
        requestType: "local-song",
      }) ||
      !canCloseDeleteConfirmation(isDeleteInProgressRef)
    ) {
      return;
    }

    const librarySong = librarySongs[songIndex];

    if (!librarySong || librarySong.source !== "local-import") {
      return;
    }

    setPendingDeleteConfirmation({
      songId: librarySong.id,
      songIndex,
      songName: getLibrarySongName(librarySong),
      type: "local-song",
    });
  }

  async function confirmDelete() {
    if (pendingDeleteConfirmation === null) {
      return;
    }

    if (pendingDeleteConfirmation.type === "playlist") {
      onDeletePlaylist(pendingDeleteConfirmation.playlistId);
      setPendingDeleteConfirmation(null);
      return;
    }

    if (
      shouldBlockLibraryDeleteRequest({
        isLocalSongDeleteBlocked,
        requestType: "local-song",
      })
    ) {
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

    const deleteResult = await runSingleFlightDelete(
      isDeleteInProgressRef,
      setIsDeleteInProgress,
      () =>
        onDeleteLocalSong(
          currentSongIndex,
          pendingDeleteConfirmation.songId,
          { stopPlaybackBeforeDelete },
        ),
    );

    if (deleteResult === "success") {
      setPendingDeleteConfirmation(null);
    }
  }

  function cancelDelete() {
    if (!canCloseDeleteConfirmation(isDeleteInProgressRef)) {
      return;
    }

    setPendingDeleteConfirmation(null);
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (open || !canCloseDeleteConfirmation(isDeleteInProgressRef)) {
      return;
    }

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
    handleDeleteDialogOpenChange,
    isDeleteDialogOpen: pendingDeleteConfirmation !== null,
    isDeleteInProgress,
    pendingRenamePlaylist,
    requestDeleteLocalSong,
    requestDeletePlaylist,
    requestRenamePlaylist,
  };
}
