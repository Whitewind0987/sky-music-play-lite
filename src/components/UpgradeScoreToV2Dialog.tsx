import * as Dialog from "@radix-ui/react-dialog";
import { useId, useRef, useState, type FormEvent } from "react";
import type {
  UpgradeSongToV2Result,
} from "../hooks/useScoreLibrary";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS,
  DEFAULT_V1_TO_V2_MAX_DURATION_MS,
  DEFAULT_V1_TO_V2_OVERLAP_MS,
  DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
  getV1ToV2ConversionValidationError,
  type V1ToV2ConversionOptions,
  type V1ToV2ConversionValidationError,
} from "../lib/v1ToV2Conversion";

type UpgradeScoreToV2DialogProps = {
  onClose: () => void;
  onCreate: (
    options: V1ToV2ConversionOptions,
  ) => Promise<UpgradeSongToV2Result>;
  sourceName: string;
  text: UiText["library"]["upgradeToV2"];
};

export type UpgradeScoreToV2FormValues = {
  name: string;
  overlapMs: string;
  restGapThresholdMs: string;
  maxDurationMs: string;
  finalGroupDurationMs: string;
};

export async function runSingleFlightScoreUpgrade(
  inProgressRef: { current: boolean },
  setInProgress: (inProgress: boolean) => void,
  runUpgrade: () => Promise<UpgradeSongToV2Result>,
) {
  if (inProgressRef.current) {
    return null;
  }

  inProgressRef.current = true;
  setInProgress(true);

  try {
    return await runUpgrade();
  } finally {
    inProgressRef.current = false;
    setInProgress(false);
  }
}

export type UpgradeScoreToV2FormState = {
  operationError: string;
  validationError: V1ToV2ConversionValidationError | null;
  values: UpgradeScoreToV2FormValues;
};

export function getEditedUpgradeScoreToV2FormState(
  currentState: UpgradeScoreToV2FormState,
  nextValues: UpgradeScoreToV2FormValues,
): UpgradeScoreToV2FormState {
  return {
    ...currentState,
    operationError: "",
    validationError: null,
    values: nextValues,
  };
}

export function getUpgradeScoreToV2SubmissionResultState(
  values: UpgradeScoreToV2FormValues,
  result: UpgradeSongToV2Result,
) {
  return result.status === "created"
    ? {
        operationError: "",
        shouldClose: true,
        values,
      }
    : {
        operationError: result.message,
        shouldClose: false,
        values,
      };
}

export function getDefaultUpgradeScoreToV2FormValues(
  sourceName: string,
  text: UiText["library"]["upgradeToV2"],
): UpgradeScoreToV2FormValues {
  return {
    name: formatText(text.defaultName, { songName: sourceName }),
    overlapMs: String(DEFAULT_V1_TO_V2_OVERLAP_MS),
    restGapThresholdMs: String(
      DEFAULT_V1_TO_V2_REST_GAP_THRESHOLD_MS,
    ),
    maxDurationMs: String(DEFAULT_V1_TO_V2_MAX_DURATION_MS),
    finalGroupDurationMs: String(DEFAULT_V1_TO_V2_FINAL_GROUP_DURATION_MS),
  };
}

export function buildV1ToV2OptionsFromDialogValues(
  values: UpgradeScoreToV2FormValues,
): V1ToV2ConversionOptions {
  return {
    name: values.name,
    overlapMs: parseNumericField(values.overlapMs),
    restGapThresholdMs: parseNumericField(values.restGapThresholdMs),
    maxDurationMs: parseNumericField(values.maxDurationMs),
    finalGroupDurationMs: parseNumericField(values.finalGroupDurationMs),
  };
}

