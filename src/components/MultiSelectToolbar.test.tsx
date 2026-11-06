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
      />,
    );
    expect(html).toContain("2 selected");
    expect(html).toContain("Delete selected");
  });
});
