// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  assignMirrorFolderNames,
  getMirrorFolderNameForCategory,
  isReservedMirrorFolderName,
  stableIdSuffix,
} from "./mirrorFolderNames";

describe("镜像目录命名", () => {
  it("唯一的歌单直接用歌单名（目录最可读）", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "我的歌单" },
      { id: "p2", name: "另一个歌单" },
    ]);

    expect(assignments.get("p1")).toBe("我的歌单");
    expect(assignments.get("p2")).toBe("另一个歌单");
  });

  it("同一歌单每次得到相同目录名", () => {
    const first = assignMirrorFolderNames([{ id: "p1", name: "我的歌单" }]);
    const second = assignMirrorFolderNames([{ id: "p1", name: "我的歌单" }]);

    expect(first.get("p1")).toBe(second.get("p1"));
  });

  it("同名歌单得到不同目录名", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "测试" },
      { id: "p2", name: "测试" },
    ]);

    expect(assignments.get("p1")).not.toBe(assignments.get("p2"));
  });

  it("规范化后同名的歌单（如 测试/A 与 测试:A）也得到不同目录名", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "测试/A" },
      { id: "p2", name: "测试:A" },
    ]);

    expect(assignments.get("p1")).not.toBe(assignments.get("p2"));
  });

  it("大小写不同的歌单也视为冲突", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "Music" },
      { id: "p2", name: "music" },
    ]);

    expect(assignments.get("p1")).not.toBe(assignments.get("p2"));
  });

  it("歌单名与固定分类目录名冲突时加后缀", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "本地导入" },
      { id: "p2", name: "普通歌单" },
    ]);

    expect(assignments.get("p1")).not.toBe("本地导入");
    expect(isReservedMirrorFolderName(assignments.get("p1") ?? "")).toBe(false);
    // 普通歌单不受影响，仍然用原名
    expect(assignments.get("p2")).toBe("普通歌单");
  });

  it("分配结果与传入顺序无关（稳定）", () => {
    const forward = assignMirrorFolderNames([
      { id: "p1", name: "测试" },
      { id: "p2", name: "测试" },
    ]);
    const backward = assignMirrorFolderNames([
      { id: "p2", name: "测试" },
      { id: "p1", name: "测试" },
    ]);

    expect(forward.get("p1")).toBe(backward.get("p1"));
    expect(forward.get("p2")).toBe(backward.get("p2"));
  });

  it("冲突组内每个歌单都拿到唯一目录名", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "测试" },
      { id: "p2", name: "测试" },
      { id: "p3", name: "测试" },
    ]);

    const names = Array.from(assignments.values());
    expect(new Set(names).size).toBe(3);
  });

  it("目录名不含文件系统非法字符", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: 'a/b:c*d?e"f<g>h|i' },
    ]);

    expect(assignments.get("p1")).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("目录名不以空格或点结尾（Windows 限制）", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "名字..." },
    ]);

    expect(assignments.get("p1")?.endsWith(" ")).toBe(false);
    expect(assignments.get("p1")?.endsWith(".")).toBe(false);
  });

  it("空名字回退到占位名", () => {
    const assignments = assignMirrorFolderNames([
      { id: "p1", name: "   " },
    ]);

    expect(assignments.get("p1")).toContain("未命名");
  });

  it("分类目录名不含非法字符且稳定", () => {
    expect(getMirrorFolderNameForCategory("本地导入")).toBe("本地导入");
    expect(getMirrorFolderNameForCategory("已转换")).toBe("已转换");
    expect(getMirrorFolderNameForCategory("我喜欢")).toBe("我喜欢");
  });

  it("后缀是稳定的十六进制串", () => {
    const suffix = stableIdSuffix("playlist-1");

    expect(suffix).toMatch(/^[0-9a-f]{8}$/);
    expect(stableIdSuffix("playlist-1")).toBe(suffix);
    expect(stableIdSuffix("playlist-2")).not.toBe(suffix);
  });

  it("保留分类目录名识别正确", () => {
    expect(isReservedMirrorFolderName("本地导入")).toBe(true);
    expect(isReservedMirrorFolderName(" 已转换 ")).toBe(true);
    expect(isReservedMirrorFolderName("我喜欢")).toBe(true);
    expect(isReservedMirrorFolderName("其他")).toBe(false);
  });
});
