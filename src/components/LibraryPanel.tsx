import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AudioLines,
  BookmarkPlus,
  Heart,
  GripVertical,
  Hourglass,
  ListPlus,
  MoreHorizontal,
  Play,
  Plus,
  LocateFixed,
  SkipForward,
  StepForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LibraryCategoryId } from "./AppShell";
import { getLocalLibraryMoveTarget } from "../lib/libraryGroups";
import { CreatePlaylistDialog } from "./CreatePlaylistDialog";
import { useLibraryToolbarVisibility } from "../hooks/useLibraryToolbarVisibility";
import { useLibraryRowReorder } from "../hooks/useLibraryRowReorder";
import { LibrarySortingControl } from "./LibrarySortingControl";
import type { LibrarySortingControls } from "../types/librarySorting";
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
import {
  isLibraryPageInputOutOfRange,
  parseLibraryPageInput,
} from "../lib/libraryPagination";
import { calculateCenteredScrollTop } from "../lib/libraryScroll";
import { getLibraryPlaybackIndicator } from "../lib/libraryPlaybackPresentation";
import type { ManualPlaybackUiState } from "../lib/manualPlaybackState";
import type { PlaybackState } from "../types/playback";
import type { V1ToV2ConversionOptions } from "../lib/v1ToV2Conversion";
import {
  getAdjustedPreviewDurationFromMetadata,
  getAdjustedPreviewDurationMs,
} from "../lib/playbackScheduler";
import type {
  AddSongToPlaylistResult,
  LibrarySongId,
  LibrarySongListItem,
  LocalLibraryGroup,
  UserPlaylist,
} from "../types/library";
import type { Song } from "../types/score";
import type { V1ToV2UpgradePreferences } from "../types/v1ToV2Upgrade";

type LibraryPanelProps = {
  playbackSongId: LibrarySongId | null;
  playbackState: PlaybackState;
  manualState: ManualPlaybackUiState;
  builtInPagination: {
    end: number;
    onNextPage: () => void;
    onPageChange: (page: number) => void;
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
  sorting: LibrarySortingControls;
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
  onExportLocalSong: (songId: LibrarySongId) => void;
  onMoveLocalSong: (songId: LibrarySongId, group: LocalLibraryGroup) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onImportFiles: (files: File[]) => void;
  onLocateSelectedSong: () => void;
  onPaginationNotice: (message: string) => void;
  onPrepareSong: (songIndex: number) => void;
  onPlaySong: (item: LibrarySongListItem) => void;
  onPlayAll: () => void;
  onPlaySongNext: (songIndex: number) => void;
  onRemoveFromLiked: (songId: LibrarySongId) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: LibrarySongId) => void;
  onRenamePlaylist: (playlistId: string) => void;
  onResolveUpgradeSource: (songIndex: number) => Promise<Song | null>;
  onUpgradeSourceLoadFailed: (
    item: LibrarySongListItem,
  ) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchToolbarVisibilityChange?: (isVisible: boolean) => void;
  onSelectSong: (songIndex: number) => void;
  onToggleLiked: (songIndex: number) => void;
  onUpgradeBlocked: () => void;
  onUpgradeSongToV2: (
    songId: LibrarySongId,
    sourceSong: Song,
    options: V1ToV2ConversionOptions,
  ) => Promise<UpgradeSongToV2Result>;
  onV1ToV2UpgradePreferencesChange: (
    preferences: V1ToV2UpgradePreferences,
  ) => void;
  playlists: UserPlaylist[];
  searchQuery: string;
  selectedCategory: LibraryCategoryId;
  selectedPlaylist: UserPlaylist | null;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  isV1ToV2UpgradePreferenceReady: boolean;
  upgradeBlocked: boolean;
  v1ToV2UpgradePreferences: V1ToV2UpgradePreferences;
  isBuiltInSongLoading: (songId: LibrarySongId) => boolean;
  isLocalSongExporting: (songId: LibrarySongId) => boolean;
  text: UiText["library"];
};

type BuiltInLibraryPaginationProps = {
  hasSearchQuery: boolean;
  onPaginationNotice: (message: string) => void;
  pagination: NonNullable<LibraryPanelProps["builtInPagination"]>;
  text: UiText["library"];
};

