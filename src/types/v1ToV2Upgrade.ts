export const V1_TO_V2_SUSTAIN_STYLES = [
  "conservative",
  "balanced",
  "connected",
  "custom",
] as const;

export type V1ToV2SustainStyle =
  (typeof V1_TO_V2_SUSTAIN_STYLES)[number];

export type V1ToV2CustomValues = {
  minimumSustainGapMs: number;
  releaseLeadMs: number;
  restGapThresholdMs: number;
  maxDurationMs: number;
  finalGroupDurationMs: number;
};

export type V1ToV2UpgradePreferences = {
  selectedStyle: V1ToV2SustainStyle;
  customValues: V1ToV2CustomValues;
};
