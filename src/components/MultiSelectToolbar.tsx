// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { useRef, useState } from "react";
import { runSingleFlightDelete } from "../lib/deleteConfirmationFlow";
import type { LibrarySongId, LocalLibraryGroup, UserPlaylist } from "../types/library";
import type { MultiSelectState } from "../hooks/useMultiSelect";
import type { UiText } from "../i18n/uiText";
import { ConfirmDialog } from "./ConfirmDialog";

type MultiSelectToolbarProps = {
  multiSelect: MultiSelectState;
  playlists: UserPlaylist[];
  text: UiText["library"];
  visibleSongIds: LibrarySongId[];
  selectedPlaylistId: string | null;
  /** 「从歌单移除」只对“当前正打开某个歌单”有意义；切到其它分类时它不该出现。 */
  isViewingPlaylist: boolean;
  onDeleteLocalSongs?: (songIds: LibrarySongId[]) => Promise<LibrarySongId[]>;
  onAddSongsToPlaylist?: (playlistId: string, songIds: LibrarySongId[]) => void;
  onRemoveSongsFromPlaylist?: (playlistId: string, songIds: LibrarySongId[]) => void;
  /**
   * 批量移动分类的目标组；null 表示当前分类不支持移动，按钮不渲染。
   * 由父组件按当前分类与选中曲谱的可移动性计算。
   */
  moveTargetGroup?: LocalLibraryGroup | null;
  onMoveSelectedSongs?: (group: LocalLibraryGroup) => void;
};

export function MultiSelectToolbar({
  multiSelect,
  playlists,
  text,
  visibleSongIds,
  selectedPlaylistId,
  isViewingPlaylist,
  onDeleteLocalSongs,
  onAddSongsToPlaylist,
  onRemoveSongsFromPlaylist,
  moveTargetGroup = null,
  onMoveSelectedSongs,
}: MultiSelectToolbarProps) {
  const { count, enabled } = multiSelect;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteInProgress = useRef(false);

  if (!enabled) {
    return null;
  }

  const selectedIds = Array.from(multiSelect.selected);

  const handleDelete = () => {
    if (count === 0) {
      return;
    }
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!onDeleteLocalSongs || count === 0) return;

    await runSingleFlightDelete(deleteInProgress, setIsDeleting, async () => {
      const resolvedIds = await onDeleteLocalSongs(selectedIds);
      multiSelect.deselect(resolvedIds);
      setIsConfirmOpen(false);
      return true;
    });
  };

  const handleRemoveFromPlaylist = () => {
    // 只有正打开某个歌单时才有“从哪个歌单移除”的语义。
    if (!isViewingPlaylist || !selectedPlaylistId || count === 0) {
      return;
    }
    onRemoveSongsFromPlaylist?.(selectedPlaylistId, selectedIds);
    multiSelect.clear();
  };

  const handleMoveSelected = () => {
    if (!moveTargetGroup || count === 0) {
      return;
    }
    onMoveSelectedSongs?.(moveTargetGroup);
    multiSelect.clear();
  };

  return (
    <>
      <div
        className="library-multi-select-bar"
        role="toolbar"
        aria-label={text.multiSelectMode}
      >
        <span className="library-multi-select-count">
          {text.multiSelectSelectedCount.replace("{count}", String(count))}
        </span>
        <button
          type="button"
          className="library-multi-select-control"
          disabled={isDeleting}
          onClick={() => multiSelect.selectAll(visibleSongIds)}
        >
          {text.multiSelectSelectAll}
        </button>
        <button
          type="button"
          className="library-multi-select-control"
          disabled={count === 0 || isDeleting}
          onClick={() => multiSelect.clear()}
        >
          {text.multiSelectClear}
        </button>
        {moveTargetGroup ? (
          <button
            type="button"
            className="library-multi-select-control"
            disabled={count === 0 || isDeleting}
            onClick={handleMoveSelected}
          >
            {moveTargetGroup === "converted"
              ? text.moveToConverted
              : text.moveToLocalImports}
          </button>
        ) : null}
        <button
          type="button"
          className="library-multi-select-control library-multi-select-delete is-danger"
          disabled={count === 0 || isDeleting || !onDeleteLocalSongs}
          onClick={handleDelete}
        >
          {text.multiSelectDeleteSelected}
        </button>
        {playlists.length > 0 ? (
          <>
            <select
              className="library-multi-select-control"
              disabled={count === 0 || isDeleting}
              value=""
              aria-label={text.multiSelectAddToPlaylist}
              onChange={(event) => {
                const playlistId = event.currentTarget.value;
                event.currentTarget.value = "";
                if (!playlistId) {
                  return;
                }
                onAddSongsToPlaylist?.(playlistId, selectedIds);
                multiSelect.clear();
              }}
            >
              <option value="">{text.multiSelectAddToPlaylist}</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
            {isViewingPlaylist && selectedPlaylistId ? (
              <button
                type="button"
                className="library-multi-select-control"
                disabled={count === 0 || isDeleting}
                onClick={handleRemoveFromPlaylist}
              >
                {text.multiSelectRemoveFromPlaylist}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        cancelLabel={text.multiSelectCancel}
        confirmLabel={text.multiSelectDeleteSelected}
        description={text.multiSelectDeleteConfirm.replace(
          "{count}",
          String(count),
        )}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => { void confirmDelete(); }}
        isConfirming={isDeleting}
        open={isConfirmOpen}
        title={text.multiSelectDeleteTitle}
        variant="danger"
      />
    </>
  );
}

export function MultiSelectCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      className="library-multi-select-checkbox"
      checked={checked}
      aria-label={label}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onChange={onToggle}
    />
  );
}
