import type { MultiSelectState } from "../hooks/useMultiSelect";
import type { LibrarySortingControls } from "../types/librarySorting";

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

export function getLibraryEditModeActions(
  multiSelect: Pick<MultiSelectState, "enabled" | "clear" | "setEnabled">,
  sorting: Pick<LibrarySortingControls, "isEditing" | "onToggleEditing">,
) {
  return {
    toggleMultiSelect() {
      if (multiSelect.enabled) multiSelect.clear();
      else if (sorting.isEditing) sorting.onToggleEditing();
      multiSelect.setEnabled(!multiSelect.enabled);
    },
    toggleSorting() {
      if (!sorting.isEditing && multiSelect.enabled) {
        multiSelect.clear();
        multiSelect.setEnabled(false);
      }
      sorting.onToggleEditing();
    },
  };
}
