import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  BookmarkPlus,
  Heart,
  ListPlus,
  MoreHorizontal,
  Play,
  Plus,
  LocateFixed,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "./AppShell";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { UpgradeScoreToV2Dialog } from "./UpgradeScoreToV2Dialog";
import type {
  LocateScoreRequest,
  UpgradeSongToV2Result,
} from "../hooks/useScoreLibrary";
import type { UiText } from "../i18n/uiText";
import {
  getLibrarySongFormatVersion,
  getLibrarySongName,
} from "../lib/libraryCollections";
import type { V1ToV2ConversionOptions } from "../lib/v1ToV2Conversion";
import {
  getAdjustedPreviewDurationFromMetadata,
  getAdjustedPreviewDurationMs,
} from "../lib/playbackScheduler";
import type {
  AddSongToPlaylistResult,
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
  isQueueOpen: boolean;
  items: LibrarySongListItem[];
  locateScoreRequest: LocateScoreRequest | null;
  onAddSongToPlaylist: (
    playlistId: string,
    songIndex: number,
  ) => AddSongToPlaylistResult;
  onAddToQueue: (songIndex: number) => void;
  onCreatePlaylistWithSong: (
    songIndex: number,
    playlistName?: string,
  ) => void;
  onCreatePlaylistRequest: () => void;
  onDeleteLocalSong: (songIndex: number) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onImportFiles: (files: File[]) => void;
  onLocateSelectedSong: () => void;
  onPrepareSong: (songIndex: number) => void;
  onPlaySong: (item: LibrarySongListItem) => void;
  onPlaySongNext: (songIndex: number) => void;
  onRemoveFromLiked: (songId: LibrarySongId) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: LibrarySongId) => void;
  onRenamePlaylist: (playlistId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSong: (songIndex: number) => void;
  onToggleLiked: (songIndex: number) => void;
  onUpgradeBlocked: () => void;
  onUpgradeSongToV2: (
    songId: LibrarySongId,
    options: V1ToV2ConversionOptions,
  ) => Promise<UpgradeSongToV2Result>;
  playlists: UserPlaylist[];
  searchQuery: string;
  selectedCategory: LibraryCategoryId;
  selectedPlaylist: UserPlaylist | null;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  upgradeBlocked: boolean;
  isBuiltInSongLoading: (songId: LibrarySongId) => boolean;
  text: UiText["library"];
};

export function shouldShowUpgradeToV2Action(item: LibrarySongListItem) {
  return getLibrarySongFormatVersion(item.librarySong) === 1;
}

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

function LibraryLocateIcon() {
  return (
    <LocateFixed
      className="library-locate-floating-icon"
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
        <span className="playlist-more-anchor">
          <DropdownMenu.Root
            open={isMoreMenuOpen}
            onOpenChange={setIsMoreMenuOpen}
          >
            <DropdownMenu.Trigger asChild>
              <button type="button" aria-label={text.playlistMore}>
                {text.playlistMore}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="playlist-more-menu"
                align="end"
                sideOffset={6}
              >
                <DropdownMenu.Item asChild>
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onDeletePlaylist(selectedPlaylist.id);
                    }}
                  >
                    {text.deletePlaylist}
                  </button>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="library-dialog-backdrop">
          <Dialog.Content
            className="library-collect-dialog"
            aria-describedby={undefined}
          >
            <div className="library-collect-dialog-header">
              <Dialog.Title asChild>
                <h3>{text.addToPlaylistDialogTitle}</h3>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label={text.closeDialog}>
                  {text.closeDialog}
                </button>
              </Dialog.Close>
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
                      const result = onAddSongToPlaylist(
                        playlist.id,
                        item.songIndex,
                      );

                      if (
                        result.status === "added" ||
                        result.status === "duplicate"
                      ) {
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
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
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
  onPrepareSong,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onRequestUpgrade,
  selectedCategory,
  selectedPlaylist,
  text,
}: Pick<
  LibraryPanelProps,
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onPrepareSong"
  | "onRemoveFromLiked"
  | "onRemoveSongFromPlaylist"
  | "selectedCategory"
  | "selectedPlaylist"
  | "text"
