import * as Dialog from "@radix-ui/react-dialog";
import { useId, useRef, useState, type FormEvent } from "react";
import type {
  UpgradeSongToV2Result,
} from "../hooks/useScoreLibrary";
import type { UiText } from "../i18n/uiText";
import type { Song } from "../types/score";
import { formatText } from "../lib/formatText";
import {
  applyUpgradeScoreToV2OperationError,
  applyUpgradeScoreToV2Validation,
  buildV1ToV2OptionsFromDialogValues,
  createInitialUpgradeScoreToV2FormState,
  editUpgradeScoreToV2FormField,
  formatValidDurationMillisecondsAsSeconds,
  getReadableSustainTimeValues,
  restoreRecommendedUpgradeScoreToV2State,
  selectV1ToV2SustainStyle,
  V1_TO_V2_SUSTAIN_STYLE_OPTIONS,
  type UpgradeScoreToV2FormField,
  type UpgradeScoreToV2FormState,
  type UpgradeScoreToV2FormValues,
  type V1ToV2SustainStyle,
} from "../lib/v1ToV2DialogModel";
import {
  getV1ToV2ConversionValidationError,
  previewV1ToV2Conversion,
  type V1ToV2ConversionOptions,
  type V1ToV2ConversionValidationError,
} from "../lib/v1ToV2Conversion";

