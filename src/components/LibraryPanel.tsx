import {
  BookmarkPlus,
  Heart,
  ListPlus,
  MoreHorizontal,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { LibraryCategoryId } from "./AppShell";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import type { UiText } from "../i18n/uiText";
import { getAdjustedPreviewDurationMs } from "../lib/playbackScheduler";
import type {
  LibrarySongId,
  LibrarySongListItem,
  UserPlaylist,
} from "../types/library";

type LibraryPanelProps = {
  builtInPagination: {
    end: number;
    onNextPage: () => void;
    onPreviousPage: () => void;
    page: number;
    pageCount: number;
    pageSize: number;
    start: number;
    total: number;
  } | null;
  hasSearchQuery: boolean;
  importDisabled: boolean;
  importError: string;
  items: LibrarySongListItem[];
  onAddSongToPlaylist: (playlistId: string, songIndex: number) => void;
  onAddToQueue: (songIndex: number) => void;
  onCreatePlaylistWithSong: (
    songIndex: number,
    playlistName?: string,
  ) => void;
  onDeleteLocalSong: (songIndex: number) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onImportFiles: (files: File[]) => void;
  onPlaySong: (item: LibrarySongListItem) => void;
  onPlaySongNext: (songIndex: number) => void;
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
  isBuiltInSongLoading: (songId: LibrarySongId) => boolean;
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
    <Heart
      className="library-heart-icon"
      aria-hidden="true"
      focusable="false"
      fill={isLiked ? "currentColor" : "none"}
    />
  );
}

function LibraryRowPlayIcon() {
  return (
    <Play
      className="library-row-play-icon"
      aria-hidden="true"
      focusable="false"
    />
  );
}

function LibraryPlayNextIcon() {
  return (
    <SkipForward
      className="library-title-icon"
      aria-hidden="true"
      focusable="false"
    />
  );
}

function LibraryAddToQueueIcon() {
  return (
    <ListPlus
      className="library-title-icon"
      aria-hidden="true"
      focusable="false"
    />
  );
}

function LibraryCollectIcon() {
  return (
    <BookmarkPlus
      className="library-title-icon"
      aria-hidden="true"
      focusable="false"
    />
  );
}

function LibraryMoreIcon() {
  return (
    <MoreHorizontal
      className="library-title-icon"
      aria-hidden="true"
      focusable="false"
    />
  );
}

