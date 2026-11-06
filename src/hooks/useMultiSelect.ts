// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useState } from "react";
import type { LibrarySongId } from "../types/library";

export type MultiSelectState = {
  enabled: boolean;
  selected: Set<LibrarySongId>;
  isSelected: (songId: LibrarySongId) => boolean;
  toggle: (songId: LibrarySongId) => void;
  selectAll: (songIds: LibrarySongId[]) => void;
  clear: () => void;
  setEnabled: (enabled: boolean) => void;
  count: number;
};

export function useMultiSelect(): MultiSelectState {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<Set<LibrarySongId>>(() => new Set());

  const toggle = useCallback((songId: LibrarySongId) => {
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
    setSelected(new Set(songIds));
  }, []);

  const clear = useCallback(() => {
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
      clear,
      setEnabled,
      count: selected.size,
    }),
    [enabled, selected, isSelected, toggle, selectAll, clear],
  );
}
