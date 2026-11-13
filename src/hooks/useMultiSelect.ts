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
  deselect: (songIds: readonly LibrarySongId[]) => void;
  setEnabled: (enabled: boolean) => void;
  count: number;
};

export function useMultiSelect(scopeKey: string): MultiSelectState {
  const [enabled, setEnabled] = useState(false);
  // Each visit has its own scope, including a return to a previously opened playlist.
  const scope = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const [selection, setSelection] = useState(() => ({ scope, ids: new Set<LibrarySongId>() }));
  const current = selection.scope === scope ? selection : { scope, ids: new Set<LibrarySongId>() };
  if (current !== selection) {
    setSelection(current);
  }
  const selected = current.ids;

  const setSelected = useCallback((update: (ids: Set<LibrarySongId>) => Set<LibrarySongId>) => {
    setSelection(previous => previous.scope === scope
      ? { scope, ids: update(previous.ids) }
      : previous);
  }, [scope]);

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
  }, [setSelected]);

  const selectAll = useCallback((songIds: LibrarySongId[]) => {
    setSelected(() => new Set(songIds));
  }, [setSelected]);

  const clear = useCallback(() => {
    setSelected(() => new Set());
  }, [setSelected]);

  const deselect = useCallback((songIds: readonly LibrarySongId[]) => {
    const removed = new Set(songIds);
    setSelected(ids => new Set([...ids].filter(id => !removed.has(id))));
  }, [setSelected]);

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
      deselect,
      setEnabled,
      count: selected.size,
    }),
    [enabled, selected, isSelected, toggle, selectAll, clear, deselect],
  );
}
