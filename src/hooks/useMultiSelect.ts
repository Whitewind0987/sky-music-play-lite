// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useRef, useState } from "react";
import type { LibrarySongId } from "../types/library";

export type MultiSelectState = {
  enabled: boolean;
  selected: Set<LibrarySongId>;
  isSelected: (songId: LibrarySongId) => boolean;
  toggle: (songId: LibrarySongId) => void;
  selectAll: (songIds: LibrarySongId[]) => void;
  /**
   * 范围选择：把 orderedIds 里 anchor 到 toId 之间的所有曲谱并入选中集。
   * anchor 是上一次交互的曲谱（toggle 自动更新）。
   */
  selectRange: (toId: LibrarySongId, orderedIds: LibrarySongId[]) => void;
  clear: () => void;
  setEnabled: (enabled: boolean) => void;
  count: number;
};

export function useMultiSelect(): MultiSelectState {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<Set<LibrarySongId>>(() => new Set());
  const anchorRef = useRef<LibrarySongId | null>(null);

  const toggle = useCallback((songId: LibrarySongId) => {
    anchorRef.current = songId;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((songIds: LibrarySongId[]) => {
    anchorRef.current = songIds.length > 0 ? songIds[0] : null;
    setSelected(new Set(songIds));
  }, []);

  const selectRange = useCallback(
    (toId: LibrarySongId, orderedIds: LibrarySongId[]) => {
      const anchor = anchorRef.current;
      if (!anchor || anchor === toId) {
        // 没有 anchor 就退化为单选
        setSelected((current) => {
          const next = new Set(current);
          next.add(toId);
          return next;
        });
        anchorRef.current = toId;
        return;
      }

      const from = orderedIds.indexOf(anchor);
      const to = orderedIds.indexOf(toId);
      if (from < 0 || to < 0) {
        // anchor 不在当前列表里（跨分类等），退化为单选
        setSelected((current) => {
          const next = new Set(current);
          next.add(toId);
          return next;
        });
        anchorRef.current = toId;
        return;
      }

      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelected((current) => {
        const next = new Set(current);
        for (let index = lo; index <= hi; index += 1) {
          next.add(orderedIds[index]);
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelected(new Set());
  }, []);

  const isSelected = useCallback(
    (songId: LibrarySongId) => selected.has(songId),
    [selected],
  );

  return useMemo(
    () => ({
      enabled,
      selected,
      isSelected,
      toggle,
      selectAll,
      selectRange,
      clear,
      setEnabled,
      count: selected.size,
    }),
    [enabled, selected, isSelected, toggle, selectAll, selectRange, clear],
  );
}
