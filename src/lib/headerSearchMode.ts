export type HeaderSearchMode = "hidden" | "button" | "field";

export type HeaderSearchModeInput = {
  hasFocus: boolean;
  isLibrary: boolean;
  isOpen: boolean;
  isToolbarVisible: boolean;
};

export function getHeaderSearchMode({
  hasFocus,
  isLibrary,
  isOpen,
  isToolbarVisible,
}: HeaderSearchModeInput): HeaderSearchMode {
  if (!isLibrary) {
    return "hidden";
  }

  // Keep an expanded field that is being typed into, even if filtering
  // shortens the list enough to bring the toolbar search back into view.
  if (isOpen && (!isToolbarVisible || hasFocus)) {
    return "field";
  }

  return isToolbarVisible ? "hidden" : "button";
}
