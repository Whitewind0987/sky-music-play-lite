import { useEffect, useState } from "react";
import {
  defaultKeyMapping,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";

const ignoredKeyMappingKeys = new Set(["Alt", "Control", "Meta", "Shift"]);
const letterKeyPattern = /^[a-z]$/i;

function getBindableKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (ignoredKeyMappingKeys.has(event.key)) {
    return null;
  }

  if (letterKeyPattern.test(event.key)) {
    return event.key.toLowerCase();
  }

  return event.key;
}

export function useKeyMapping() {
  const [keyMapping, setKeyMapping] = useState(defaultKeyMapping);
  const [listeningSkyKey, setListeningSkyKey] =
    useState<SkyKeyName | null>(null);

  useEffect(() => {
    if (listeningSkyKey === null) {
      return;
    }

    const skyKeyBeingMapped = listeningSkyKey;

    function handleKeyMappingKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setListeningSkyKey(null);
        return;
      }

      const bindableKey = getBindableKey(event);

      if (bindableKey === null) {
        return;
      }

      setKeyMapping((currentMapping) => ({
        ...currentMapping,
        [skyKeyBeingMapped]: bindableKey,
      }));
      setListeningSkyKey(null);
    }

    window.addEventListener("keydown", handleKeyMappingKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyMappingKeyDown);
    };
  }, [listeningSkyKey]);

  function handleStartKeyMappingListen(skyKey: SkyKeyName) {
    setListeningSkyKey(skyKey);
  }

  function applyKeyMapping(nextKeyMapping: KeyMapping) {
    setKeyMapping(nextKeyMapping);
    setListeningSkyKey(null);
  }

  return {
    applyKeyMapping,
    handleStartKeyMappingListen,
    keyMapping,
    listeningSkyKey,
  };
}
