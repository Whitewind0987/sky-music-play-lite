export const uiScalePresets = [1, 1.1, 1.2] as const;

export type UiScale = (typeof uiScalePresets)[number];

export const defaultUiScale: UiScale = 1.1;

// Smallest unscaled window the layout is designed for (tauri.conf.json minWidth/minHeight).
export const minimumLayoutWidth = 480;
export const minimumLayoutHeight = 320;

export function isUiScale(value: unknown): value is UiScale {
  return uiScalePresets.some((preset) => preset === value);
}

export function normalizeUiScale(value: unknown): UiScale {
  return isUiScale(value) ? value : defaultUiScale;
}

// Never let the scaled CSS viewport fall below the minimum supported layout size,
// so the largest preset cannot push a small window below 480x320 CSS px.
export function getEffectiveUiScale(
  preferredScale: UiScale,
  windowWidth: number,
  windowHeight: number,
) {
  if (
    !Number.isFinite(windowWidth) ||
    !Number.isFinite(windowHeight) ||
    windowWidth <= 0 ||
    windowHeight <= 0
  ) {
    return preferredScale;
  }

  const maximumScale = Math.min(
    windowWidth / minimumLayoutWidth,
    windowHeight / minimumLayoutHeight,
  );

  return Math.max(1, Math.min(preferredScale, maximumScale));
}
