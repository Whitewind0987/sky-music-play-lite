import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "./AppShell";
import type { UiText } from "../i18n/uiText";
import { getAdjustedPreviewDurationMs } from "../lib/playbackScheduler";
import type {
  LibrarySongId,
  LibrarySongListItem,
  UserPlaylist,
} from "../types/library";

type LibraryPanelProps = {
  hasSearchQuery: boolean;
  importDisabled: boolean;
  importError: string;
  items: LibrarySongListItem[];
  onAddSongToPlaylist: (playlistId: string, songIndex: number) => void;
  onAddToQueue: (songIndex: number) => void;
  onCreatePlaylist: () => void;
  onCreatePlaylistWithSong: (songIndex: number) => void;
  onDeleteLocalSong: (songIndex: number) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onImportFiles: (files: File[]) => void;
  onPlaySong: (item: LibrarySongListItem) => void;
  onPlaySongNext: (songIndex: number) => void;
  onPlaylistSelect: (playlistId: string) => void;
  onRemoveFromLiked: (songId: LibrarySongId) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: LibrarySongId) => void;
  onRenamePlaylist: (playlistId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSong: (songIndex: number) => void;
  onToggleLiked: (songIndex: number) => void;
  playlists: UserPlaylist[];
  searchQuery: string;
  selectedCategory: LibraryCategoryId;
  selectedPlaylist: UserPlaylist | null;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  text: UiText["library"];
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function readFilesFromInput(fileList: FileList | null) {
  return Array.from(fileList ?? []);
}

function HeartIcon({ isLiked }: { isLiked: boolean }) {
  return (
    <svg
      className="library-heart-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 17.2 8.8 16.1C4.4 12.1 2 9.9 2 6.7 2 4.2 4 2.3 6.5 2.3c1.4 0 2.7.6 3.5 1.6.8-1 2.1-1.6 3.5-1.6C16 2.3 18 4.2 18 6.7c0 3.2-2.4 5.4-6.8 9.4L10 17.2Z"
        fill={isLiked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function LibraryRowPlayIcon() {
  return (
    <svg
      className="library-row-play-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.2 3.4v9.2L12 8 5.2 3.4Z" fill="currentColor" />
    </svg>
  );
}

function LibraryPlayNextIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 3.8v8.4l5.8-4.2L3 3.8Zm7 0h1.4v8.4H10V3.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LibraryAddToQueueIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4h6.8v1.2H2.5V4Zm0 3.2h6.8v1.2H2.5V7.2Zm0 3.2h4.8v1.2H2.5v-1.2Zm9.2-2.9h1.2v2h2v1.2h-2v2h-1.2v-2h-2V9.5h2v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LibraryCollectIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 3.5h7.5a2 2 0 0 1 2 2v7.1l-4-2.2-4 2.2V5.5a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M8.5 6v3M7 7.5h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function LibraryMoreIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 8a1.2 1.2 0 1 1-2.4 0A1.2 1.2 0 0 1 4 8Zm5.2 0a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Zm5.2 0a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LibraryImportArea({
  importDisabled,
  importError,
  onImportFiles,
  text,
}: Pick<
  LibraryPanelProps,
  "importDisabled" | "importError" | "onImportFiles" | "text"
>) {
  return (
    <section className="library-import-area" aria-label={text.importTitle}>
      <div>
        <p className="eyebrow">{text.importEyebrow}</p>
        <h3>{text.importTitle}</h3>
        <p>{text.importDescription}</p>
      </div>
      <label
        className={`library-import-button${importDisabled ? " is-disabled" : ""}`}
        aria-disabled={importDisabled}
      >
        <span>{text.importLabel}</span>
        <input
          accept=".json,.txt"
          disabled={importDisabled}
          multiple
          type="file"
          onChange={(event) => {
            const files = readFilesFromInput(event.currentTarget.files);

            if (files.length > 0) {
              onImportFiles(files);
            }

            event.currentTarget.value = "";
          }}
        />
      </label>
      {importError ? <p className="parse-error">{importError}</p> : null}
    </section>
  );
}

function PlaylistManager({
  onCreatePlaylist,
  onDeletePlaylist,
  onPlaylistSelect,
  onRenamePlaylist,
  playlists,
  selectedPlaylistId,
  text,
}: Pick<
  LibraryPanelProps,
  | "onCreatePlaylist"
  | "onDeletePlaylist"
  | "onPlaylistSelect"
  | "onRenamePlaylist"
  | "playlists"
  | "selectedPlaylistId"
  | "text"
>) {
  return (
    <section className="playlist-manager" aria-label={text.playlistsTitle}>
      <div className="playlist-manager-header">
        <h3>{text.playlistsTitle}</h3>
        <button type="button" onClick={onCreatePlaylist}>
          {text.createPlaylist}
        </button>
      </div>
      {playlists.length === 0 ? (
        <p className="library-empty-note">{text.noPlaylists}</p>
      ) : (
        <div className="playlist-list">
          {playlists.map((playlist) => (
            <div
              className={`playlist-list-item${
                playlist.id === selectedPlaylistId ? " is-selected" : ""
              }`}
              key={playlist.id}
            >
              <button type="button" onClick={() => onPlaylistSelect(playlist.id)}>
                {playlist.name}
              </button>
              <span>{playlist.songIds.length}</span>
              <button type="button" onClick={() => onRenamePlaylist(playlist.id)}>
                {text.renamePlaylist}
              </button>
              <button
                className="library-danger-button"
                type="button"
                onClick={() => onDeletePlaylist(playlist.id)}
              >
                {text.deletePlaylist}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddToPlaylistPopup({
  item,
  onAddSongToPlaylist,
  onClose,
  onCreatePlaylistWithSong,
  playlists,
  text,
}: Pick<
  LibraryPanelProps,
  "onAddSongToPlaylist" | "onCreatePlaylistWithSong" | "playlists" | "text"
> & {
  item: LibrarySongListItem;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="library-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="library-collect-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={text.addToPlaylistDialogTitle}
      >
        <div className="library-collect-dialog-header">
          <h3>{text.addToPlaylistDialogTitle}</h3>
          <button type="button" onClick={onClose} aria-label={text.closeDialog}>
            {text.closeDialog}
          </button>
        </div>
        <button
          className="library-collect-create"
          type="button"
          onClick={() => {
            onCreatePlaylistWithSong(item.songIndex);
            onClose();
          }}
        >
          {text.createPlaylistAndAdd}
        </button>
        {playlists.length === 0 ? (
          <p className="library-empty-note">{text.noPlaylists}</p>
        ) : (
          <div className="library-collect-list">
            {playlists.map((playlist) => (
              <button
                className="library-collect-row"
                key={playlist.id}
                type="button"
                onClick={() => {
                  onAddSongToPlaylist(playlist.id, item.songIndex);
                  onClose();
                }}
              >
                <span>{playlist.name}</span>
                <small>
                  {playlist.songIds.length} {text.playlistSongCount}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryActionMenu({
  item,
  onAddToQueue,
  onClose,
  onDeleteLocalSong,
  onOpenCollectDialog,
  onPlaySong,
  onPlaySongNext,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  selectedCategory,
  selectedPlaylist,
  text,
}: Pick<
  LibraryPanelProps,
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onRemoveFromLiked"
  | "onRemoveSongFromPlaylist"
  | "selectedCategory"
  | "selectedPlaylist"
  | "text"
> & {
  item: LibrarySongListItem;
  onClose: () => void;
  onOpenCollectDialog: (item: LibrarySongListItem) => void;
}) {
  function runAction(action: () => void) {
    action();
    onClose();
  }

  return (
    <div className="library-action-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => runAction(() => onPlaySong(item))}>
        {text.playAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(() => onPlaySongNext(item.songIndex))}
      >
        {text.playNextAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(() => onAddToQueue(item.songIndex))}
      >
        {text.addToQueueAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(() => onOpenCollectDialog(item))}
      >
        {text.addToPlaylist}
      </button>
      {selectedCategory === "liked" ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onRemoveFromLiked(item.librarySong.id))}
        >
          {text.removeFromLiked}
        </button>
      ) : null}
      {selectedCategory === "playlists" && selectedPlaylist ? (
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            runAction(() =>
              onRemoveSongFromPlaylist(selectedPlaylist.id, item.librarySong.id),
            )
          }
        >
          {text.removeFromPlaylist}
        </button>
      ) : null}
      <button
        className="is-danger"
        type="button"
        role="menuitem"
        onClick={() => runAction(() => onDeleteLocalSong(item.songIndex))}
      >
        {text.deleteFromLocalImports}
      </button>
    </div>
  );
}

function LibrarySongTable({
  items,
  onAddToQueue,
  onCloseActionMenu,
  onDeleteLocalSong,
  onOpenActionMenu,
  onOpenCollectDialog,
  onPlaySong,
  onPlaySongNext,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onSelectSong,
  onToggleLiked,
  emptyDescription,
  emptyTitle,
  selectedCategory,
  selectedPlaylist,
  selectedSongIndex,
  text,
  openActionMenuSongId,
}: Pick<
  LibraryPanelProps,
  | "items"
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onRemoveFromLiked"
  | "onRemoveSongFromPlaylist"
  | "onSelectSong"
  | "onToggleLiked"
  | "selectedCategory"
  | "selectedPlaylist"
  | "selectedSongIndex"
  | "text"
> & {
  emptyDescription: string;
  emptyTitle: string;
  onCloseActionMenu: () => void;
  onOpenActionMenu: (songId: LibrarySongId) => void;
  onOpenCollectDialog: (item: LibrarySongListItem) => void;
  openActionMenuSongId: LibrarySongId | null;
}) {
  if (items.length === 0) {
    return (
      <div className="library-empty">
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <section className="library-table" aria-label={text.tableTitle}>
      <div className="library-table-header">
        <span>{text.columns.index}</span>
        <span>{text.columns.title}</span>
        <span>{text.columns.source}</span>
        <span>{text.columns.liked}</span>
        <span>{text.columns.duration}</span>
      </div>
      <div className="library-table-body">
        {items.map((item, displayIndex) => {
          const { librarySong, songIndex } = item;
          const song = librarySong.song;
          const isSelected = selectedSongIndex === songIndex;
          const duration = formatDuration(
            getAdjustedPreviewDurationMs(song.songNotes),
          );
          const rowNumber = String(displayIndex + 1).padStart(2, "0");

          return (
            <div
              className={`library-song-row${isSelected ? " is-selected" : ""}`}
              key={librarySong.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSong(songIndex)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectSong(songIndex);
                }
              }}
            >
              <span className="library-song-index">
                <span className="library-song-number">{rowNumber}</span>
                <button
                  className="library-row-play"
                  type="button"
                  aria-label={`${text.playThisScoreAction}: ${song.name}`}
                  title={text.playThisScoreAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.currentTarget.blur();
                    onPlaySong(item);
                  }}
                >
                  <LibraryRowPlayIcon />
                </button>
              </span>
              <span className="library-song-title">
                <span className="library-song-title-text">{song.name}</span>
                <span className="library-row-title-actions">
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.playNextAction}
                    title={text.playNextAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.blur();
                      onPlaySongNext(songIndex);
                    }}
                  >
                    <LibraryPlayNextIcon />
                  </button>
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.addToQueueAction}
                    title={text.addToQueueAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.blur();
                      onAddToQueue(songIndex);
                    }}
                  >
                    <LibraryAddToQueueIcon />
                  </button>
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.addToPlaylist}
                    title={text.addToPlaylist}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.blur();
                      onOpenCollectDialog(item);
                    }}
                  >
                    <LibraryCollectIcon />
                  </button>
                  <span className="library-action-menu-anchor">
                    <button
                      className="library-title-icon-button"
                      type="button"
                      aria-label={text.moreActions}
                      title={text.moreActions}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.currentTarget.blur();
                        onOpenActionMenu(librarySong.id);
                      }}
                    >
                      <LibraryMoreIcon />
                    </button>
                    {openActionMenuSongId === librarySong.id ? (
                      <LibraryActionMenu
                        item={item}
                        onAddToQueue={onAddToQueue}
                        onClose={onCloseActionMenu}
                        onDeleteLocalSong={onDeleteLocalSong}
                        onOpenCollectDialog={onOpenCollectDialog}
                        onPlaySong={onPlaySong}
                        onPlaySongNext={onPlaySongNext}
                        onRemoveFromLiked={onRemoveFromLiked}
                        onRemoveSongFromPlaylist={onRemoveSongFromPlaylist}
                        selectedCategory={selectedCategory}
                        selectedPlaylist={selectedPlaylist}
                        text={text}
                      />
                    ) : null}
                  </span>
                </span>
                {isSelected ? (
                  <span className="library-selected-badge">{text.selected}</span>
                ) : null}
              </span>
              <span className="library-song-source">{text.localImport}</span>
              <span className="library-song-liked">
                <button
                  className={`library-heart-button${
                    item.isLiked ? " is-liked" : ""
                  }`}
                  type="button"
                  aria-label={`${
                    item.isLiked ? text.unlikeAction : text.likeAction
                  }: ${song.name}`}
                  title={item.isLiked ? text.unlikeAction : text.likeAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.currentTarget.blur();
                    onToggleLiked(songIndex);
                  }}
                >
                  <HeartIcon isLiked={item.isLiked} />
                </button>
              </span>
              <span className="library-song-duration">{duration}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LibraryPanel({
  hasSearchQuery,
  importDisabled,
  importError,
  items,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylist,
  onCreatePlaylistWithSong,
  onDeleteLocalSong,
  onDeletePlaylist,
  onImportFiles,
  onPlaySong,
  onPlaySongNext,
  onPlaylistSelect,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onRenamePlaylist,
  onSearchQueryChange,
  onSelectSong,
  onToggleLiked,
  playlists,
  searchQuery,
  selectedCategory,
  selectedPlaylist,
  selectedPlaylistId,
  selectedSongIndex,
  text,
}: LibraryPanelProps) {
  const [collectingSongItem, setCollectingSongItem] =
    useState<LibrarySongListItem | null>(null);
  const [openActionMenuSongId, setOpenActionMenuSongId] =
    useState<LibrarySongId | null>(null);
  const isLocalImports = selectedCategory === "local-imports";
  const isPlaylists = selectedCategory === "playlists";
  const isBuiltIn = selectedCategory === "built-in";
  const emptyState = text.categoryEmptyStates[selectedCategory];
  const contentTitle =
    isPlaylists && selectedPlaylist ? selectedPlaylist.name : emptyState.title;
  const listEmptyState = getLibraryEmptyState({
    hasSearchQuery,
    selectedCategory,
    text,
  });
  const hasOpenActionMenu = openActionMenuSongId !== null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCollectingSongItem(null);
        setOpenActionMenuSongId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <section className="library-panel" aria-label={text.aria}>
      {hasOpenActionMenu ? (
        <button
          className="library-menu-scrim"
          type="button"
          aria-label={text.closeMenu}
          onClick={() => setOpenActionMenuSongId(null)}
        />
      ) : null}
      {isLocalImports ? (
        <LibraryImportArea
          importDisabled={importDisabled}
          importError={importError}
          onImportFiles={onImportFiles}
          text={text}
        />
      ) : null}
      <div className="library-content">
        <div className="library-content-header">
          <div>
            <h3>{isLocalImports ? text.tableTitle : contentTitle}</h3>
            {!isLocalImports && !isPlaylists ? <p>{emptyState.description}</p> : null}
          </div>
          <label className="library-search">
            <span className="sr-only">{text.searchPlaceholder}</span>
            <input
              type="search"
              value={searchQuery}
              placeholder={text.searchPlaceholder}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            />
          </label>
        </div>
        {isPlaylists ? (
          <PlaylistManager
            onCreatePlaylist={onCreatePlaylist}
            onDeletePlaylist={onDeletePlaylist}
            onPlaylistSelect={onPlaylistSelect}
            onRenamePlaylist={onRenamePlaylist}
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            text={text}
          />
        ) : null}
        {isBuiltIn ? (
          <div className="library-empty">
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
          </div>
        ) : isPlaylists && !selectedPlaylist ? (
          <div className="library-empty">
            <h3>{text.playlistEmptyTitle}</h3>
            <p>{text.playlistEmptyDescription}</p>
          </div>
        ) : (
          <LibrarySongTable
            emptyDescription={listEmptyState.description}
            emptyTitle={listEmptyState.title}
            items={items}
            onAddToQueue={onAddToQueue}
            onCloseActionMenu={() => setOpenActionMenuSongId(null)}
            onDeleteLocalSong={onDeleteLocalSong}
            onOpenActionMenu={(songId) =>
              setOpenActionMenuSongId((currentSongId) =>
                currentSongId === songId ? null : songId,
              )
            }
            onOpenCollectDialog={(item) => {
              setOpenActionMenuSongId(null);
              setCollectingSongItem(item);
            }}
            onPlaySong={onPlaySong}
            onPlaySongNext={onPlaySongNext}
            onRemoveFromLiked={onRemoveFromLiked}
            onRemoveSongFromPlaylist={onRemoveSongFromPlaylist}
            onSelectSong={onSelectSong}
            onToggleLiked={onToggleLiked}
            selectedCategory={selectedCategory}
            selectedPlaylist={selectedPlaylist}
            selectedSongIndex={selectedSongIndex}
            text={text}
            openActionMenuSongId={openActionMenuSongId}
          />
        )}
      </div>
      {collectingSongItem ? (
        <AddToPlaylistPopup
          item={collectingSongItem}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => setCollectingSongItem(null)}
          onCreatePlaylistWithSong={onCreatePlaylistWithSong}
          playlists={playlists}
          text={text}
        />
      ) : null}
    </section>
  );
}

function getLibraryEmptyState({
  hasSearchQuery,
  selectedCategory,
  text,
}: {
  hasSearchQuery: boolean;
  selectedCategory: LibraryCategoryId;
  text: UiText["library"];
}) {
  if (hasSearchQuery) {
    return {
      description: text.noSearchResultsDescription,
      title: text.noSearchResultsTitle,
    };
  }

  if (selectedCategory === "liked") {
    return {
      description: text.likedEmptyDescription,
      title: text.likedEmptyTitle,
    };
  }

  if (selectedCategory === "playlists") {
    return {
      description: text.playlistEmptyDescription,
      title: text.playlistEmptyTitle,
    };
  }

  return {
    description: text.emptyDescription,
    title: text.emptyTitle,
  };
}
