import { useCallback, useState } from "react";
import {
  createDefaultV1ToV2UpgradePreferences,
  sanitizeV1ToV2UpgradePreferences,
} from "../lib/v1ToV2UpgradePreferences";
import type { V1ToV2UpgradePreferences } from "../types/v1ToV2Upgrade";

export function useV1ToV2UpgradePreferences() {
  const [preferences, setPreferences] =
    useState<V1ToV2UpgradePreferences>(
      createDefaultV1ToV2UpgradePreferences,
    );

  const applyPersistedPreferences = useCallback(
    (persistedPreferences: unknown) => {
      setPreferences(
        sanitizeV1ToV2UpgradePreferences(persistedPreferences),
      );
    },
    [],
  );

  const updatePreferences = useCallback(
    (nextPreferences: V1ToV2UpgradePreferences) => {
      setPreferences(
        sanitizeV1ToV2UpgradePreferences(nextPreferences),
      );
    },
    [],
  );

  return {
    applyPersistedPreferences,
    preferences,
    updatePreferences,
  };
}