export function UpgradeScoreToV2Dialog({
  onClose,
  onCreate,
  sourceName,
  text,
}: UpgradeScoreToV2DialogProps) {
  const [values, setValues] = useState(() =>
    getDefaultUpgradeScoreToV2FormValues(sourceName, text),
  );
  const [validationError, setValidationError] =
    useState<V1ToV2ConversionValidationError | null>(null);
  const [operationError, setOperationError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const descriptionId = useId();
  const validationId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const options = buildV1ToV2OptionsFromDialogValues(values);
    const nextValidationError =
      getV1ToV2ConversionValidationError(options);

    setValidationError(nextValidationError);
    setOperationError("");

    if (nextValidationError !== null) {
      return;
    }

    const result = await runSingleFlightScoreUpgrade(
      isCreatingRef,
      setIsCreating,
      () => onCreate(options),
    );

    if (result === null) {
      return;
    }

    const resultState = getUpgradeScoreToV2SubmissionResultState(
      values,
      result,
    );

    if (resultState.shouldClose) {
      onClose();
      return;
    }

    setOperationError(resultState.operationError);
  }

  const validationMessage =
    validationError === null
      ? ""
      : getValidationMessage(validationError, text);
  const errorMessage = validationMessage || operationError;

  function handleValuesChange(nextValues: UpgradeScoreToV2FormValues) {
    const nextState = getEditedUpgradeScoreToV2FormState(
      { operationError, validationError, values },
      nextValues,
    );

    setValues(nextState.values);
    setValidationError(nextState.validationError);
    setOperationError(nextState.operationError);
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !isCreatingRef.current) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="library-dialog-backdrop">
          <Dialog.Content
            className="score-upgrade-dialog"
            aria-describedby={descriptionId}
          >
            <UpgradeScoreToV2Form
              descriptionId={descriptionId}
              errorMessage={errorMessage}
              isCreating={isCreating}
              text={text}
              validationError={validationError}
              validationId={validationId}
              values={values}
              onCancel={onClose}
              onSubmit={handleSubmit}
              onValuesChange={handleValuesChange}
            />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function UpgradeScoreToV2Form({
  descriptionId,
  errorMessage,
  isCreating,
  onCancel,
  onSubmit,
  onValuesChange,
  text,
  validationError,
  validationId,
  values,
}: {
  descriptionId: string;
  errorMessage: string;
  isCreating: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValuesChange: (values: UpgradeScoreToV2FormValues) => void;
  text: UiText["library"]["upgradeToV2"];
  validationError: V1ToV2ConversionValidationError | null;
  validationId: string;
  values: UpgradeScoreToV2FormValues;
}) {
  const errorId = errorMessage ? validationId : undefined;

  return (
    <form onSubmit={onSubmit}>
      <div className="score-upgrade-dialog-header">
        <div>
          <Dialog.Title asChild>
            <h3>{text.title}</h3>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p id={descriptionId}>{text.description}</p>
          </Dialog.Description>
        </div>
      </div>

      <fieldset disabled={isCreating}>
        <label className="score-upgrade-field">
          <span>{text.newNameLabel}</span>
          <input
            aria-describedby={errorId}
            aria-invalid={validationError === "empty-name"}
            autoFocus
            type="text"
            value={values.name}
            onChange={(event) =>
              onValuesChange({
                ...values,
                name: event.currentTarget.value,
              })
            }
          />
        </label>

        <DurationField
          errorId={errorId}
          invalid={validationError === "invalid-overlap"}
          label={text.overlapLabel}
          max={500}
          min={0}
          text={text}
          value={values.overlapMs}
          onChange={(overlapMs) =>
            onValuesChange({ ...values, overlapMs })
          }
        />

        <DurationField
          errorId={errorId}
          helpText={text.restGapThresholdHelp}
          invalid={validationError === "invalid-rest-gap-threshold"}
          label={text.restGapThresholdLabel}
          max={60000}
          min={25}
          text={text}
          value={values.restGapThresholdMs}
          onChange={(restGapThresholdMs) =>
            onValuesChange({ ...values, restGapThresholdMs })
          }
        />

        <DurationField
          errorId={errorId}
          invalid={
            validationError === "invalid-maximum-duration" ||
            validationError === "final-duration-exceeds-maximum"
          }
          label={text.maximumDurationLabel}
          max={60000}
          min={25}
          text={text}
          value={values.maxDurationMs}
          onChange={(maxDurationMs) =>
            onValuesChange({ ...values, maxDurationMs })
          }
        />

        <DurationField
          errorId={errorId}
          invalid={
            validationError === "invalid-final-duration" ||
            validationError === "final-duration-exceeds-maximum"
          }
          label={text.finalGroupDurationLabel}
          max={60000}
          min={25}
          text={text}
          value={values.finalGroupDurationMs}
          onChange={(finalGroupDurationMs) =>
            onValuesChange({ ...values, finalGroupDurationMs })
          }
        />
      </fieldset>

      {errorMessage ? (
        <p className="score-upgrade-error" id={validationId} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="confirm-dialog-actions">
        <button
          className="confirm-dialog-secondary"
          disabled={isCreating}
          type="button"
          onClick={onCancel}
        >
          {text.cancel}
        </button>
        <button
          className="confirm-dialog-primary"
          disabled={isCreating}
          type="submit"
        >
          {isCreating ? text.creating : text.confirm}
        </button>
      </div>
    </form>
  );
}

function DurationField({
  errorId,
  helpText,
  invalid,
  label,
  max,
  min,
  onChange,
  text,
  value,
}: {
  errorId: string | undefined;
  helpText?: string;
  invalid: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  text: UiText["library"]["upgradeToV2"];
  value: string;
}) {
  return (
    <label className="score-upgrade-field">
      <span>{label}</span>
      <span className="score-upgrade-number-input">
        <input
          aria-describedby={errorId}
          aria-invalid={invalid}
          inputMode="numeric"
          max={max}
          min={min}
          step={1}
          type="number"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span>{text.millisecondsUnit}</span>
      </span>
      {helpText ? <small>{helpText}</small> : null}
    </label>
  );
}

function getValidationMessage(
  error: V1ToV2ConversionValidationError,
  text: UiText["library"]["upgradeToV2"],
) {
  switch (error) {
    case "empty-name":
      return text.validation.emptyName;
    case "invalid-overlap":
      return text.validation.invalidOverlap;
    case "invalid-rest-gap-threshold":
      return text.validation.invalidRestGapThreshold;
    case "invalid-maximum-duration":
      return text.validation.invalidMaximumDuration;
    case "invalid-final-duration":
      return text.validation.invalidFinalDuration;
    case "final-duration-exceeds-maximum":
      return text.validation.finalDurationExceedsMaximum;
  }
}

function parseNumericField(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}
