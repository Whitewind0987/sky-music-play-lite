// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiSelectToolbar } from "./MultiSelectToolbar";
import { uiText } from "../i18n/uiText";
import type { LibrarySongId } from "../types/library";
import type { MultiSelectState } from "../hooks/useMultiSelect";

function multiSelectState(overrides: Partial<MultiSelectState> = {}): MultiSelectState {
  return {
    enabled: true,
    selected: new Set<LibrarySongId>(["a", "b"]),
    count: 2,
    isSelected: (songId) => songId === "a" || songId === "b",
    toggle: () => {},
    selectAll: () => {},
    deselect: () => {},
    clear: () => {},
    setEnabled: () => {},
    ...overrides,
  };
}

describe("MultiSelectToolbar", () => {
  it("不渲染（未开启多选）", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState({ enabled: false })}
        text={uiText["zh-CN"].library}
        visibleSongIds={[]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).toBe("");
  });

  it("显示已选数量与批量操作按钮", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        showDeleteSelected
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).toContain("已选 2 首");
    expect(html).toContain("删除所选");
    expect(html).toContain("全选本页");
    expect(html).toContain("清空选择");
  });

  it("没有歌单时也提供加入歌单弹窗入口", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        onOpenAddToPlaylist={() => {}}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).not.toContain("<select");
    expect(html).toContain("加入歌单");
  });

  it("英文文案可用", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        showDeleteSelected
        text={uiText["en-US"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).toContain("2 selected");
    expect(html).toContain("Delete selected");
  });

  it("不在歌单分类时不显示「从歌单移除」（即使选中过歌单）", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId="p1"
        isViewingPlaylist={false}
      />,
    );
    expect(html).not.toContain("从歌单移除");
    expect(html).toContain("加入歌单");
  });

  it("在歌单分类时显示「从歌单移除」", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId="p1"
        isViewingPlaylist
      />,
    );
    expect(html).toContain("从歌单移除");
  });

  it("moveTargetGroup 为 null 时不渲染移动按钮", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup={null}
      />,
    );
    expect(html).not.toContain("移至已转换");
    expect(html).not.toContain("移至本地导入");
  });

  it("目标为 converted 时渲染「移至已转换」", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup="converted"
        convertibleSelectionCount={1}
      />,
    );
    expect(html).toContain("移至已转换（1 首）");
    expect(html).toContain("1 首 V1 曲谱将留在本地导入");
    expect(html).not.toContain("移至本地导入");
  });

  it("目标为 imported 时渲染「移至本地导入」", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup="imported"
      />,
    );
    expect(html).toContain("移至本地导入");
    expect(html).not.toContain("移至已转换");
  });

  it("没有可移动的 V2 时隐藏移动按钮", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        text={uiText["zh-CN"].library}
        visibleSongIds={[]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup="converted"
      />,
    );
    expect(html).not.toContain("移至已转换");
  });
});