> & {
  item: LibrarySongListItem;
  onClose: () => void;
  onOpenCollectDialog: (item: LibrarySongListItem) => void;
  onRequestUpgrade: (item: LibrarySongListItem) => void;
}) {
  function runAction(event: Event, action: () => void) {
    event.preventDefault();
    action();
    onClose();
  }

  return (
    <DropdownMenu.Content
      className="library-action-menu"
      align="end"
      sideOffset={6}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu.Item
        asChild
        onSelect={(event) => runAction(event, () => onPlaySong(item))}
      >
        <button
          type="button"
          onFocus={() => onPrepareSong(item.songIndex)}
          onPointerEnter={() => onPrepareSong(item.songIndex)}
        >
          {text.playAction}
        </button>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        asChild
        onSelect={(event) =>
          runAction(event, () => onPlaySongNext(item.songIndex))
        }
      >
        <button
          type="button"
          onFocus={() => onPrepareSong(item.songIndex)}
          onPointerEnter={() => onPrepareSong(item.songIndex)}
        >
          {text.playNextAction}
        </button>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        asChild
        onSelect={(event) => runAction(event, () => onAddToQueue(item.songIndex))}
      >
        <button type="button">{text.addToQueueAction}</button>
      </DropdownMenu.Item>
      <DropdownMenu.Item
        asChild
        onSelect={(event) => runAction(event, () => onOpenCollectDialog(item))}
      >
        <button type="button">{text.addToPlaylist}</button>
      </DropdownMenu.Item>
      {selectedCategory === "liked" ? (
        <DropdownMenu.Item
          asChild
          onSelect={(event) =>
            runAction(event, () => onRemoveFromLiked(item.librarySong.id))
          }
        >
          <button type="button">{text.removeFromLiked}</button>
        </DropdownMenu.Item>
      ) : null}
      {selectedCategory === "playlists" && selectedPlaylist ? (
        <DropdownMenu.Item
          asChild
          onSelect={(event) =>
            runAction(event, () =>
              onRemoveSongFromPlaylist(selectedPlaylist.id, item.librarySong.id),
            )
          }
        >
          <button type="button">{text.removeFromPlaylist}</button>
        </DropdownMenu.Item>
      ) : null}
      {shouldShowUpgradeToV2Action(item) ? (
        <DropdownMenu.Item
          asChild
          onSelect={(event) =>
            runAction(event, () => onRequestUpgrade(item))
          }
        >
          <button type="button">{text.upgradeToV2.menuAction}</button>
        </DropdownMenu.Item>
      ) : null}
      {item.librarySong.source === "local-import" ? (
        <DropdownMenu.Item
          asChild
          onSelect={(event) =>
            runAction(event, () => onDeleteLocalSong(item.songIndex))
          }
        >
          <button className="is-danger" type="button">
            {text.deleteFromLocalImports}
          </button>
        </DropdownMenu.Item>
      ) : null}
    </DropdownMenu.Content>
  );
}