function BuiltInLibraryPagination({
  hasSearchQuery,
  onPaginationNotice,
  pagination,
  text,
}: BuiltInLibraryPaginationProps) {
  const [pageDraft, setPageDraft] = useState(String(pagination.page));
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    setPageDraft(String(pagination.page));
  }, [pagination.page]);

  const commitPageDraft = () => {
    const parsedPage = parseLibraryPageInput(
      pageDraft,
      pagination.pageCount,
    );

    if (parsedPage === null) {
      if (
        isLibraryPageInputOutOfRange(pageDraft, pagination.pageCount)
      ) {
        onPaginationNotice(
          text.paginationPageOutOfRange.replace(
            "{pageCount}",
            String(pagination.pageCount),
          ),
        );
      }

      setPageDraft(String(pagination.page));
      return;
    }

    pagination.onPageChange(parsedPage);
    setPageDraft(String(parsedPage));
  };

  return (
    <div className="library-pagination" aria-label={text.paginationAria}>
      {hasSearchQuery ? (
        <span>
          {text.paginationSearchResults.replace(
            "{total}",
            String(pagination.total),
          )}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pagination.page <= 1}
        onClick={pagination.onPreviousPage}
      >
        {text.paginationPrevious}
      </button>
      <span className="library-pagination-page">
        {text.paginationPagePrefix}
        <input
          className="library-pagination-page-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          spellCheck={false}
          autoComplete="off"
          aria-label={text.paginationJumpAria}
          value={pageDraft}
          onChange={(event) => setPageDraft(event.target.value)}
          onBlur={() => {
            if (skipNextBlurRef.current) {
              skipNextBlurRef.current = false;
              return;
            }

            commitPageDraft();
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              commitPageDraft();
              skipNextBlurRef.current = true;
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setPageDraft(String(pagination.page));
              skipNextBlurRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        <span aria-hidden="true">/</span>
        <span>{pagination.pageCount}</span>
        {text.paginationPageSuffix ? (
          <span>{text.paginationPageSuffix}</span>
        ) : null}
      </span>
      <span>
        {text.paginationShowing
          .replace("{start}", String(pagination.start))
          .replace("{end}", String(pagination.end))
          .replace("{total}", String(pagination.total))}
      </span>
      <button
        type="button"
        disabled={pagination.page >= pagination.pageCount}
        onClick={pagination.onNextPage}
      >
        {text.paginationNext}
      </button>
    </div>
  );
}

export function shouldShowUpgradeToV2Action(item: LibrarySongListItem) {
  return getLibrarySongFormatVersion(item.librarySong) === 1;
}

export function isLatestUpgradeSourceRequest(
  latestRequestId: number,
  requestId: number,
) {
  return latestRequestId === requestId;
}

export function getVisibleUpgradeActionCount(
  item: LibrarySongListItem,
): number {
  return shouldShowUpgradeToV2Action(item) ? 1 : 0;
}

export function getNextUpgradeSourceRequestId(
  currentRequestId: number,
  isV1ToV2UpgradePreferenceReady: boolean,
) {
  return isV1ToV2UpgradePreferenceReady
    ? currentRequestId + 1
    : currentRequestId;
}

export function getV1ToV2UpgradePreferenceReadiness(
  hasLoadedAppData: boolean,
) {
  return hasLoadedAppData;
}

export function getUpgradeToV2ActionState(
  item: LibrarySongListItem,
  isV1ToV2UpgradePreferenceReady: boolean,
) {
  return {
    disabled: !isV1ToV2UpgradePreferenceReady,
    visible: shouldShowUpgradeToV2Action(item),
  };
}

export async function requestUpgradeSourceWhenReady({
  getLatestRequestId,
  isV1ToV2UpgradePreferenceReady,
  loadSource,
  onFailed,
  onLoaded,
  setLatestRequestId,
}: {
  getLatestRequestId: () => number;
  isV1ToV2UpgradePreferenceReady: boolean;
  loadSource: () => Promise<Song | null>;
  onFailed: () => void;
  onLoaded: (sourceSong: Song) => void;
  setLatestRequestId: (requestId: number) => void;
}): Promise<"failed" | "loaded" | "not-ready" | "stale"> {
  if (!isV1ToV2UpgradePreferenceReady) {
    return "not-ready";
  }

  const requestId = getNextUpgradeSourceRequestId(
    getLatestRequestId(),
    isV1ToV2UpgradePreferenceReady,
  );
  setLatestRequestId(requestId);

  return resolveUpgradeSourceRequest({
    getLatestRequestId,
    loadSource,
    onFailed,
    onLoaded,
    requestId,
  });
}

export async function resolveUpgradeSourceRequest({
  getLatestRequestId,
  loadSource,
  onFailed,
  onLoaded,
  requestId,
}: {
  getLatestRequestId: () => number;
  loadSource: () => Promise<Song | null>;
  onFailed: () => void;
  onLoaded: (sourceSong: Song) => void;
  requestId: number;
}): Promise<"failed" | "loaded" | "stale"> {
  try {
    const sourceSong = await loadSource();

    if (
      !isLatestUpgradeSourceRequest(getLatestRequestId(), requestId)
    ) {
      return "stale";
    }

    if (sourceSong === null) {
      onFailed();
      return "failed";
    }

    onLoaded(sourceSong);
    return "loaded";
  } catch {
    if (
      !isLatestUpgradeSourceRequest(getLatestRequestId(), requestId)
    ) {
      return "stale";
    }

    onFailed();
    return "failed";
  }
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
  onImportFiles,
  text,
}: Pick<
  LibraryPanelProps,
  "importDisabled" | "onImportFiles" | "text"
>) {
  return (
    <div className="library-import-area">
      <label
        className={`library-import-button${importDisabled ? " is-disabled" : ""}`}
        aria-disabled={importDisabled}
      >
        <span>{text.importTitle}</span>
        <input
          accept=".json,.txt"
          aria-label={text.importLabel}
          aria-describedby={
            importDisabled ? "library-import-disabled-reason" : undefined
          }
          title={importDisabled ? text.importDisabledDescription : text.importDescription}
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
    </div>
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
      <div className="playlist-detail-main">
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
                collisionPadding={8}
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
  isV1ToV2UpgradePreferenceReady,
  item,
  onAddToQueue,
  onClose,
  onDeleteLocalSong,
  onExportLocalSong,
  onMoveLocalSong,
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
  isLocalSongExporting,
  moveActions,
  usesPointerAnchor,
}: Pick<
  LibraryPanelProps,
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onExportLocalSong"
  | "onMoveLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onPrepareSong"
  | "onRemoveFromLiked"
  | "onRemoveSongFromPlaylist"
  | "isV1ToV2UpgradePreferenceReady"
  | "selectedCategory"
  | "selectedPlaylist"
  | "text"
  | "isLocalSongExporting"
> & {
  item: LibrarySongListItem;
  onClose: () => void;
  onOpenCollectDialog: (item: LibrarySongListItem) => void;
  onRequestUpgrade: (item: LibrarySongListItem) => void;
  usesPointerAnchor: boolean;
  moveActions?: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
  };
}) {
  const upgradeActionState = getUpgradeToV2ActionState(
    item,
    isV1ToV2UpgradePreferenceReady,
  );
  const moveGroup = getLocalLibraryMoveTarget(item.librarySong);

  function runAction(event: Event, action: () => void) {
    event.preventDefault();
    action();
    onClose();
  }

  return (
    <DropdownMenu.Content
      className="library-action-menu"
      align={usesPointerAnchor ? "start" : "end"}
      side="bottom"
      sideOffset={usesPointerAnchor ? 4 : 6}
      collisionPadding={8}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {moveActions ? <>
        <DropdownMenu.Item asChild disabled={!moveActions.canMoveUp}
          onSelect={(event) => runAction(event, moveActions.onMoveUp)}>
          <button type="button" disabled={!moveActions.canMoveUp}>{text.sorting.moveUp}</button>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild disabled={!moveActions.canMoveDown}
          onSelect={(event) => runAction(event, moveActions.onMoveDown)}>
          <button type="button" disabled={!moveActions.canMoveDown}>{text.sorting.moveDown}</button>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="library-menu-separator" />
      </> : null}
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
      {upgradeActionState.visible ? (
        <DropdownMenu.Item
          asChild
          disabled={upgradeActionState.disabled}
          onSelect={(event) =>
            runAction(event, () => onRequestUpgrade(item))
          }
        >
          <button
            disabled={upgradeActionState.disabled}
            type="button"
          >
            {text.upgradeToV2.menuAction}
          </button>
        </DropdownMenu.Item>
      ) : null}
      {item.librarySong.source === "local-import" ? (
        <DropdownMenu.Item
          asChild
          disabled={isLocalSongExporting(item.librarySong.id)}
          onSelect={(event) =>
            runAction(event, () => onExportLocalSong(item.librarySong.id))
          }
        >
          <button
            disabled={isLocalSongExporting(item.librarySong.id)}
            type="button"
          >
            {isLocalSongExporting(item.librarySong.id)
              ? text.exportingLocalScore
              : text.exportLocalScore}
          </button>
        </DropdownMenu.Item>
      ) : null}
      {moveGroup !== null ? (
        <DropdownMenu.Item
          asChild
          onSelect={(event) => runAction(event, () => onMoveLocalSong(
            item.librarySong.id, moveGroup,
          ))}
        >
          <button type="button">
            {moveGroup === "imported" ? text.moveToLocalImports : text.moveToConverted}
          </button>
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
            {text.deleteLocalSong}
          </button>
        </DropdownMenu.Item>
      ) : null}
    </DropdownMenu.Content>
  );
}

