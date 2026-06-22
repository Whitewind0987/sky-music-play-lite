import type { ExperimentalInputPreferences } from "../types/appData";
import type {
  ExperimentalInputMode,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "../types/experimentalInput";

export const defaultExperimentalInputEnabled = true;
export const defaultExperimentalInputMode: ExperimentalInputMode =
  "target-window-message";

export const defaultTargetWindowCompatibilityProfile: TargetWindowCompatibilityProfile =
  "legacy-activate-scan-lparam";

export function normalizeTargetWindowMessageMethod(
  _value: unknown,
): TargetWindowMessageMethod {
  return "post-message";
}

export function normalizeTargetWindowCompatibilityProfile(
  value: unknown,
): TargetWindowCompatibilityProfile {
  return value === "grouped-legacy"
    ? "grouped-legacy"
    : defaultTargetWindowCompatibilityProfile;
}

export function normalizeExperimentalInputPreferences(
  preferences: ExperimentalInputPreferences,
): ExperimentalInputPreferences {
  return {
    ...preferences,
    targetWindowCompatibilityProfile:
      normalizeTargetWindowCompatibilityProfile(
        preferences.targetWindowCompatibilityProfile,
      ),
    targetWindowMessageMethod: normalizeTargetWindowMessageMethod(
      preferences.targetWindowMessageMethod,
    ),
  };
}