function LibrarySongTable({
  items,
  locateScoreRequest,
  onAddToQueue,
  onCloseActionMenu,
  onDeleteLocalSong,
  onOpenActionMenu,
  onOpenCollectDialog,
  onPlaySong,
  onPlaySongNext,
  onPrepareSong,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onRequestUpgrade,
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
  | "locateScoreRequest"
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onPrepareSong"
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
  onRequestUpgrade: (item: LibrarySongListItem) => void;
  openActionMenuSongId: LibrarySongId | null;
}) {
  const rowRefs = useRef(new Map<LibrarySongId, HTMLDivElement>());
  const handledLocateRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !locateScoreRequest ||
      handledLocateRequestIdRef.current === locateScoreRequest.requestId
    ) {
      return;
    }

    let flashTimeout: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const targetRow = rowRefs.current.get(locateScoreRequest.songId);

      if (!targetRow) {
        return;
      }

      handledLocateRequestIdRef.current = locateScoreRequest.requestId;
      targetRow.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      targetRow.classList.remove("is-locate-flash");
      void targetRow.offsetWidth;
      targetRow.classList.add("is-locate-flash");
      flashTimeout = window.setTimeout(() => {
        targetRow.classList.remove("is-locate-flash");
      }, 900);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (flashTimeout !== undefined) {
        window.clearTimeout(flashTimeout);
      }
    };
  }, [items, locateScoreRequest]);

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
          const songName = getLibrarySongName(librarySong);
          const isSelected = selectedSongIndex === songIndex;
          const isLoading = isBuiltInSongLoading(librarySong.id);
          const durationMs =
            librarySong.source === "local-import"
              ? getAdjustedPreviewDurationFromMetadata(librarySong.metadata)
              : !librarySong.isBuiltInLoaded &&
                  typeof librarySong.builtInDurationMs === "number"
                ? librarySong.builtInDurationMs
                : getAdjustedPreviewDurationMs(librarySong.song.songNotes);
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
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(librarySong.id, node);
                } else {
                  rowRefs.current.delete(librarySong.id);
                }
              }}
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
                  aria-label={`${text.playThisScoreAction}: ${songName}`}
                  title={text.playThisScoreAction}
                  onFocus={() => onPrepareSong(songIndex)}
                  onPointerEnter={() => onPrepareSong(songIndex)}
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
                <span className="library-song-title-text">{songName}</span>
                <span className="library-row-title-actions">
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.playNextAction}
                    title={text.playNextAction}
                    onFocus={() => onPrepareSong(songIndex)}
                    onPointerEnter={() => onPrepareSong(songIndex)}
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
                    <DropdownMenu.Root
                      open={openActionMenuSongId === librarySong.id}
                      onOpenChange={(open) => {
                        if (open) {
                          onOpenActionMenu(librarySong.id);
                        } else {
                          onCloseActionMenu();
                        }
                      }}
                    >
                      <DropdownMenu.Trigger asChild>
                        <button
                          className="library-title-icon-button"
                          type="button"
                          aria-label={text.moreActions}
                          title={text.moreActions}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <LibraryMoreIcon />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <LibraryActionMenu
                          item={item}
                          onAddToQueue={onAddToQueue}
                          onClose={onCloseActionMenu}
                          onDeleteLocalSong={onDeleteLocalSong}
                          onOpenCollectDialog={onOpenCollectDialog}
                          onPlaySong={onPlaySong}
                          onPlaySongNext={onPlaySongNext}
                          onPrepareSong={onPrepareSong}
                          onRemoveFromLiked={onRemoveFromLiked}
                          onRemoveSongFromPlaylist={onRemoveSongFromPlaylist}
                          onRequestUpgrade={onRequestUpgrade}
                          selectedCategory={selectedCategory}
                          selectedPlaylist={selectedPlaylist}
                          text={text}
                        />
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
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
                  }: ${songName}`}
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
  isQueueOpen,
  items,
  locateScoreRequest,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylistWithSong,
  onCreatePlaylistRequest,
  onDeleteLocalSong,
  onDeletePlaylist,
  onImportFiles,
  onLocateSelectedSong,
  onPlaySong,
  onPlaySongNext,
  onPrepareSong,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onUpgradeBlocked,
  onUpgradeSongToV2,
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
  upgradeBlocked,
  isBuiltInSongLoading,
  text,
}: LibraryPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [showLocateButton, setShowLocateButton] = useState(false);
  const locateHideTimerRef = useRef<number | null>(null);
  const [collectingSongItem, setCollectingSongItem] =
    useState<LibrarySongListItem | null>(null);
  const [creatingPlaylistForItem, setCreatingPlaylistForItem] =
    useState<LibrarySongListItem | null>(null);
  const [upgradingSongItem, setUpgradingSongItem] =
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
    function clearLocateHideTimer() {
      if (locateHideTimerRef.current !== null) {
        window.clearTimeout(locateHideTimerRef.current);
        locateHideTimerRef.current = null;
      }
    }

    clearLocateHideTimer();
    setShowLocateButton(false);

    if (isQueueOpen || selectedSongIndex === null) {
      return;
    }

    const scrollContainer = panelRef.current?.closest(".app-layout");

    if (!(scrollContainer instanceof HTMLElement)) {
      return;
    }
    const scrollElement = scrollContainer;

    function handleScroll() {
      clearLocateHideTimer();

      if (scrollElement.scrollTop <= 120) {
        setShowLocateButton(false);
        return;
      }

      setShowLocateButton(true);
      locateHideTimerRef.current = window.setTimeout(() => {
        setShowLocateButton(false);
        locateHideTimerRef.current = null;
      }, 3000);
    }

    scrollElement.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      clearLocateHideTimer();
    };
  }, [isQueueOpen, selectedSongIndex]);

  return (
    <section ref={panelRef} className="library-panel" aria-label={text.aria}>
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
            <button
              className="library-empty-action"
              type="button"
              onClick={onCreatePlaylistRequest}
            >
              {text.createPlaylist}
            </button>
          </div>
        ) : (
          <LibrarySongTable
            emptyDescription={listEmptyState.description}
            emptyTitle={listEmptyState.title}
            items={items}
            locateScoreRequest={locateScoreRequest}
            isBuiltInSongLoading={isBuiltInSongLoading}
            onAddToQueue={onAddToQueue}
            onCloseActionMenu={() => setOpenActionMenuSongId(null)}
            onDeleteLocalSong={onDeleteLocalSong}
            onOpenActionMenu={(songId) => setOpenActionMenuSongId(songId)}
            onOpenCollectDialog={(item) => {
              setOpenActionMenuSongId(null);
              setCollectingSongItem(item);
            }}
            onPlaySong={onPlaySong}
            onPlaySongNext={onPlaySongNext}
            onPrepareSong={onPrepareSong}
            onRemoveFromLiked={onRemoveFromLiked}
            onRemoveSongFromPlaylist={onRemoveSongFromPlaylist}
            onRequestUpgrade={(item) => {
              setOpenActionMenuSongId(null);

              if (upgradeBlocked) {
                onUpgradeBlocked();
                return;
              }

              setUpgradingSongItem(item);
            }}
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
      {showLocateButton && selectedSongIndex !== null && !isQueueOpen ? (
        <button
          className="library-locate-floating-button"
          type="button"
          aria-label={text.locateCurrentScore}
          title={text.locateCurrentScore}
          onClick={onLocateSelectedSong}
        >
          <LibraryLocateIcon />
        </button>
      ) : null}
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
      {upgradingSongItem ? (
        <UpgradeScoreToV2Dialog
          sourceName={getLibrarySongName(upgradingSongItem.librarySong)}
          text={text.upgradeToV2}
          onClose={() => setUpgradingSongItem(null)}
          onCreate={(options) =>
            onUpgradeSongToV2(upgradingSongItem.librarySong.id, options)
          }
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
