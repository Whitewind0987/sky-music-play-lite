import { defaultUiScale, getEffectiveUiScale, type UiScale } from "./uiScale";

export const uiScaleResizeDelayMs = 150;

type UiScaleControllerOptions = {
  readWindowSize: () => Promise<{ width: number; height: number }>;
  applyZoom: (scale: number) => Promise<void>;
};

// Keep resize work outside React. Only inspect the native, unzoomed client size
// after resizing pauses; changing WebView zoom during a drag adds another reflow.
export function createUiScaleController({
  readWindowSize,
  applyZoom,
}: UiScaleControllerOptions) {
  let preferredScale = defaultUiScale;
  let appliedZoom = 1;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function updateZoom() {
    const requestedRevision = ++revision;

    // Serialize native calls, and discard obsolete size reads/preferences. An
    // in-flight successful zoom must still be recorded even if a newer request
    // arrives, so that the next request can restore the latest desired value.
    pending = pending
      .then(async () => {
        if (requestedRevision !== revision) return;

        const { width, height } = await readWindowSize();
        if (requestedRevision !== revision) return;

        const scale = getEffectiveUiScale(preferredScale, width, height);
        if (scale === appliedZoom) return;

        await applyZoom(scale);
        appliedZoom = scale;
      })
      .catch(() => {
        // Browser previews have no native window. Failed native operations remain
        // retryable at the next preference change or settled resize.
      });
  }

  return {
    setPreferredScale(scale: UiScale) {
      preferredScale = scale;
      clearTimer();
      updateZoom();
    },
    handleResize() {
      ++revision;
      clearTimer();
      timer = setTimeout(updateZoom, uiScaleResizeDelayMs);
    },
    cancel() {
      ++revision;
      clearTimer();
    },
  };
}
