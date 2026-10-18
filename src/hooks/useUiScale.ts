import { useCallback, useEffect, useState } from "react";
import { readNativeWindowSize, setWebviewZoom } from "../lib/tauriApi";
import { createUiScaleController } from "../lib/uiScaleController";
import {
  defaultUiScale,
  normalizeUiScale,
  type UiScale,
} from "../lib/uiScale";

// Preserve WebView zoom's CSS viewport/media-query behavior without rendering
// the entire App or adjusting zoom for every live window resize event.
export function useUiScale() {
  const [uiScale, setUiScaleState] = useState<UiScale>(defaultUiScale);
  const [controller] = useState(() =>
    createUiScaleController({
      readWindowSize: readNativeWindowSize,
      applyZoom: setWebviewZoom,
    }),
  );

  const setUiScale = useCallback((value: unknown) => {
    setUiScaleState(normalizeUiScale(value));
  }, []);

  useEffect(() => {
    window.addEventListener("resize", controller.handleResize);

    return () => {
      window.removeEventListener("resize", controller.handleResize);
      controller.cancel();
    };
  }, [controller]);

  useEffect(() => {
    controller.setPreferredScale(uiScale);
  }, [controller, uiScale]);

  return {
    applyPersistedUiScale: setUiScale,
    setUiScale,
    uiScale,
  };
}