function LibrarySongTable({
  playbackSongId,
  playbackState,
  manualState,
  isV1ToV2UpgradePreferenceReady,
  items,
  sorting,
  rowNumberStart,
  locateScoreRequest,
  onAddToQueue,
  onCloseActionMenu,
  onDeleteLocalSong,
  onExportLocalSong,
  onMoveLocalSong,
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
  isLocalSongExporting,
  selectedCategory,
  selectedPlaylist,
  selectedSongIndex,
  text,
  openActionMenuSongId,
}: Pick<
  LibraryPanelProps,
  | "playbackSongId"
  | "playbackState"
  | "manualState"
  | "items"
  | "sorting"
  | "isV1ToV2UpgradePreferenceReady"
  | "locateScoreRequest"
  | "onAddToQueue"
  | "onDeleteLocalSong"
  | "onExportLocalSong"
  | "onMoveLocalSong"
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
  | "isLocalSongExporting"
  | "text"
> & {
  emptyDescription: string;
  emptyTitle: string;
  onCloseActionMenu: () => void;
  onOpenActionMenu: (songId: LibrarySongId) => void;
  onOpenCollectDialog: (item: LibrarySongListItem) => void;
  onRequestUpgrade: (item: LibrarySongListItem) => void;
  openActionMenuSongId: LibrarySongId | null;
  rowNumberStart: number;
}) {
  const reordering = useLibraryRowReorder(
    items, sorting, `${selectedCategory}:${selectedPlaylist?.id ?? ""}`, text.sorting.moved, rowNumberStart,
  );
  const rowRefs = useRef(new Map<LibrarySongId, HTMLDivElement>());
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    songId: LibrarySongId; x: number; y: number;
  } | null>(null);
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
      const scrollContainer = targetRow.closest(".app-layout");

      if (scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = targetRow.getBoundingClientRect();
        const scrollTop = calculateCenteredScrollTop({
          containerClientHeight: scrollContainer.clientHeight,
          containerScrollHeight: scrollContainer.scrollHeight,
          currentScrollTop: scrollContainer.scrollTop,
          targetHeight: targetRect.height,
          targetTopRelativeToContainer: targetRect.top - containerRect.top,
        });

        scrollContainer.scrollTo({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          top: scrollTop,
        });
      }

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

  const showSource =
    selectedCategory === "liked" || selectedCategory === "playlists";

  return (
    <section
      ref={reordering.tableRef}
      className={`library-table${showSource ? "" : " is-single-source"}`}
      aria-label={text.aria}
    >
      <div className="library-table-header">
        <span>{text.columns.index}</span>
        <span>{text.columns.title}</span>
        {showSource ? <span>{text.columns.source}</span> : null}
        <span>{text.columns.liked}</span>
        <span>{text.columns.duration}</span>
      </div>
      <div className="library-table-body">
        {items.map((item, displayIndex) => {
          const { librarySong, songIndex } = item;
          const pointerAnchor = openActionMenuSongId === librarySong.id && contextMenuPosition?.songId === librarySong.id
            ? contextMenuPosition : null;
          const songName = getLibrarySongName(librarySong);
          const isSelected = selectedSongIndex === songIndex;
          const isLoading = isBuiltInSongLoading(librarySong.id);
          const playbackIndicator = getLibraryPlaybackIndicator({
            songId: librarySong.id,
            playbackSongId,
            playbackState,
            manualState,
          });
          const PlaybackIcon =
            playbackIndicator === "playing"
              ? AudioLines
              : playbackIndicator === "manual"
                ? StepForward
                : playbackIndicator === "releasing"
                  ? Hourglass
                  : Play;
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
          const rowNumber = String(displayIndex + rowNumberStart).padStart(2, "0");

          return (
            <div
              className={`library-song-row${isSelected ? " is-selected" : ""}${
                openActionMenuSongId === librarySong.id ? " has-open-menu" : ""
              }${playbackIndicator ? ` is-${playbackIndicator}` : ""}${
                isLoading ? " is-loading" : ""
              }${reordering.draggedId === librarySong.id ? " is-reordering" : ""}${
                reordering.target?.id === librarySong.id ? ` is-drop-${reordering.target.position}` : ""
              }`}
              {...reordering.rowProps(librarySong.id)}
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
              aria-haspopup="menu"
              aria-expanded={openActionMenuSongId === librarySong.id}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenuPosition({ songId: librarySong.id, x: event.clientX, y: event.clientY });
                onOpenActionMenu(librarySong.id);
              }}
              onClick={() => onSelectSong(songIndex)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                  event.preventDefault();
                  event.stopPropagation();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setContextMenuPosition({ songId: librarySong.id, x: bounds.left + 16, y: bounds.bottom });
                  onOpenActionMenu(librarySong.id);
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectSong(songIndex);
                }
              }}
            >
              <span className="library-song-index">
                <span className="library-song-number">
                  {playbackIndicator ? (
                    <span
                      className="library-playback-indicator"
                      role="img"
                      aria-label={text.playbackIndicators[playbackIndicator]}
                      title={text.playbackIndicators[playbackIndicator]}
                    >
                      <PlaybackIcon aria-hidden="true" focusable="false" />
                    </span>
                  ) : (
                    rowNumber
                  )}
                </span>
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
                {sorting.isEditing ? (
                  <button type="button" className="library-reorder-handle"
                    disabled={!sorting.canReorder}
                    aria-label={text.sorting.handle}
                    title={sorting.canReorder ? text.sorting.handle : text.sorting.searchDisabled}
                    onClick={event => event.stopPropagation()}
                    onKeyDown={event => event.stopPropagation()}
                    {...reordering.handleProps(librarySong.id)}>
                    <GripVertical aria-hidden="true" focusable="false" />
                  </button>
                ) : null}
                <span className="library-song-title-text" title={songName}>
                  {songName}
                </span>
                <span className="library-row-title-actions">
                  <button
                    className="library-title-icon-button library-row-quick-action"
                    type="button"
                    aria-label={text.playNextAction}
                    title={text.playNextAction}
                    onFocus={() => onPrepareSong(songIndex)}
                    onPointerEnter={() => onPrepareSong(songIndex)}
                    onKeyDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.blur();
                      onPlaySongNext(songIndex);
                    }}
                  >
                    <LibraryPlayNextIcon />
                  </button>
                  <button
                    className="library-title-icon-button library-row-quick-action"
                    type="button"
                    aria-label={text.addToQueueAction}
                    title={text.addToQueueAction}
                    onKeyDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.blur();
                      onAddToQueue(songIndex);
                    }}
                  >
                    <LibraryAddToQueueIcon />
                  </button>
                  <button
                    className="library-title-icon-button library-row-quick-action"
                    type="button"
                    aria-label={text.addToPlaylist}
                    title={text.addToPlaylist}
                    onKeyDown={(event) => event.stopPropagation()}
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
                      modal={false}
                      open={openActionMenuSongId === librarySong.id}
                      onOpenChange={(open) => {
                        setContextMenuPosition(null);
                        if (open) {
                          onOpenActionMenu(librarySong.id);
                        } else {
                          onCloseActionMenu();
                        }
                      }}
                    >
                      {pointerAnchor ? (
                        <button
                          className="library-title-icon-button"
                          type="button"
                          aria-label={text.moreActions}
                          title={text.moreActions}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setContextMenuPosition(null);
                          }}
                        ><LibraryMoreIcon /></button>
                      ) : null}
                      <DropdownMenu.Trigger asChild>
                        <button
                          className={pointerAnchor ? "library-context-menu-trigger" : "library-title-icon-button"}
                          style={pointerAnchor ? { left: pointerAnchor.x, top: pointerAnchor.y } : undefined}
                          tabIndex={pointerAnchor ? -1 : undefined}
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
                          {pointerAnchor ? null : <LibraryMoreIcon />}
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <LibraryActionMenu
                          isV1ToV2UpgradePreferenceReady={
                            isV1ToV2UpgradePreferenceReady
                          }
                          item={item}
                          usesPointerAnchor={pointerAnchor !== null}
                          onAddToQueue={onAddToQueue}
                          onClose={onCloseActionMenu}
                          onDeleteLocalSong={onDeleteLocalSong}
                          onExportLocalSong={onExportLocalSong}
                          onMoveLocalSong={onMoveLocalSong}
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
                          isLocalSongExporting={isLocalSongExporting}
                          moveActions={sorting.isEditing ? {
                            canMoveUp: sorting.canReorder && displayIndex > 0,
                            canMoveDown: sorting.canReorder && displayIndex < items.length - 1,
                            onMoveUp: () => reordering.move(librarySong.id, -1),
                            onMoveDown: () => reordering.move(librarySong.id, 1),
                          } : undefined}
                        />
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </span>
                </span>
                {isLoading ? (
                  <span className="library-loading-badge">
                    {text.loadingScore}
                  </span>
                ) : null}
              </span>
              {showSource ? (
                <span className="library-song-source">
                  {librarySong.source === "built-in"
                    ? text.builtInSource
                    : text.localImport}
                </span>
              ) : null}
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
      <span className="sr-only" role="status" aria-live="polite">{reordering.announcement}</span>
    </section>
  );
}

