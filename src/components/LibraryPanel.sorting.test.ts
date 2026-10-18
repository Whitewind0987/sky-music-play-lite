import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LibraryPanel } from "./LibraryPanel";
import { LibrarySortingControl } from "./LibrarySortingControl";
import { uiText } from "../i18n/uiText";
import { createLibrarySong } from "../lib/libraryCollections";
import { createDefaultV1ToV2UpgradePreferences } from "../lib/v1ToV2UpgradePreferences";
import type { LibrarySortingControls } from "../types/librarySorting";
import { isLibrarySortEditActive, librarySortEditReducer } from "../lib/librarySortEditing";

type Props = ComponentProps<typeof LibraryPanel>;
const noOp = () => {};
const song = createLibrarySong({
  name: "Example song", bpm: 120, bitsPerPage: 16, pitchLevel: 0,
  isComposed: false, songNotes: [{ time: 100, key: "Key0" }],
}, 1);

function controls(overrides: Partial<LibrarySortingControls> = {}): LibrarySortingControls {
  return {
    mode: "custom", supportsAdded: true, canEdit: true, isEditing: false, canReorder: false,
    onToggleEditing: noOp, onModeChange: noOp, onReorder: noOp, ...overrides,
  };
}

function props(overrides: Partial<Props> = {}): Props {
  return {
    items: [{ librarySong: song, songIndex: 41, isLiked: false }], sorting: controls(),
    playbackSongId: null, playbackState: "idle", manualState: "idle", builtInPagination: null,
    hasSearchQuery: false, importDisabled: false, importError: "", isQueueOpen: false,
    locateScoreRequest: null, playlists: [], searchQuery: "", selectedCategory: "local-imports",
    selectedPlaylist: null, selectedPlaylistId: null, selectedSongIndex: 41,
    isV1ToV2UpgradePreferenceReady: true, upgradeBlocked: false,
    v1ToV2UpgradePreferences: createDefaultV1ToV2UpgradePreferences(),
    text: uiText["zh-CN"].library,
    isBuiltInSongLoading: () => false, isLocalSongExporting: () => false,
    onAddSongToPlaylist: () => ({ status: "added" }), onAddToQueue: noOp,
    onCreatePlaylistWithSong: noOp, onCreatePlaylistRequest: noOp,
    onDeleteLocalSong: noOp, onExportLocalSong: noOp, onDeletePlaylist: noOp,
    onImportFiles: noOp, onLocateSelectedSong: noOp, onPaginationNotice: noOp,
    onPrepareSong: noOp, onPlaySong: noOp, onPlayAll: noOp, onPlaySongNext: noOp,
    onRemoveFromLiked: noOp, onRemoveSongFromPlaylist: noOp, onRenamePlaylist: noOp,
    onResolveUpgradeSource: async () => null, onUpgradeSourceLoadFailed: noOp,
    onSearchQueryChange: noOp, onSelectSong: noOp, onToggleLiked: noOp, onUpgradeBlocked: noOp,
    onUpgradeSongToV2: async () => ({ status: "failed", message: "unused" }),
    onV1ToV2UpgradePreferencesChange: noOp, ...overrides,
  };
}

const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(LibraryPanel, props(overrides)));

