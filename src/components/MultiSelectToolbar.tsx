// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { Check } from "lucide-react";
import { useState } from "react";
import type { LibrarySongId, UserPlaylist } from "../types/library";
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
  onDeleteLocalSongs?: (songIds: LibrarySongId[]) => void;
  onAddSongsToPlaylist?: (playlistId: string, songIds: LibrarySongId[]) => void;
  onRemoveSongsFromPlaylist?: (playlistId: string, songIds: LibrarySongId[]) => void;
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
}: MultiSelectToolbarProps) {
  const { count, enabled } = multiSelect;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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

  const confirmDelete = () => {
    setIsConfirmOpen(false);
    onDeleteLocalSongs?.(selectedIds);
    multiSelect.clear();
  };

  const handleRemoveFromPlaylist = () => {
    // 只有正打开某个歌单时才有“从哪个歌单移除”的语义。
    if (!isViewingPlaylist || !selectedPlaylistId || count === 0) {
      return;
    }
    onRemoveSongsFromPlaylist?.(selectedPlaylistId, selectedIds);
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
          className="library-multi-select-action"
          onClick={() => multiSelect.selectAll(visibleSongIds)}
        >
          {text.multiSelectSelectAll}
        </button>
        <button
          type="button"
          className="library-multi-select-action"
          disabled={count === 0}
          onClick={() => multiSelect.clear()}
        >
          {text.multiSelectClear}
        </button>
        <button
          type="button"
          className="library-multi-select-action is-danger"
          disabled={count === 0 || !onDeleteLocalSongs}
          onClick={handleDelete}
        >
          {text.multiSelectDeleteSelected}
        </button>
        {playlists.length > 0 ? (
          <>
            <select
              className="library-multi-select-playlist"
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
                className="library-multi-select-action"
                disabled={count === 0}
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
        onConfirm={confirmDelete}
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
}: {
  checked: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`library-multi-select-checkbox${checked ? " is-checked" : ""}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={-1}
    >
      {checked ? <Check aria-hidden="true" focusable="false" /> : null}
    </button>
  );
}