export function LibraryPanel({
  playbackSongId,
  playbackState,
  manualState,
  builtInPagination,
  hasSearchQuery,
  importDisabled,
  importError,
  isV1ToV2UpgradePreferenceReady,
  isQueueOpen,
  items,
  sorting,
  locateScoreRequest,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylistWithSong,
  onCreatePlaylistRequest,
  onDeleteLocalSong,
  onExportLocalSong,
  onMoveLocalSong,
  onDeletePlaylist,
  onImportFiles,
  onLocateSelectedSong,
  onPaginationNotice,
  onPlayAll,
  onPlaySong,
  onPlaySongNext,
  onPrepareSong,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onResolveUpgradeSource,
  onUpgradeSourceLoadFailed,
  onUpgradeBlocked,
  onUpgradeSongToV2,
  onV1ToV2UpgradePreferencesChange,
  onRenamePlaylist,
  onSearchQueryChange,
  onSearchToolbarVisibilityChange,
  onSelectSong,
  onToggleLiked,
  playlists,
  searchQuery,
  selectedCategory,
  selectedPlaylist,
  selectedPlaylistId,
  selectedSongIndex,
  upgradeBlocked,
  v1ToV2UpgradePreferences,
  isBuiltInSongLoading,
  isLocalSongExporting,
  text,
}: LibraryPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const searchToolbarRef = useRef<HTMLDivElement | null>(null);
  const [showLocateButton, setShowLocateButton] = useState(false);
  const locateHideTimerRef = useRef<number | null>(null);
  const [collectingSongItem, setCollectingSongItem] =
    useState<LibrarySongListItem | null>(null);
  const [creatingPlaylistForItem, setCreatingPlaylistForItem] =
    useState<LibrarySongListItem | null>(null);
  const [upgradeDialogState, setUpgradeDialogState] = useState<{
    item: LibrarySongListItem;
    sourceSong: Song;
  } | null>(null);
  const latestUpgradeSourceRequestIdRef = useRef(0);
  const [openActionMenuSongId, setOpenActionMenuSongId] =
    useState<LibrarySongId | null>(null);
  useLibraryToolbarVisibility(searchToolbarRef, onSearchToolbarVisibilityChange);
  const isLocalImports = selectedCategory === "local-imports";
  const isPlaylists = selectedCategory === "playlists";
  const isBuiltIn = selectedCategory === "built-in";
  const emptyState = text.categoryEmptyStates[selectedCategory];
  const listEmptyState = getLibraryEmptyState({
    hasSearchQuery,
    selectedCategory,
    text,
  });

  function requestUpgrade(item: LibrarySongListItem) {
    setOpenActionMenuSongId(null);

    if (!isV1ToV2UpgradePreferenceReady) {
      return;
    }

    if (upgradeBlocked) {
      onUpgradeBlocked();
      return;
    }

    void requestUpgradeSourceWhenReady({
      getLatestRequestId: () =>
        latestUpgradeSourceRequestIdRef.current,
      isV1ToV2UpgradePreferenceReady,
      loadSource: () => onResolveUpgradeSource(item.songIndex),
      onFailed: () => onUpgradeSourceLoadFailed(item),
      onLoaded: (sourceSong) =>
        setUpgradeDialogState({ item, sourceSong }),
      setLatestRequestId: (requestId) => {
        latestUpgradeSourceRequestIdRef.current = requestId;
      },
    });
  }
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
      <div className="library-content">
        <div ref={searchToolbarRef} className="library-content-header">
          <label className="library-search">
            <span className="sr-only">{text.searchPlaceholder}</span>
            <input
              type="search"
              value={searchQuery}
              placeholder={text.searchPlaceholder}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            />
          </label>
          <div className="library-content-actions">
            <LibrarySortingControl sorting={sorting} disabled={isPlaylists && !selectedPlaylist} text={text.sorting} />
            {isLocalImports ? (
              <LibraryImportArea
                importDisabled={importDisabled}
                onImportFiles={onImportFiles}
                text={text}
              />
            ) : null}
          </div>
        </div>
        {sorting.mode === "custom" && !sorting.canEdit && (!isPlaylists || selectedPlaylist) ? (
          <p className="library-sort-hint">{text.sorting.searchDisabled}</p>
        ) : sorting.isEditing ? (
          <p className="library-sort-hint">
            {text.sorting.customHint}{isBuiltIn ? ` ${text.sorting.pageHint}` : ""}
          </p>
        ) : selectedCategory === "liked" && sorting.mode.startsWith("added-") ? (
          <p className="library-sort-hint">{text.sorting.likedTime}</p>
        ) : null}
        {isLocalImports && importDisabled ? (
          <p className="library-import-hint" id="library-import-disabled-reason">
            {text.importDisabledDescription}
          </p>
        ) : null}
        {isLocalImports && importError ? (
          <p className="parse-error library-import-error" role="alert">
            {importError}
          </p>
        ) : null}
        {isPlaylists && selectedPlaylist ? (
          <PlaylistHeader
            onDeletePlaylist={onDeletePlaylist}
            onPlayAll={onPlayAll}
            onRenamePlaylist={onRenamePlaylist}
            selectedPlaylist={selectedPlaylist}
            selectedPlaylistId={selectedPlaylistId}
            visibleSongCount={selectedPlaylist.songIds.length}
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
            sorting={sorting}
            rowNumberStart={isBuiltIn ? builtInPagination?.start || 1 : 1}
            playbackSongId={playbackSongId}
            playbackState={playbackState}
            manualState={manualState}
            isV1ToV2UpgradePreferenceReady={
              isV1ToV2UpgradePreferenceReady
            }
            emptyDescription={listEmptyState.description}
            emptyTitle={listEmptyState.title}
            items={items}
            locateScoreRequest={locateScoreRequest}
            isBuiltInSongLoading={isBuiltInSongLoading}
            onAddToQueue={onAddToQueue}
            onCloseActionMenu={() => setOpenActionMenuSongId(null)}
            onDeleteLocalSong={onDeleteLocalSong}
            onExportLocalSong={onExportLocalSong}
            onMoveLocalSong={onMoveLocalSong}
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
            onRequestUpgrade={requestUpgrade}
            onSelectSong={onSelectSong}
            onToggleLiked={onToggleLiked}
            selectedCategory={selectedCategory}
            selectedPlaylist={selectedPlaylist}
            selectedSongIndex={selectedSongIndex}
            text={text}
            isLocalSongExporting={isLocalSongExporting}
            openActionMenuSongId={openActionMenuSongId}
          />
        )}
        {isBuiltIn &&
        builtInPagination &&
        (builtInPagination.total > builtInPagination.pageSize ||
          hasSearchQuery) ? (
          <BuiltInLibraryPagination
            hasSearchQuery={hasSearchQuery}
            onPaginationNotice={onPaginationNotice}
            pagination={builtInPagination}
            text={text}
          />
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
      {upgradeDialogState ? (
        <UpgradeScoreToV2Dialog
          preferences={v1ToV2UpgradePreferences}
          sourceSong={upgradeDialogState.sourceSong}
          text={text.upgradeToV2}
          onClose={() => setUpgradeDialogState(null)}
          onCreate={(options) =>
            onUpgradeSongToV2(
              upgradeDialogState.item.librarySong.id,
              upgradeDialogState.sourceSong,
              options,
            )
          }
          onPreferencesChange={onV1ToV2UpgradePreferencesChange}
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

  if (selectedCategory === "converted") {
    return text.categoryEmptyStates.converted;
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