function LibraryPlusIcon() {
  return (
    <Plus
      className="library-title-icon"
      aria-hidden="true"
      focusable="false"
    />
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

function PlaylistHeader({
  onDeletePlaylist,
  onPlayAll,
  onRenamePlaylist,
  selectedPlaylist,
  selectedPlaylistId,
  visibleSongCount,
  text,
}: Pick<
  LibraryPanelProps,
  | "onDeletePlaylist"
  | "onRenamePlaylist"
  | "selectedPlaylist"
  | "selectedPlaylistId"
  | "text"
> & {
  onPlayAll: () => void;
  visibleSongCount: number;
}) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    setIsMoreMenuOpen(false);
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    function handlePointerDown(event: Event) {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-playlist-menu-root='true']")
      ) {
        return;
      }

      setIsMoreMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  if (!selectedPlaylist) {
    return null;
  }

  return (
    <div className="playlist-detail-header">
      <div className="playlist-cover-placeholder" aria-hidden="true">
        <LibraryCollectIcon />
      </div>
      <div className="playlist-detail-main">
        <div className="playlist-detail-title-row">
          <h3>{selectedPlaylist.name}</h3>
        </div>
        <p>
          {text.playlistSongCountMeta.replace(
            "{count}",
            String(visibleSongCount),
          )}
        </p>
      </div>
      <div className="playlist-detail-actions">
        <button
          type="button"
          disabled={visibleSongCount === 0}
          onClick={onPlayAll}
        >
          {text.playAll}
        </button>
        <button
          type="button"
          onClick={() => onRenamePlaylist(selectedPlaylist.id)}
        >
          {text.renamePlaylist}
        </button>
        <span className="playlist-more-anchor" data-playlist-menu-root="true">
          <button
            type="button"
            aria-label={text.playlistMore}
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              setIsMoreMenuOpen((isOpen) => !isOpen);
            }}
          >
            {text.playlistMore}
          </button>
          {isMoreMenuOpen ? (
            <div className="playlist-more-menu" role="menu">
              <button
                className="is-danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onDeletePlaylist(selectedPlaylist.id);
                }}
              >
                {text.deletePlaylist}
              </button>
            </div>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function AddToPlaylistPopup({
  item,
  onAddSongToPlaylist,
  onClose,
  onCreatePlaylist,
  playlists,
  text,
}: Pick<
  LibraryPanelProps,
  "onAddSongToPlaylist" | "playlists" | "text"
> & {
  item: LibrarySongListItem;
  onClose: () => void;
  onCreatePlaylist: () => void;
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
          onClick={onCreatePlaylist}
        >
          <LibraryPlusIcon />
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
                  const isAlreadyInPlaylist = playlist.songIds.includes(
                    item.librarySong.id,
                  );

                  onAddSongToPlaylist(playlist.id, item.songIndex);

                  if (!isAlreadyInPlaylist) {
                    onClose();
                  }
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
  function stopMenuPropagation(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function runAction(
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.blur();
    action();
    onClose();
  }

  return (
    <div
      className="library-action-menu"
      role="menu"
      onClick={stopMenuPropagation}
      onMouseDown={stopMenuPropagation}
      onPointerDown={stopMenuPropagation}
    >
      <button
        type="button"
        role="menuitem"
        onClick={(event) => runAction(event, () => onPlaySong(item))}
      >
        {text.playAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(event) => runAction(event, () => onPlaySongNext(item.songIndex))}
      >
        {text.playNextAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(event) => runAction(event, () => onAddToQueue(item.songIndex))}
      >
        {text.addToQueueAction}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(event) => runAction(event, () => onOpenCollectDialog(item))}
      >
        {text.addToPlaylist}
      </button>
      {selectedCategory === "liked" ? (
        <button
          type="button"
          role="menuitem"
          onClick={(event) =>
            runAction(event, () => onRemoveFromLiked(item.librarySong.id))
          }
        >
          {text.removeFromLiked}
        </button>
      ) : null}
      {selectedCategory === "playlists" && selectedPlaylist ? (
        <button
          type="button"
          role="menuitem"
          onClick={(event) =>
            runAction(event, () =>
              onRemoveSongFromPlaylist(selectedPlaylist.id, item.librarySong.id),
            )
          }
        >
          {text.removeFromPlaylist}
        </button>
      ) : null}
      {item.librarySong.source === "local-import" ? (
        <button
          className="is-danger"
          type="button"
          role="menuitem"
          onClick={(event) =>
            runAction(event, () => onDeleteLocalSong(item.songIndex))
          }
        >
          {text.deleteFromLocalImports}
        </button>
      ) : null}
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
  isBuiltInSongLoading,
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
  | "isBuiltInSongLoading"
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
          const isLoading = isBuiltInSongLoading(librarySong.id);
          const durationMs =
            librarySong.source === "built-in" &&
            !librarySong.isBuiltInLoaded &&
            typeof librarySong.builtInDurationMs === "number"
              ? librarySong.builtInDurationMs
              : getAdjustedPreviewDurationMs(song.songNotes);
          const duration = formatDuration(
            durationMs,
          );
          const rowNumber = String(displayIndex + 1).padStart(2, "0");

          return (
            <div
              className={`library-song-row${isSelected ? " is-selected" : ""}${
                openActionMenuSongId === librarySong.id ? " has-open-menu" : ""
              }`}
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
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
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
                  <span
                    className="library-action-menu-anchor"
                    data-library-menu-root="true"
                  >
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
                {isSelected && isLoading ? (
                  <span className="library-loading-badge">
                    {text.loadingScore}
                  </span>
                ) : null}
              </span>
              <span className="library-song-source">
                {librarySong.source === "built-in"
                  ? text.builtInSource
                  : text.localImport}
              </span>
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
  builtInPagination,
  hasSearchQuery,
  importDisabled,
  importError,
  items,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylistWithSong,
  onDeleteLocalSong,
  onDeletePlaylist,
  onImportFiles,
  onPlaySong,
  onPlaySongNext,
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
  isBuiltInSongLoading,
  text,
}: LibraryPanelProps) {
  const [collectingSongItem, setCollectingSongItem] =
    useState<LibrarySongListItem | null>(null);
  const [creatingPlaylistForItem, setCreatingPlaylistForItem] =
    useState<LibrarySongListItem | null>(null);
  const [openActionMenuSongId, setOpenActionMenuSongId] =
    useState<LibrarySongId | null>(null);
  const isLocalImports = selectedCategory === "local-imports";
  const isPlaylists = selectedCategory === "playlists";
  const isBuiltIn = selectedCategory === "built-in";
  const emptyState = text.categoryEmptyStates[selectedCategory];
  const contentTitle =
    isBuiltIn && (items.length > 0 || hasSearchQuery)
      ? text.categoryBuiltIn
      : isPlaylists && selectedPlaylist
        ? selectedPlaylist.name
        : emptyState.title;
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
        setCreatingPlaylistForItem(null);
        setOpenActionMenuSongId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!hasOpenActionMenu) {
      return;
    }

    function handlePointerDown(event: Event) {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-library-menu-root='true']")
      ) {
        return;
      }

      setOpenActionMenuSongId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [hasOpenActionMenu]);

  return (
    <section className="library-panel" aria-label={text.aria}>
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
            {!isLocalImports &&
            !isPlaylists &&
            (!isBuiltIn || (items.length === 0 && !hasSearchQuery)) ? (
              <p>{emptyState.description}</p>
            ) : null}
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
        {isPlaylists && selectedPlaylist ? (
          <PlaylistHeader
            onDeletePlaylist={onDeletePlaylist}
            onPlayAll={() => {
              if (items[0]) {
                onPlaySong(items[0]);
              }
            }}
            onRenamePlaylist={onRenamePlaylist}
            selectedPlaylist={selectedPlaylist}
            selectedPlaylistId={selectedPlaylistId}
            visibleSongCount={items.length}
            text={text}
          />
        ) : null}
        {isBuiltIn && items.length === 0 && !hasSearchQuery ? (
          <div className="library-empty">
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
          </div>
        ) : isPlaylists && !selectedPlaylist ? (
          <div className="library-empty">
            <h3>
              {playlists.length === 0
                ? text.noPlaylistsTitle
                : text.playlistEmptyTitle}
            </h3>
            <p>
              {playlists.length === 0
                ? text.noPlaylistsDescription
                : text.playlistEmptyDescription}
            </p>
          </div>
        ) : (
          <LibrarySongTable
            emptyDescription={listEmptyState.description}
            emptyTitle={listEmptyState.title}
            items={items}
            isBuiltInSongLoading={isBuiltInSongLoading}
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
        {isBuiltIn &&
        builtInPagination &&
        (builtInPagination.total > builtInPagination.pageSize ||
          hasSearchQuery) ? (
          <div className="library-pagination" aria-label={text.paginationAria}>
            {hasSearchQuery ? (
              <span>
                {text.paginationSearchResults.replace(
                  "{total}",
                  String(builtInPagination.total),
                )}
              </span>
            ) : null}
            <button
              type="button"
              disabled={builtInPagination.page <= 1}
              onClick={builtInPagination.onPreviousPage}
            >
              {text.paginationPrevious}
            </button>
            <span>
              {text.paginationPage
                .replace("{page}", String(builtInPagination.page))
                .replace("{pageCount}", String(builtInPagination.pageCount))}
            </span>
            <span>
              {text.paginationShowing
                .replace("{start}", String(builtInPagination.start))
                .replace("{end}", String(builtInPagination.end))
                .replace("{total}", String(builtInPagination.total))}
            </span>
            <button
              type="button"
              disabled={builtInPagination.page >= builtInPagination.pageCount}
              onClick={builtInPagination.onNextPage}
            >
              {text.paginationNext}
            </button>
          </div>
        ) : null}
      </div>
      {collectingSongItem ? (
        <AddToPlaylistPopup
          item={collectingSongItem}
          onAddSongToPlaylist={onAddSongToPlaylist}
          onClose={() => setCollectingSongItem(null)}
          onCreatePlaylist={() => setCreatingPlaylistForItem(collectingSongItem)}
          playlists={playlists}
          text={text}
        />
      ) : null}
      {creatingPlaylistForItem ? (
        <CreatePlaylistDialog
          onClose={() => setCreatingPlaylistForItem(null)}
          onCreate={(playlistName) => {
            onCreatePlaylistWithSong(
              creatingPlaylistForItem.songIndex,
              playlistName,
            );
            setCreatingPlaylistForItem(null);
            setCollectingSongItem(null);
          }}
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
