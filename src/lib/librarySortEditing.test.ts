import { describe, expect, it } from "vitest";
import { isLibrarySortEditActive, librarySortEditReducer } from "./librarySortEditing";
import { canManuallyReorder, reorderSongIds, updateLibrarySortMode } from "./librarySorting";
import type { LibrarySortingPreferences } from "../types/librarySorting";

const scope = "local-imports";

describe("temporary library sorting edit mode", () => {
  it("starts in normal viewing mode even when Custom Order is selected", () => {
    expect(isLibrarySortEditActive(null, scope, true)).toBe(false);
  });

  it("enters editing on Edit, exits on Done and supports reopening", () => {
    const enter = { type: "toggle", scope, canEdit: true } as const;
    const editing = librarySortEditReducer(null, enter);
    expect(isLibrarySortEditActive(editing, scope, true)).toBe(true);
    const done = librarySortEditReducer(editing, enter);
    expect(done).toBeNull();
    expect(isLibrarySortEditActive(done, scope, true)).toBe(false);
    expect(isLibrarySortEditActive(librarySortEditReducer(done, enter), scope, true)).toBe(true);
  });

  it("leaves reordered songs intact after Done and after reopening", () => {
    const order = ["a", "b", "c"];
    const editing = librarySortEditReducer(null, { type: "toggle", scope, canEdit: true });
    expect(isLibrarySortEditActive(editing, scope, true)).toBe(true);
    const reordered = reorderSongIds(order, "c", "a", "before", order);
    const done = librarySortEditReducer(editing, { type: "toggle", scope, canEdit: true });
    expect(done).toBeNull();
    expect(reordered).toEqual(["c", "a", "b"]);
    expect(librarySortEditReducer(done, { type: "toggle", scope, canEdit: true })).toBe(scope);
    expect(reordered).toEqual(["c", "a", "b"]);
  });

  it("exits when changing sort mode and does not resume when returning to Custom", () => {
    let editing = librarySortEditReducer(null, { type: "toggle", scope, canEdit: true });
    const preference: LibrarySortingPreferences = { [scope]: { mode: "custom", customOrder: ["b", "a"] } };
    const automatic = updateLibrarySortMode(preference, scope, "name-asc");
    expect(isLibrarySortEditActive(editing, scope, false)).toBe(false);
    editing = librarySortEditReducer(editing, { type: "exit" });
    const restored = updateLibrarySortMode(automatic, scope, "custom");
    expect(isLibrarySortEditActive(editing, scope, true)).toBe(false);
    expect(restored[scope].customOrder).toEqual(["b", "a"]);
  });

  it.each(["built-in", "liked", "playlist:one", "playlist:two"])(
    "does not leak editing into %s or restore it when returning", nextScope => {
      const editing = librarySortEditReducer(null, { type: "toggle", scope, canEdit: true });
      expect(isLibrarySortEditActive(editing, nextScope, true)).toBe(false);
      const exited = librarySortEditReducer(editing, { type: "exit" });
      expect(isLibrarySortEditActive(exited, scope, true)).toBe(false);
    },
  );

  it.each([["query", ""], ["", "deferred query"]])("keeps search restrictions for %j/%j", (query, deferred) => {
    const canEdit = canManuallyReorder("custom", query, deferred);
    expect(librarySortEditReducer(null, { type: "toggle", scope, canEdit })).toBeNull();
    expect(isLibrarySortEditActive(scope, scope, canEdit)).toBe(false);
    const exited = librarySortEditReducer(scope, { type: "exit" });
    expect(isLibrarySortEditActive(exited, scope, true)).toBe(false);
  });

  it("does not allow editing without a playlist or while automatic sorting is active", () => {
    expect(librarySortEditReducer(null, { type: "toggle", scope: null, canEdit: true })).toBeNull();
    expect(librarySortEditReducer(null, {
      type: "toggle", scope, canEdit: canManuallyReorder("name-asc", "", ""),
    })).toBeNull();
  });

  it("restores the saved order but not the editing session after restart", () => {
    const saved = JSON.stringify({ [scope]: { mode: "custom", customOrder: ["c", "a", "b"] } });
    const preferences: LibrarySortingPreferences = JSON.parse(saved);
    expect(preferences[scope].customOrder).toEqual(["c", "a", "b"]);
    expect(saved).not.toMatch(/isEditing|editingScope/);
    expect(isLibrarySortEditActive(null, scope, true)).toBe(false);
  });
});
