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
        playlists={[]}
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
        multiSelect={multiSelectState()}
        playlists={[]}
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

  it("有歌单时提供加入歌单下拉", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        playlists={[
          {
            id: "p1",
            name: "我的本地组",
            songIds: [],
            createdAt: 0,
            updatedAt: 0,
          },
        ]}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).toContain("我的本地组");
    expect(html).toContain("加入歌单");
  });

  it("英文文案可用", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        playlists={[]}
        text={uiText["en-US"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
      />,
    );
    expect(html).toContain("2 selected");
    expect(html).toContain("Delete selected");
  });

  const playlistFixture = [
    {
      id: "p1",
      name: "我的本地组",
      songIds: [],
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  it("不在歌单分类时不显示「从歌单移除」（即使选中过歌单）", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        playlists={playlistFixture}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId="p1"
        isViewingPlaylist={false}
      />,
    );
    expect(html).not.toContain("从歌单移除");
    // 加入歌单仍然可用
    expect(html).toContain("加入歌单");
  });

  it("在歌单分类时显示「从歌单移除」", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        playlists={playlistFixture}
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
        playlists={[]}
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
        playlists={[]}
        text={uiText["zh-CN"].library}
        visibleSongIds={["a", "b"]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup="converted"
      />,
    );
    expect(html).toContain("移至已转换");
    expect(html).not.toContain("移至本地导入");
  });

  it("目标为 imported 时渲染「移至本地导入」", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState()}
        playlists={[]}
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

  it("未选中时移动按钮为禁用状态", () => {
    const html = renderToStaticMarkup(
      <MultiSelectToolbar
        multiSelect={multiSelectState({ selected: new Set(), count: 0 })}
        playlists={[]}
        text={uiText["zh-CN"].library}
        visibleSongIds={[]}
        selectedPlaylistId={null}
        isViewingPlaylist={false}
        moveTargetGroup="converted"
      />,
    );
    // 按钮仍渲染但禁用
    expect(html).toContain("移至已转换");
    expect(html).toContain("disabled");
  });
});
