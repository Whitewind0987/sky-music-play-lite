import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getHeaderSearchMode } from "../lib/headerSearchMode";

export type HeaderLibrarySearchProps = {
  closeLabel: string;
  isLibrary: boolean;
  isToolbarVisible: boolean;
  onQueryChange: (query: string) => void;
  openLabel: string;
  placeholder: string;
  query: string;
};

export function HeaderLibrarySearch({
  closeLabel,
  isLibrary,
  isToolbarVisible,
  onQueryChange,
  openLabel,
  placeholder,
  query,
}: HeaderLibrarySearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shouldFocusInputRef = useRef(false);
  const shouldRestoreButtonFocusRef = useRef(false);
  const mode = getHeaderSearchMode({
    hasFocus,
    isLibrary,
    isOpen,
    isToolbarVisible,
  });
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (mode === "field" && shouldFocusInputRef.current) {
      shouldFocusInputRef.current = false;
      inputRef.current?.focus();
    }

    if (mode === "button" && shouldRestoreButtonFocusRef.current) {
      shouldRestoreButtonFocusRef.current = false;
      buttonRef.current?.focus();
    }

    if (mode === "hidden" && isOpen) {
      setIsOpen(false);
    }
  }, [isOpen, mode]);

  function openSearch() {
    shouldFocusInputRef.current = true;
    setIsOpen(true);
  }

  function closeSearch() {
    shouldRestoreButtonFocusRef.current = true;
    setHasFocus(false);
    setIsOpen(false);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) {
      return;
    }

    // Native search inputs clear their value on Escape; closing must keep the query.
    event.preventDefault();
    event.stopPropagation();
    closeSearch();
  }

  if (mode === "hidden") {
    return null;
  }

  if (mode === "button") {
    return (
      <button
        ref={buttonRef}
        className={`icon-action header-search-trigger${
          hasQuery ? " has-query" : ""
        }`}
        type="button"
        aria-label={hasQuery ? `${openLabel}: ${query}` : openLabel}
        title={hasQuery ? `${openLabel}: ${query}` : openLabel}
        onClick={openSearch}
      >
        <Search aria-hidden="true" focusable="false" />
      </button>
    );
  }

  return (
    <div
      className="header-search"
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHasFocus(false);
        }
      }}
      onFocus={() => setHasFocus(true)}
    >
      <Search
        className="header-search-icon"
        aria-hidden="true"
        focusable="false"
      />
      <input
        ref={inputRef}
        className="header-search-input"
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={handleInputKeyDown}
      />
      <button
        className="header-search-close"
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={closeSearch}
      >
        <X aria-hidden="true" focusable="false" />
      </button>
    </div>
  );
}