describe("library sort editing and toolbar markup", () => {
  it("hides handles and instructions in normal Custom Order without leaving a handle element", () => {
    const html = render();
    expect(html).toContain("编辑排序");
    expect(html).not.toContain('class="library-reorder-handle"');
    expect(html).not.toContain(uiText["zh-CN"].library.sorting.customHint);
    expect(html).toContain('library-song-row is-selected');
  });

  it("renders draggable handles, Done and instructions only while editing", () => {
    const html = render({ sorting: controls({ isEditing: true, canReorder: true }) });
    expect(html).toContain('class="library-reorder-handle"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("完成");
    expect(html).toContain(uiText["zh-CN"].library.sorting.customHint);
  });

  it("wires Edit/Done to the toggle callback without invoking any reorder", () => {
    let scope: string | null = null;
    const onReorder = vi.fn();
    const onToggleEditing = () => { scope = librarySortEditReducer(scope, { type: "toggle", scope: "local-imports", canEdit: true }); };
    for (const expected of ["local-imports", null, "local-imports"]) {
      const tree = LibrarySortingControl({ sorting: controls({ onToggleEditing, onReorder }), disabled: false, text: uiText["zh-CN"].library.sorting });
      const editButton = tree.props.children[0];
      editButton.props.onClick();
      expect(scope).toBe(expected);
    }
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("hides handles on Done and reopens with the same reordered rows", () => {
    const second = { ...song, id: "local-second", metadata: { ...song.metadata, name: "Second song" } };
    const items = [
      { librarySong: second, songIndex: 42, isLiked: false },
      { librarySong: song, songIndex: 41, isLiked: false },
    ];
    let editingScope: string | null = "local-imports";
    const action = { type: "toggle", scope: "local-imports", canEdit: true } as const;
    for (const expectedEditing of [false, true]) {
      editingScope = librarySortEditReducer(editingScope, action);
      const isEditing = isLibrarySortEditActive(editingScope, "local-imports", true);
      const html = render({ items, sorting: controls({ isEditing, canReorder: isEditing }) });
      expect(html.includes('class="library-reorder-handle"')).toBe(expectedEditing);
      expect(html.indexOf('data-library-reorder-id="local-second"'))
        .toBeLessThan(html.indexOf(`data-library-reorder-id="${song.id}"`));
    }
    expect(items.map(item => item.songIndex)).toEqual([42, 41]);
  });

  it("keeps the right-side actions together and places sorting directly before import", () => {
    const html = render();
    const search = html.indexOf('class="library-search"');
    const group = html.indexOf('class="library-content-actions"');
    const edit = html.indexOf('class="library-sort-edit-button"');
    const sort = html.indexOf('class="library-sort-trigger"');
    const importArea = html.indexOf('class="library-import-area"');
    expect(search).toBeLessThan(group);
    expect(group).toBeLessThan(edit);
    expect(edit).toBeLessThan(sort);
    expect(sort).toBeLessThan(importArea);
    // The only item between the trigger button and import is the dropdown's
    // screen-reader anchor, if Radix emits one; there is no separate toolbar child.
    expect(html.slice(group, importArea)).not.toContain("</div>");
  });

  it("keeps the same action group in categories without an import button", () => {
    const html = render({ selectedCategory: "liked" });
    expect(html).toContain('class="library-content-actions"');
    expect(html).toContain('class="library-sort-trigger"');
    expect(html).not.toContain('class="library-import-area"');
  });

  it("disables Edit during search and keeps handles hidden", () => {
    const html = render({ hasSearchQuery: true, searchQuery: "Example", sorting: controls({ canEdit: false }) });
    expect(html).toMatch(/class="library-sort-edit-button"[^>]*disabled=""/);
    expect(html).not.toContain('class="library-reorder-handle"');
    expect(html).toContain(uiText["zh-CN"].library.sorting.searchDisabled);
  });

  it("hides editing controls for automatic sorting", () => {
    const html = render({ sorting: controls({ mode: "name-asc", canEdit: false }) });
    expect(html).not.toContain('class="library-sort-edit-button"');
    expect(html).not.toContain('class="library-reorder-handle"');
  });

  it.each([false, true])("preserves normal row/playback affordances while editing=%s", isEditing => {
    const html = render({ sorting: controls({ isEditing, canReorder: isEditing }) });
    expect(html).toContain('role="button" tabindex="0"');
    expect(html).toContain(`aria-label="${uiText["zh-CN"].library.playThisScoreAction}: Example song"`);
    expect(html).toContain('class="library-song-row is-selected');
    expect(html).toContain("Example song");
  });

  it("uses English Edit Order / Done labels", () => {
    const text = uiText["en-US"].library.sorting;
    expect(renderToStaticMarkup(createElement(LibrarySortingControl, { sorting: controls(), disabled: false, text }))).toContain("Edit Order");
    expect(renderToStaticMarkup(createElement(LibrarySortingControl, { sorting: controls({ isEditing: true }), disabled: false, text }))).toContain("Done");
  });
});
