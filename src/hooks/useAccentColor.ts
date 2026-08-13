import { useCallback, useEffect, useState } from "react";
import {
  defaultAccentColor,
  deriveAccentContrastColor,
  deriveAccentHoverColor,
  deriveAccentRgb,
  normalizeAccentColor,
} from "../lib/accentColor";

export function useAccentColor() {
  const [accentColor, setAccentColorState] = useState(defaultAccentColor);

  const setAccentColor = useCallback((value: string) => {
    setAccentColorState(normalizeAccentColor(value));
  }, []);

  const resetAccentColor = useCallback(() => {
    setAccentColorState(defaultAccentColor);
  }, []);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--app-primary", accentColor);
    rootStyle.setProperty(
      "--app-primary-hover",
      deriveAccentHoverColor(accentColor),
    );
    rootStyle.setProperty("--app-primary-rgb", deriveAccentRgb(accentColor));
    rootStyle.setProperty(
      "--app-primary-contrast",
      deriveAccentContrastColor(accentColor),
    );
  }, [accentColor]);

  return {
    accentColor,
    applyPersistedAccentColor: setAccentColor,
    resetAccentColor,
    setAccentColor,
  };
}
