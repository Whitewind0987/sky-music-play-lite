import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { LibrarySongListItem } from "../types/library";
import type { LibraryDropPosition, LibrarySortingControls } from "../types/librarySorting";
import { getAdjacentReorderTarget, getDragAutoScrollDelta, reorderSongIds } from "../lib/librarySorting";
import { getLibrarySongName } from "../lib/libraryCollections";

const dragType = "application/x-skymusicplay-library-song";
type DropTarget = { id: string; position: LibraryDropPosition };

export function useLibraryRowReorder(
  items: LibrarySongListItem[], sorting: LibrarySortingControls, context: string, movedText: string, rowNumberStart: number,
) {
  const tableRef = useRef<HTMLElement | null>(null);
  const draggedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const pointRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const visibleIds = items.map(item => item.librarySong.id);

  const end = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    draggedRef.current = null;
    scrollRef.current = null;
    setDraggedId(null);
    setTarget(null);
  }, []);

  useEffect(() => {
    end();
    return end;
  }, [items, sorting.canReorder, context, end]);

  useEffect(() => {
    function track(event: globalThis.DragEvent) {
      if (draggedRef.current !== null) pointRef.current = { x: event.clientX, y: event.clientY };
    }
    document.addEventListener("dragover", track, true);
    document.addEventListener("drop", end);
    document.addEventListener("dragend", end);
    return () => {
      document.removeEventListener("dragover", track, true);
      document.removeEventListener("drop", end);
      document.removeEventListener("dragend", end);
    };
  }, [end]);

  function identifyTarget(row: HTMLElement, y: number) {
    const rect = row.getBoundingClientRect();
    const id = row.dataset.libraryReorderId;
    if (!id || id === draggedRef.current) { setTarget(null); return; }
    const position = y < rect.top + rect.height / 2 ? "before" : "after";
    setTarget(current => current?.id === id && current.position === position ? current : { id, position });
  }

  function scrollFrame() {
    if (draggedRef.current === null) return;
    const container = scrollRef.current;
    if (container) {
      const { x, y } = pointRef.current;
      const bounds = container.getBoundingClientRect();
      const delta = x >= bounds.left && x <= bounds.right
        ? getDragAutoScrollDelta(y, bounds.top, bounds.bottom) : 0;
      if (delta !== 0) {
        container.scrollTop += delta;
        const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-library-reorder-id]");
        if (row && tableRef.current?.contains(row)) identifyTarget(row, y);
      }
    }
    frameRef.current = window.requestAnimationFrame(scrollFrame);
  }

  function commit(songId: string, targetId: string, position: LibraryDropPosition) {
    if (!sorting.canReorder || !visibleIds.includes(songId) || !visibleIds.includes(targetId)) return;
    const next = reorderSongIds(visibleIds, songId, targetId, position, visibleIds);
    if (next === visibleIds) return;
    sorting.onReorder(songId, targetId, position);
    const item = items.find(item => item.librarySong.id === songId);
    setAnnouncement(movedText
      .replace("{name}", item ? getLibrarySongName(item.librarySong) : songId)
      .replace("{position}", String(next.indexOf(songId) + rowNumberStart)));
  }

  function accepts(event: DragEvent) {
    return sorting.canReorder && draggedRef.current !== null &&
      Array.from(event.dataTransfer.types).includes(dragType) &&
      !Array.from(event.dataTransfer.types).includes("Files");
  }

  return {
    tableRef, announcement,
    draggedId: sorting.canReorder ? draggedId : null,
    target: sorting.canReorder ? target : null,
    move(songId: string, direction: -1 | 1) {
      const adjacent = getAdjacentReorderTarget(visibleIds, songId, direction);
      if (adjacent !== null) commit(songId, adjacent, direction === -1 ? "before" : "after");
    },
    handleProps(songId: string) {
      return {
        draggable: sorting.canReorder,
        onDragStart(event: DragEvent<HTMLButtonElement>) {
          if (!sorting.canReorder) { event.preventDefault(); return; }
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(dragType, songId);
          draggedRef.current = songId;
          setDraggedId(songId);
          const container = event.currentTarget.closest(".app-layout");
          scrollRef.current = container instanceof HTMLElement ? container : null;
          pointRef.current = { x: event.clientX, y: event.clientY };
          frameRef.current = window.requestAnimationFrame(scrollFrame);
        },
        onDragEnd: end,
      };
    },
    rowProps(songId: string) {
      return {
        "data-library-reorder-id": songId,
        onDragOver(event: DragEvent<HTMLDivElement>) {
          if (!accepts(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          identifyTarget(event.currentTarget, event.clientY);
        },
        onDrop(event: DragEvent<HTMLDivElement>) {
          if (!accepts(event)) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          commit(draggedRef.current!, songId, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
          end();
        },
      };
    },
  };
}
