import { useCallback, useEffect, useRef, useState } from "react";
import { setWebviewZoom } from "../lib/tauriApi";
import {
  defaultUiScale,
  getEffectiveUiScale,
  normalizeUiScale,
  type UiScale,
} from "../lib/uiScale";

// Applies the UI size preset through the webview's zoom factor. Webview zoom
// reflows layout in CSS pixels, so fonts, icons, controls, `vh` units, media
// queries, and pointer coordinates all stay consistent. CSS `zoom` on <html>
// and `transform: scale()` both break `100vh` and responsive breakpoints.
export function useUiScale() {
  const [uiScale, setUiScaleState] = useState<UiScale>(defaultUiScale);
  const appliedZoomRef = useRef(1);
  const [windowSize, setWindowSize] = useState(readWindowSize);

  const setUiScale = useCallback((value: unknown) => {
    setUiScaleState(normalizeUiScale(value));
  }, []);

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        height: window.innerHeight * appliedZoomRef.current,
        width: window.innerWidth * appliedZoomRef.current,
      });
    }

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const effectiveUiScale = getEffectiveUiScale(
    uiScale,
    windowSize.width,
    windowSize.height,
  );

  useEffect(() => {
    if (appliedZoomRef.current === effectiveUiScale) {
      return;
    }

    appliedZoomRef.current = effectiveUiScale;
    void setWebviewZoom(effectiveUiScale).catch(() => {
      // Not running inside Tauri (e.g. plain browser preview); keep 100%.
      appliedZoomRef.current = 1;
    });
  }, [effectiveUiScale]);

  return {
    applyPersistedUiScale: setUiScale,
    setUiScale,
    uiScale,
  };
}

function readWindowSize() {
  return { height: window.innerHeight, width: window.innerWidth };
}
