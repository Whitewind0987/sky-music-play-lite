// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * 镜像目录命名规则。
 *
 * 「曲谱分类」目录下的每个子目录对应一个分类或一个歌单。目录名必须满足：
 * ① 不同歌单绝不共用同一个目录（否则一个歌单的曲谱会混进另一个歌单）；
 * ② 与固定分类目录（本地导入 / 已转换 / 我喜欢）绝不冲突；
 * ③ 同一歌单每次同步得到相同目录名（保证镜像稳定、可去重）。
 *
 * 命名策略：**默认用歌单原名**（目录可读性最好），只有在确实会撞车时才加
 * 「歌单 ID 派生哈希」后缀区分。撞车判定基于整个歌单列表，因此结果稳定：
 * 同一组歌单无论以什么顺序传入，都得到同样的目录名分配。
 */

/** 自动镜像区里的固定分类目录名，不能被任何歌单占用。 */
export const RESERVED_MIRROR_FOLDER_NAMES = [
  "本地导入",
  "已转换",
  "我喜欢",
] as const;

const RESERVED_MIRROR_FOLDER_NAME_SET: ReadonlySet<string> = new Set(
  RESERVED_MIRROR_FOLDER_NAMES,
);

export function isReservedMirrorFolderName(name: string): boolean {
  return RESERVED_MIRROR_FOLDER_NAME_SET.has(name.trim());
}

/**
 * 去掉文件名非法字符，并把连续空白压成单个空格。
 * 与 Rust 侧 `sanitize_score_title_segment` 的规则保持一致。
 */
function sanitizeFolderTitle(title: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .]+$/, "");

  return sanitized.length > 0 ? sanitized : "未命名";
}

/**
 * FNV-1a 64bit，取低 8 位十六进制作为目录名后缀。
 *
 * 刻意不使用任何依赖运行时实现的哈希，保证同一歌单在任何环境下都得到
 * 相同的目录名（镜像稳定、可去重），不同歌单得到不同目录名（不会撞车）。
 */
export function stableIdSuffix(id: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  // 按 UTF-8 字节参与哈希。
  for (const byte of new TextEncoder().encode(id)) {
    hash = (hash ^ BigInt(byte)) & mask;
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0").slice(0, 8);
}

/** 参与命名分配的歌单信息。 */
export type MirrorPlaylistNamingInput = {
  id: string;
  name: string;
};

/**
 * 为一批歌单分配互不相同的镜像目录名。
 *
 * 规则：
 * * 规范化后唯一的歌单 → 直接用歌单名（最可读）；
 * * 规范化后重名的歌单 → 全部加上 ID 派生后缀（保持稳定且互不相同）；
 * * 与固定分类目录名冲突的歌单 → 加上 ID 派生后缀。
 *
 * 返回 Map，key 为歌单 ID，value 为目录名。
 */
export function assignMirrorFolderNames(
  playlists: MirrorPlaylistNamingInput[],
): Map<string, string> {
  const assignments = new Map<string, string>();

  // 先按规范化后的标题分组：同组即冲突。
  const groups = new Map<string, MirrorPlaylistNamingInput[]>();

  for (const playlist of playlists) {
    const title = sanitizeFolderTitle(playlist.name);
    const key = title.toLocaleLowerCase();
    const group = groups.get(key);

    if (group) {
      group.push(playlist);
    } else {
      groups.set(key, [playlist]);
    }
  }

  for (const group of groups.values()) {
    const conflicts =
      group.length > 1 || isReservedMirrorFolderName(sanitizeFolderTitle(group[0].name));

    // 冲突组：按 ID 排序后分配，保证与传入顺序无关。
    const ordered = conflicts
      ? [...group].sort((left, right) => left.id.localeCompare(right.id))
      : group;

    for (const playlist of ordered) {
      const title = sanitizeFolderTitle(playlist.name);

      assignments.set(
        playlist.id,
        conflicts ? `${title}__${stableIdSuffix(playlist.id)}` : title,
      );
    }
  }

  return assignments;
}

/**
 * 固定分类（本地导入 / 已转换 / 我喜欢）使用的目录名。
 */
export function getMirrorFolderNameForCategory(categoryName: string): string {
  return sanitizeFolderTitle(categoryName);
}
