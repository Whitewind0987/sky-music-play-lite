import {
  getV1ToV2ConversionValidationError,
  type V1ToV2ConversionOptions,
  type V1ToV2ConversionValidationError,
  type V1ToV2ScoreProfile,
} from "./v1ToV2Conversion";
import {
  createDefaultV1ToV2UpgradePreferences,
  sanitizeV1ToV2UpgradePreferences,
  V1_TO_V2_SUSTAIN_STYLE_PRESETS,
} from "./v1ToV2UpgradePreferences";
import {
  V1_TO_V2_SUSTAIN_STYLES,
  type V1ToV2CustomValues,
  type V1ToV2SustainStyle,
  type V1ToV2UpgradePreferences,
} from "../types/v1ToV2Upgrade";
import {
  getV1ToV2GeneratedName,
  type V1ToV2GeneratedNameTemplates,
} from "./v1ToV2GeneratedName";

export type { V1ToV2SustainStyle } from "../types/v1ToV2Upgrade";
export { V1_TO_V2_SUSTAIN_STYLE_PRESETS };
export const V1_TO_V2_SUSTAIN_STYLE_OPTIONS =
  V1_TO_V2_SUSTAIN_STYLES;

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
  isNameManuallyEdited: boolean;
  operationError: string;
  rememberedCustomValues: V1ToV2CustomValues;
  selectedStyle: V1ToV2SustainStyle;
  sourceSongName: string;
  validationError: V1ToV2ConversionValidationError | null;
  values: UpgradeScoreToV2FormValues;
};

export type UpgradeScoreToV2FormField =
  | keyof V1ToV2NumericFormValues
  | "name";

export function createInitialUpgradeScoreToV2FormState(
  sourceSongName: string,
  generatedNameTemplates: V1ToV2GeneratedNameTemplates,
  rawPreferences: V1ToV2UpgradePreferences =
    createDefaultV1ToV2UpgradePreferences(),
): UpgradeScoreToV2FormState {
  const preferences =
    sanitizeV1ToV2UpgradePreferences(rawPreferences);
  const numericValues =
    preferences.selectedStyle === "custom"
      ? preferences.customValues
      : V1_TO_V2_SUSTAIN_STYLE_PRESETS[preferences.selectedStyle];

  return {
    isNameManuallyEdited: false,
    operationError: "",
    rememberedCustomValues: { ...preferences.customValues },
    selectedStyle: preferences.selectedStyle,
    sourceSongName,
    validationError: null,
    values: {
      name: getV1ToV2GeneratedName({
        songName: sourceSongName,
        style: preferences.selectedStyle,
        templates: generatedNameTemplates,
        values: numericValues,
      }),
      ...formatNumericValues(numericValues),
    },
  };
}

export function selectV1ToV2SustainStyle(
  currentState: UpgradeScoreToV2FormState,
  selectedStyle: V1ToV2SustainStyle,
  generatedNameTemplates: V1ToV2GeneratedNameTemplates,
): UpgradeScoreToV2FormState {
  const numericValues =
    selectedStyle === "custom"
      ? currentState.rememberedCustomValues
      : V1_TO_V2_SUSTAIN_STYLE_PRESETS[selectedStyle];

  return clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle,
    values: {
      ...currentState.values,
      ...(currentState.isNameManuallyEdited
        ? {}
        : {
            name: getV1ToV2GeneratedName({
              songName: currentState.sourceSongName,
              style: selectedStyle,
              templates: generatedNameTemplates,
              values: numericValues,
            }),
          }),
      ...formatNumericValues(numericValues),
    },
  });
}

export function editUpgradeScoreToV2FormField(
  currentState: UpgradeScoreToV2FormState,
  field: UpgradeScoreToV2FormField,
  value: string,
  generatedNameTemplates: V1ToV2GeneratedNameTemplates,
): UpgradeScoreToV2FormState {
  const nextState = clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle:
      field === "name" ? currentState.selectedStyle : "custom",
    values: {
      ...currentState.values,
      [field]: value,
    },
  });

  if (field === "name") {
    return {
      ...nextState,
      isNameManuallyEdited: true,
    };
  }

  const validCustomValues = getValidV1ToV2CustomValues(
    nextState.values,
  );

  if (validCustomValues === null) {
    return nextState;
  }

  return {
    ...nextState,
    rememberedCustomValues: validCustomValues,
    values: {
      ...nextState.values,
      ...(nextState.isNameManuallyEdited
        ? {}
        : {
            name: getV1ToV2GeneratedName({
              songName: nextState.sourceSongName,
              style: "custom",
              templates: generatedNameTemplates,
              values: validCustomValues,
            }),
          }),
    },
  };
}

export function restoreRecommendedUpgradeScoreToV2State(
  currentState: UpgradeScoreToV2FormState,
  generatedNameTemplates: V1ToV2GeneratedNameTemplates,
): UpgradeScoreToV2FormState {
  const connectedValues = V1_TO_V2_SUSTAIN_STYLE_PRESETS.connected;

  return clearUpgradeScoreToV2Errors({
    ...currentState,
    selectedStyle: "connected",
    values: {
      name: currentState.isNameManuallyEdited
        ? currentState.values.name
        : getV1ToV2GeneratedName({
            songName: currentState.sourceSongName,
            style: "connected",
            templates: generatedNameTemplates,
            values: connectedValues,
          }),
      ...formatNumericValues(connectedValues),
    },
  });
}

export function getUpgradeScoreToV2Preferences(
  formState: UpgradeScoreToV2FormState,
): V1ToV2UpgradePreferences {
  return {
    selectedStyle: formState.selectedStyle,
    customValues: { ...formState.rememberedCustomValues },
  };
}

export function shouldShowV1ToV2DenseWarning(
  profile: V1ToV2ScoreProfile,
) {
  return profile.isDenseTiming;
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

function formatNumericValues(
  values: V1ToV2CustomValues,
): V1ToV2NumericFormValues {
  return {
    minimumSustainGapMs: String(values.minimumSustainGapMs),
    releaseLeadMs: String(values.releaseLeadMs),
    restGapThresholdMs: String(values.restGapThresholdMs),
    maxDurationMs: String(values.maxDurationMs),
    finalGroupDurationMs: String(values.finalGroupDurationMs),
  };
}

function getValidV1ToV2CustomValues(
  values: UpgradeScoreToV2FormValues,
): V1ToV2CustomValues | null {
  const options = buildV1ToV2OptionsFromDialogValues({
    ...values,
    name: "persisted-custom-preference",
  });

  if (getV1ToV2ConversionValidationError(options) !== null) {
    return null;
  }

  return {
    minimumSustainGapMs: options.minimumSustainGapMs,
    releaseLeadMs: options.releaseLeadMs,
    restGapThresholdMs: options.restGapThresholdMs,
    maxDurationMs: options.maxDurationMs,
    finalGroupDurationMs: options.finalGroupDurationMs,
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