type UpgradeScoreToV2DialogProps = {
  onClose: () => void;
  onCreate: (
    options: V1ToV2ConversionOptions,
  ) => Promise<UpgradeSongToV2Result>;
  sourceSong: Song;
  text: UiText["library"]["upgradeToV2"];
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

export function UpgradeScoreToV2Dialog({
  onClose,
  onCreate,
  sourceSong,
  text,
}: UpgradeScoreToV2DialogProps) {
  const [formState, setFormState] = useState(() =>
    createInitialUpgradeScoreToV2FormState(
      formatText(text.defaultName, { songName: sourceSong.name }),
    ),
  );
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const descriptionId = useId();
  const validationId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const options = buildV1ToV2OptionsFromDialogValues(formState.values);
    const nextValidationError =
      getV1ToV2ConversionValidationError(options);

    setFormState((currentState) =>
      applyUpgradeScoreToV2Validation(
        currentState,
        nextValidationError,
      ),
    );

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
      formState.values,
      result,
    );

    if (resultState.shouldClose) {
      onClose();
      return;
    }

    setFormState((currentState) =>
      applyUpgradeScoreToV2OperationError(
        currentState,
        resultState.operationError,
      ),
    );
  }

  const validationMessage =
    formState.validationError === null
      ? ""
      : getValidationMessage(formState.validationError, text);
  const errorMessage =
    validationMessage || formState.operationError;

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
              formState={formState}
              isCreating={isCreating}
              sourceSong={sourceSong}
              text={text}
              validationId={validationId}
              onCancel={onClose}
              onFieldChange={(field, value) =>
                setFormState((currentState) =>
                  editUpgradeScoreToV2FormField(
                    currentState,
                    field,
                    value,
                  ),
                )
              }
              onRestoreRecommended={() =>
                setFormState((currentState) =>
                  restoreRecommendedUpgradeScoreToV2State(currentState),
                )
              }
              onStyleChange={(style) =>
                setFormState((currentState) =>
                  selectV1ToV2SustainStyle(currentState, style),
                )
              }
              onSubmit={handleSubmit}
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
  formState,
  isCreating,
  onCancel,
  onFieldChange,
  onRestoreRecommended,
  onStyleChange,
  onSubmit,
  sourceSong,
  text,
  validationId,
}: {
  descriptionId: string;
  errorMessage: string;
  formState: UpgradeScoreToV2FormState;
  isCreating: boolean;
  onCancel: () => void;
  onFieldChange: (
    field: UpgradeScoreToV2FormField,
    value: string,
  ) => void;
  onRestoreRecommended: () => void;
  onStyleChange: (style: V1ToV2SustainStyle) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sourceSong: Song;
  text: UiText["library"]["upgradeToV2"];
  validationId: string;
}) {
  const errorId = errorMessage ? validationId : undefined;
  const customSettingsId = useId();
  const styleDescriptionId = useId();
  const styleGroupName = useId();
  const readableTimeValues = getReadableSustainTimeValues(
    formState.values,
  );
  const readableSummary =
    readableTimeValues === null
      ? text.activeValuesFallback
      : formatText(text.activeValuesSummary, readableTimeValues);
  const previewOptions = buildV1ToV2OptionsFromDialogValues(
    formState.values,
  );
  const previewValidationError = getV1ToV2ConversionValidationError(
    previewOptions.name.trim().length === 0
      ? { ...previewOptions, name: "conversion-preview" }
      : previewOptions,
  );
  const conversionPreview =
    previewValidationError === null
      ? previewV1ToV2Conversion(
          sourceSong,
          previewOptions.name.trim().length === 0
            ? { ...previewOptions, name: "conversion-preview" }
            : previewOptions,
        )
      : null;
  const estimateSummary =
    conversionPreview === null
      ? text.profileEstimateFallback
      : formatText(text.currentStyleEstimate, {
          count: conversionPreview.generatedSustainCount,
        });
  const showDenseWarning =
    conversionPreview?.profile.isDenseTiming === true ||
    conversionPreview?.profile.isPolyphonic === true;
  const maximumSeconds = formatValidDurationMillisecondsAsSeconds(
    formState.values.maxDurationMs,
  );
  const finalSeconds = formatValidDurationMillisecondsAsSeconds(
    formState.values.finalGroupDurationMs,
  );

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

      <label className="score-upgrade-field">
        <span>{text.newNameLabel}</span>
        <input
          aria-describedby={errorId}
          aria-invalid={formState.validationError === "empty-name"}
          autoFocus
          disabled={isCreating}
          type="text"
          value={formState.values.name}
          onChange={(event) =>
            onFieldChange("name", event.currentTarget.value)
          }
        />
      </label>

      <fieldset
        className="score-upgrade-style-fieldset"
        disabled={isCreating}
        aria-describedby={styleDescriptionId}
      >
        <legend>{text.sustainStyleLabel}</legend>
        <div className="score-upgrade-style-options">
          {V1_TO_V2_SUSTAIN_STYLE_OPTIONS.map((style) => (
            <label
              className={
                formState.selectedStyle === style
                  ? "score-upgrade-style-option is-selected"
                  : "score-upgrade-style-option"
              }
              key={style}
            >
              <input
                checked={formState.selectedStyle === style}
                name={styleGroupName}
                type="radio"
                value={style}
                onChange={() => onStyleChange(style)}
              />
              <span>{text.sustainStyles[style].label}</span>
            </label>
          ))}
        </div>
        <p
          className="score-upgrade-style-description"
          id={styleDescriptionId}
        >
          {text.sustainStyles[formState.selectedStyle].description}
        </p>
      </fieldset>

      <p className="score-upgrade-readable-summary">{readableSummary}</p>
      {showDenseWarning ? (
        <p className="score-upgrade-profile-summary">{text.denseWarning}</p>
      ) : null}
      <p className="score-upgrade-profile-summary">{estimateSummary}</p>

      {formState.selectedStyle === "custom" ? (
        <section
          className="score-upgrade-custom-settings"
          aria-labelledby={customSettingsId}
        >
          <h4 id={customSettingsId}>{text.customSettingsLabel}</h4>
          <fieldset
            className="score-upgrade-custom-fields"
            disabled={isCreating}
          >
            <DurationField
              errorId={errorId}
              helpText={text.minimumSustainGapHelp}
              invalid={
                formState.validationError ===
                  "invalid-minimum-sustain-gap" ||
                formState.validationError ===
                  "minimum-gap-exceeds-rest-threshold" ||
                formState.validationError ===
                  "minimum-gap-too-short-for-release-lead"
              }
              label={text.minimumSustainGapLabel}
              max={60000}
              min={25}
              text={text}
              value={formState.values.minimumSustainGapMs}
              onChange={(minimumSustainGapMs) =>
                onFieldChange(
                  "minimumSustainGapMs",
                  minimumSustainGapMs,
                )
              }
            />

            <DurationField
              errorId={errorId}
              helpText={text.releaseLeadHelp}
              invalid={
                formState.validationError === "invalid-release-lead" ||
                formState.validationError ===
                  "minimum-gap-too-short-for-release-lead"
              }
              label={text.releaseLeadLabel}
              max={500}
              min={1}
              text={text}
              value={formState.values.releaseLeadMs}
              onChange={(releaseLeadMs) =>
                onFieldChange("releaseLeadMs", releaseLeadMs)
              }
            />

            <DurationField
              errorId={errorId}
              helpText={text.restGapThresholdHelp}
              invalid={
                formState.validationError ===
                  "invalid-rest-gap-threshold" ||
                formState.validationError ===
                  "minimum-gap-exceeds-rest-threshold"
              }
              label={text.restGapThresholdLabel}
              max={60000}
              min={25}
              text={text}
              value={formState.values.restGapThresholdMs}
              onChange={(restGapThresholdMs) =>
                onFieldChange(
                  "restGapThresholdMs",
                  restGapThresholdMs,
                )
              }
            />

            <DurationField
              errorId={errorId}
              helpText={
                maximumSeconds === null
                  ? text.maximumDurationHelpFallback
                  : formatText(text.maximumDurationHelp, {
                      seconds: maximumSeconds,
                    })
              }
              invalid={
                formState.validationError ===
                  "invalid-maximum-duration" ||
                formState.validationError ===
                  "final-duration-exceeds-maximum"
              }
              label={text.maximumDurationLabel}
              max={60000}
              min={25}
              text={text}
              value={formState.values.maxDurationMs}
              onChange={(maxDurationMs) =>
                onFieldChange("maxDurationMs", maxDurationMs)
              }
            />

            <DurationField
              errorId={errorId}
              helpText={
                finalSeconds === null
                  ? text.finalGroupDurationHelpFallback
                  : formatText(text.finalGroupDurationHelp, {
                      seconds: finalSeconds,
                    })
              }
              invalid={
                formState.validationError === "invalid-final-duration" ||
                formState.validationError ===
                  "final-duration-exceeds-maximum"
              }
              label={text.finalGroupDurationLabel}
              max={60000}
              min={25}
              text={text}
              value={formState.values.finalGroupDurationMs}
              onChange={(finalGroupDurationMs) =>
                onFieldChange(
                  "finalGroupDurationMs",
                  finalGroupDurationMs,
                )
              }
            />

            <button
              className="score-upgrade-restore-button"
              disabled={isCreating}
              type="button"
              onClick={onRestoreRecommended}
            >
              {text.restoreRecommended}
            </button>
          </fieldset>
        </section>
      ) : null}

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
  helpText: string;
  invalid: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  text: UiText["library"]["upgradeToV2"];
  value: string;
}) {
  const helpTextId = useId();
  const describedBy =
    [helpTextId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="score-upgrade-field">
      <span>{label}</span>
      <span className="score-upgrade-number-input">
        <input
          aria-describedby={describedBy}
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
      <small id={helpTextId}>{helpText}</small>
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
    case "invalid-minimum-sustain-gap":
      return text.validation.invalidMinimumSustainGap;
    case "invalid-release-lead":
      return text.validation.invalidReleaseLead;
    case "invalid-rest-gap-threshold":
      return text.validation.invalidRestGapThreshold;
    case "invalid-maximum-duration":
      return text.validation.invalidMaximumDuration;
    case "invalid-final-duration":
      return text.validation.invalidFinalDuration;
    case "minimum-gap-exceeds-rest-threshold":
      return text.validation.minimumGapExceedsRestThreshold;
    case "minimum-gap-too-short-for-release-lead":
      return text.validation.minimumGapTooShortForReleaseLead;
    case "final-duration-exceeds-maximum":
      return text.validation.finalDurationExceedsMaximum;
  }
}
