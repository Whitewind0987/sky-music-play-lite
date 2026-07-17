import {
  DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  DEFAULT_V1_TO_V2_MINIMUM_SUSTAIN_GAP_MS,
  DEFAULT_V1_TO_V2_RELEASE_LEAD_MS,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
  type V1ToV2ConversionOptions,
  type V1ToV2ConversionValidationError,
} from "./v1ToV2Conversion";

export type V1ToV2SustainStyle =
  | "conservative"
  | "balanced"
  | "connected"
  | "custom";

export const V1_TO_V2_SUSTAIN_STYLE_OPTIONS = [
  "conservative",
  "balanced",
  "connected",
  "custom",
] as const satisfies readonly V1ToV2SustainStyle[];

export type V1ToV2NumericFormValues = {
  minimumSustainGapMs: string;
  releaseLeadMs: string;
  restGapThresholdMs: string;
  maxDurationMs: string;
  finalGroupDurationMs: string;
};

export type UpgradeScoreToV2FormValues = V1ToV2NumericFormValues & {
  name: string;
};

export type UpgradeScoreToV2FormState = {
  operationError: string;
  selectedStyle: V1ToV2SustainStyle;
  validationError: V1ToV2ConversionValidationError | null;
  values: UpgradeScoreToV2FormValues;
};

export type UpgradeScoreToV2FormField = keyof UpgradeScoreToV2FormValues;
export type V1ToV2PresetStyle = Exclude<V1ToV2SustainStyle, "custom">;

type V1ToV2NumericPreset = {
  minimumSustainGapMs: number;
  releaseLeadMs: number;
  restGapThresholdMs: number;
  maxDurationMs: number;
  finalGroupDurationMs: number;
};

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
} as const satisfies Record<V1ToV2PresetStyle, V1ToV2NumericPreset>;

export function createInitialUpgradeScoreToV2FormState(
  generatedName: string,
): UpgradeScoreToV2FormState {
  return {
    operationError: "",
    selectedStyle: "balanced",
    validationError: null,
    values: {
      name: generatedName,
      ...getPresetFormValues("balanced"),
    },
  };
}

export function selectV1ToV2SustainStyle(
  currentState: UpgradeScoreToV2FormState,
  selectedStyle: V1ToV2SustainStyle,
): UpgradeScoreToV2FormState {
  return clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle,
    values:
      selectedStyle === "custom"
        ? currentState.values
        : {
            ...currentState.values,
            ...getPresetFormValues(selectedStyle),
          },
  });
}

export function editUpgradeScoreToV2FormField(
  currentState: UpgradeScoreToV2FormState,
  field: UpgradeScoreToV2FormField,
  value: string,
): UpgradeScoreToV2FormState {
  return clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle:
      field === "name" ? currentState.selectedStyle : "custom",
    values: {
      ...currentState.values,
      [field]: value,
    },
  });
}

export function restoreRecommendedUpgradeScoreToV2State(
  currentState: UpgradeScoreToV2FormState,
): UpgradeScoreToV2FormState {
  return clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle: "balanced",
    values: {
      name: currentState.values.name,
      ...getPresetFormValues("balanced"),
    },
  });
}

export function applyUpgradeScoreToV2Validation(
  currentState: UpgradeScoreToV2FormState,
  validationError: V1ToV2ConversionValidationError | null,
): UpgradeScoreToV2FormState {
  return {
    ...currentState,
    operationError: "",
    validationError,
  };
}

export function applyUpgradeScoreToV2OperationError(
  currentState: UpgradeScoreToV2FormState,
  operationError: string,
): UpgradeScoreToV2FormState {
  return {
    ...currentState,
    operationError,
    validationError: null,
  };
}

export function buildV1ToV2OptionsFromDialogValues(
  values: UpgradeScoreToV2FormValues,
): V1ToV2ConversionOptions {
  return {
    name: values.name,
    minimumSustainGapMs: parseNumericField(
      values.minimumSustainGapMs,
    ),
    releaseLeadMs: parseNumericField(values.releaseLeadMs),
    restGapThresholdMs: parseNumericField(values.restGapThresholdMs),
    maxDurationMs: parseNumericField(values.maxDurationMs),
    finalGroupDurationMs: parseNumericField(values.finalGroupDurationMs),
  };
}

export function formatMillisecondsAsSeconds(
  value: string | number,
): string | null {
  const milliseconds =
    typeof value === "number"
      ? value
      : value.trim() === ""
        ? Number.NaN
        : Number(value);

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }

  return String(milliseconds / 1000);
}

export function formatValidDurationMillisecondsAsSeconds(
  value: string,
): string | null {
  const milliseconds = parseNumericField(value);

  if (milliseconds < 25 || milliseconds > 60000) {
    return null;
  }

  return formatMillisecondsAsSeconds(milliseconds);
}

export function getReadableSustainTimeValues(
  values: UpgradeScoreToV2FormValues,
): {
  maximumSeconds: string;
  minimumSeconds: string;
  releaseLeadMs: string;
  restSeconds: string;
} | null {
  const options = buildV1ToV2OptionsFromDialogValues(values);
  const validationError = getV1ToV2ConversionValidationError(
    options.name.trim().length === 0
      ? { ...options, name: "readable-summary" }
      : options,
  );

  if (validationError !== null) {
    return null;
  }

  const maximumSeconds = formatValidDurationMillisecondsAsSeconds(
    values.maxDurationMs,
  );
  const minimumSeconds = formatValidDurationMillisecondsAsSeconds(
    values.minimumSustainGapMs,
  );
  const restSeconds = formatValidDurationMillisecondsAsSeconds(
    values.restGapThresholdMs,
  );

  return maximumSeconds === null ||
    minimumSeconds === null ||
    restSeconds === null
    ? null
    : {
        maximumSeconds,
        minimumSeconds,
        releaseLeadMs: String(options.releaseLeadMs),
        restSeconds,
      };
}

function getPresetFormValues(
  style: V1ToV2PresetStyle,
): V1ToV2NumericFormValues {
  const preset = V1_TO_V2_SUSTAIN_STYLE_PRESETS[style];

  return {
    minimumSustainGapMs: String(preset.minimumSustainGapMs),
    releaseLeadMs: String(preset.releaseLeadMs),
    restGapThresholdMs: String(preset.restGapThresholdMs),
    maxDurationMs: String(preset.maxDurationMs),
    finalGroupDurationMs: String(preset.finalGroupDurationMs),
  };
}

function clearUpgradeScoreToV2Errors(
  state: UpgradeScoreToV2FormState,
): UpgradeScoreToV2FormState {
  return {
    ...state,
    operationError: "",
    validationError: null,
  };
}

function parseNumericField(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}
