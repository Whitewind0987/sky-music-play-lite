type EditAction =
  | { type: "toggle"; scope: string | null; canEdit: boolean }
  | { type: "exit" };

// Temporary UI state only. The saved sort preference and song order are never
// changed by entering or leaving editing mode.
export function librarySortEditReducer(editingScope: string | null, action: EditAction) {
  if (action.type === "exit" || !action.canEdit || action.scope === null) return null;
  return editingScope === action.scope ? null : action.scope;
}

export function isLibrarySortEditActive(
  editingScope: string | null, scope: string | null, canEdit: boolean,
) {
  return canEdit && scope !== null && editingScope === scope;
}
