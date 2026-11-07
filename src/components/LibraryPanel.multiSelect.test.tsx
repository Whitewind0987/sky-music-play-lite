// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryPanel } from "./LibraryPanel";
import { uiText } from "../i18n/uiText";
import { createLibrarySong } from "../lib/libraryCollections";
import { createDefaultV1ToV2UpgradePreferences } from "../lib/v1ToV2UpgradePreferences";
import type { LibrarySortingControls } from "../types/librarySorting";
import type { ComponentProps } from "react";

const noOp = () => {};

function controls(): LibrarySortingControls {
  return {
    mode: "added-asc",
    supportsAdded: true,
    canEdit: false,
    isEditing: false,
    canReorder: false,
    onToggleEditing: noOp,
    onModeChange: noOp,
    onReorder: noOp,
  };
}

function props(overrides: Partial<ComponentProps<typeof LibraryPanel>> = {}) {
  const song = createLibrarySong(
    {
      name: "Example song",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: false,
      songNotes: [{ time: 100, key: "Key0" }],
    },
    1,
  );
  return {
    items: [{ librarySong: song, songIndex: 41, isLiked: false }],
    sorting: controls(),
    playbackSongId: null,
    playbackState: "idle",
    manualState: "idle",
    builtInPagination: null,
    hasSearchQuery: false,
    importDisabled: false,
    importError: "",
    isQueueOpen: false,
    locateScoreRequest: null,
    playlists: [],
    searchQuery: "",
    selectedCategory: "local-imports",
    selectedPlaylist: null,
    selectedPlaylistId: null,
    selectedSongIndex: 41,
    isV1ToV2UpgradePreferenceReady: true,
    upgradeBlocked: false,
    v1ToV2UpgradePreferences: createDefaultV1ToV2UpgradePreferences(),
    text: uiText["zh-CN"].library,
    isBuiltInSongLoading: () => false,
    isLocalSongExporting: () => false,
    onAddSongToPlaylist: () => ({ status: "added" }),
    onAddToQueue: noOp,
    onCreatePlaylistWithSong: noOp,
    onCreatePlaylistRequest: noOp,
    onDeleteLocalSong: noOp,
    onExportLocalSong: noOp,
    onRevealLocalSongFile: noOp,
    onExportPlaylistToFolder: noOp,
    onArchiveLibraryToFolders: noOp,
    onMoveLocalSong: noOp,
    onDeletePlaylist: noOp,
    onImportFiles: noOp,
    onLocateSelectedSong: noOp,
    onPaginationNotice: noOp,
    onPrepareSong: noOp,
    onPlaySong: noOp,
    onPlayAll: noOp,
    onPlaySongNext: noOp,
    onRemoveFromLiked: noOp,
    onRemoveSongFromPlaylist: noOp,
    onRenamePlaylist: noOp,
    onResolveUpgradeSource: async () => null,
    onUpgradeSourceLoadFailed: noOp,
    onUpgradeBlocked: noOp,
    onUpgradeSongToV2: async () => ({ status: "failed" }),
    onV1ToV2UpgradePreferencesChange: noOp,
    onSelectSong: noOp,
    onToggleLiked: noOp,
    multiSelect: {
      enabled: false,
      selected: new Set(),
      count: 0,
      isSelected: () => false,
      toggle: noOp,
      selectAll: noOp,
      clear: noOp,
      setEnabled: noOp,
    },
    ...overrides,
  } as ComponentProps<typeof LibraryPanel>;
}

describe("LibraryPanel 多选入口", () => {
  it("默认渲染「多选」按钮", () => {
    const html = renderToStaticMarkup(createElement(LibraryPanel, props()));
    expect(html).toContain("多选");
  });

  it("多选开启时渲染批量操作条", () => {
    const html = renderToStaticMarkup(
      createElement(
        LibraryPanel,
        props({
          multiSelect: {
            enabled: true,
            selected: new Set(["x"]),
            count: 1,
            isSelected: () => true,
            toggle: noOp,
            selectAll: noOp,
            clear: noOp,
            setEnabled: noOp,
          },
        }),
      ),
    );
    expect(html).toContain("已选 1 首");
    expect(html).toContain("删除所选");
  });

  it("多选开启时行首出现勾选框", () => {
    const html = renderToStaticMarkup(
      createElement(
        LibraryPanel,
        props({
          multiSelect: {
            enabled: true,
            selected: new Set(),
            count: 0,
            isSelected: () => false,
            toggle: noOp,
            selectAll: noOp,
            clear: noOp,
            setEnabled: noOp,
          },
        }),
      ),
    );
    expect(html).toContain("library-multi-select-checkbox");
    expect(html).toContain('role="checkbox"');
  });
});
