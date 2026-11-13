// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only
// 回归测试：多选勾选框不能破坏 .library-song-row 的 grid 列布局

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

function makeProps(enabled: boolean, selectedIds: string[] = []) {
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
  // 测试用例传入的 id 未必与 createLibrarySong 生成的真实 id 一致，
  // 这里统一以真实 song.id 为准（除非显式要求未选中）
  const selected = new Set(
    selectedIds.includes("__none__") ? [] : [song.id],
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
      enabled,
      selected,
      count: selected.size,
      isSelected: (id: string) => selected.has(id),
      toggle: noOp,
      selectAll: noOp,
      clear: noOp,
      setEnabled: noOp,
    },
  } as unknown as ComponentProps<typeof LibraryPanel>;
}

function rowInner(html: string): string {
  const start = html.indexOf('class="library-song-row');
  if (start < 0) return "";
  // 找到该行的结束 </div>（用简单深度计数）
  let depth = 0;
  let i = start;
  const tagRe = /<\/?div\b/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[0].startsWith("</") ? -1 : 1;
    i = m.index + m[0].length;
    if (depth === 0) {
      return html.slice(start, i);
    }
  }
  return html.slice(start, i);
}

describe("多选勾选框不破坏表格布局", () => {
  it("勾选框必须位于 .library-song-index 内部（不能是行的直接子元素）", () => {
    const html = renderToStaticMarkup(
      createElement(LibraryPanel, makeProps(true)),
    );
    const row = rowInner(html);
    expect(row).toContain("library-multi-select-checkbox");

    // 勾选框应在 library-song-index 容器内
    const indexStart = row.indexOf('class="library-song-index');
    const checkboxStart = row.indexOf("library-multi-select-checkbox");
    const indexEnd = row.indexOf("</span>", indexStart);

    expect(indexStart).toBeGreaterThanOrEqual(0);
    expect(checkboxStart).toBeGreaterThan(indexStart);
    // 勾选框出现在序号列的结束标签之前
    expect(checkboxStart).toBeLessThan(indexEnd);
  });

  it("行首直接子元素数量与列数一致（多选不新增 grid item）", () => {
    const off = renderToStaticMarkup(
      createElement(LibraryPanel, makeProps(false)),
    );
    const on = renderToStaticMarkup(
      createElement(LibraryPanel, makeProps(true)),
    );
    const offRow = rowInner(off);
    const onRow = rowInner(on);

    // 数一数行内的顶层 span/button/div（grid item）
    const countGridItems = (row: string) => {
      // 顶层元素：紧跟 class="library-song-row..." 之后、深度为 1 的标签
      const body = row.slice(row.indexOf(">") + 1);
      let depth = 0;
      let items = 0;
      const re = /<(\/?)(span|button|div)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        if (m[1] === "/") {
          depth -= 1;
        } else {
          if (depth === 0) items += 1;
          depth += 1;
        }
        if (m[0].endsWith("/>")) {
          if (depth === 0) items += 1;
          depth -= 1;
        }
      }
      return items;
    };

    expect(countGridItems(onRow)).toBe(countGridItems(offRow));
  });

  it("多选时行带 is-multi-select / is-multi-selected 类", () => {
    const html = renderToStaticMarkup(
      createElement(LibraryPanel, makeProps(true)),
    );
    expect(html).toContain("is-multi-select");
    expect(html).toContain("is-multi-selected");
  });
});
