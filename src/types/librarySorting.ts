export const librarySortModes = [
  "custom", "name-asc", "name-desc", "added-desc", "added-asc",
  "duration-asc", "duration-desc",
] as const;

export type LibrarySortMode = (typeof librarySortModes)[number];
export type LibrarySortPreference = {
  mode: LibrarySortMode;
  customOrder: string[];
};
export type LibrarySortingPreferences = Record<string, LibrarySortPreference>;
export type LibraryDropPosition = "before" | "after";

export type LibrarySortingControls = {
  mode: LibrarySortMode;
  supportsAdded: boolean;
  canReorder: boolean;
  onModeChange: (mode: LibrarySortMode) => void;
  onReorder: (songId: string, targetId: string, position: LibraryDropPosition) => void;
};
