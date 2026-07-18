import type {
  V1ToV2CustomValues,
  V1ToV2SustainStyle,
  V1ToV2UpgradePreferences,
} from "../types/v1ToV2Upgrade";
import { V1_TO_V2_SUSTAIN_STYLES } from "../types/v1ToV2Upgrade";
import {
  DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
  DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
} from "./v1ToV2Conversion";

export type V1ToV2PresetStyle = Exclude<
  V1ToV2SustainStyle,
  "custom"
>;

export const V1_TO_V2_SUSTAIN_STYLE_PRESETS = {
  conservative: {
    minimumSustainGapMs: 400,
    releaseLeadMs: 50,
    restGapThresholdMs: 1000,
    maxDurationMs: 1000,
    finalGroupDurationMs: 300,
  },
  balanced: {
    minimumSustainGapMs:
      DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
    releaseLeadMs: DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
    restGapThresholdMs: DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
    maxDurationMs: DEFAULT_V1_TO_V2_MAX_DURATION_MS,
    finalGroupDurationMs: DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  },
  connected: {
    minimumSustainGapMs: 150,
    releaseLeadMs: 15,
    restGapThresholdMs: 2000,
    maxDurationMs: 2000,
    finalGroupDurationMs: 800,
  },
} as const satisfies Record<V1ToV2PresetStyle, V1ToV2CustomValues>;

export const DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES = {
  selectedStyle: "connected",
  customValues: V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected,
} as const satisfies V1ToV2UpgradePreferences;

export function createDefaultV1ToV2UpgradePreferences(): V1ToV2UpgradePreferences {
  return {
    selectedStyle: DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES.selectedStyle,
    customValues: {
      ...DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES.customValues,
    },
  };
}

export function sanitizeV1ToV2UpgradePreferences(
  rawPreferences: unknown,
): V1ToV2UpgradePreferences {
  if (!isRecord(rawPreferences)) {
    return createDefaultV1ToV2UpgradePreferences();
  }

  const selectedStyle = isV1ToV2SustainStyle(
    rawPreferences.selectedStyle,
  )
    ? rawPreferences.selectedStyle
    : "connected";
  const customValues = sanitizeCustomValues(rawPreferences.customValues);

  if (customValues === null) {
    if (selectedStyle === "custom") {
      return createDefaultV1ToV2UpgradePreferences();
    }

    return {
      selectedStyle,
      customValues: {
        ...DEFAULT_V1_TO_V2_UPGRADE_PREFERENCES.customValues,
      },
    };
  }

  return {
    selectedStyle,
    customValues,
  };
}

export function isValidV1ToV2CustomValues(
  customValues: V1ToV2CustomValues,
) {
  return (
    getV1ToV2ConversionValidationError({
      name: "persisted-preference",
      ...customValues,
    }) === null
  );
}

function sanitizeCustomValues(
  rawCustomValues: unknown,
): V1ToV2CustomValues | null {
  if (!isRecord(rawCustomValues)) {
    return null;
  }

  const fields = [
    "minimumSustainGapMs",
    "releaseLeadMs",
    "restGapThresholdMs",
    "maxDurationMs",
    "finalGroupDurationMs",
  ] as const satisfies readonly (keyof V1ToV2CustomValues)[];

  if (
    !fields.every(
      (field) =>
        typeof rawCustomValues[field] === "number" &&
        Number.isFinite(rawCustomValues[field]),
    )
  ) {
    return null;
  }

  const customValues = Object.fromEntries(
    fields.map((field) => [field, rawCustomValues[field]]),
  ) as V1ToV2CustomValues;

  return isValidV1ToV2CustomValues(customValues) ? customValues : null;
}

function isV1ToV2SustainStyle(
  value: unknown,
): value is V1ToV2SustainStyle {
  return (
    typeof value === "string" &&
    V1_TO_V2_SUSTAIN_STYLES.includes(value as V1ToV2SustainStyle)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
