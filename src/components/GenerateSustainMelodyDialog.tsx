import * as Dialog from "@radix-ui/react-dialog";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { UpgradeSongToV2Result } from "../hooks/useScoreLibrary";
import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import {
  analyzeSustainMelodySource,
  buildSustainMelodyGenerationPlan,
  SUSTAIN_MELODY_STYLES,
  SustainMelodyGenerationError,
  type SustainMelodyGenerationPlan,
  type SustainMelodyStyle,
} from "../lib/sustainMelodyGeneration";
import type { Song } from "../types/score";
import { runSingleFlightScoreUpgrade } from "./UpgradeScoreToV2Dialog";

export type GenerateSustainMelodyDialogState = {
  name: string;
  operationError: string;
  selectedStyle: SustainMelodyStyle;
  validationError: string;
};

type GenerateSustainMelodyDialogProps = {
  onClose: () => void;
  onCreate: (
    plan: SustainMelodyGenerationPlan,
  ) => Promise<UpgradeSongToV2Result>;
  sourceSong: Song;
  text: UiText["library"]["generateSustainMelody"];
};

export function createInitialSustainMelodyDialogState(
  sourceSong: Song,
  generatedName: string,
): GenerateSustainMelodyDialogState {
  return {
    name: generatedName,
    operationError: "",
    selectedStyle: analyzeSustainMelodySource(sourceSong).recommendedStyle,
    validationError: "",
  };
}

export function editSustainMelodyDialogName(
  state: GenerateSustainMelodyDialogState,
  name: string,
): GenerateSustainMelodyDialogState {
  return {
    ...state,
    name,
    operationError: "",
    validationError: "",
  };
}

export function selectSustainMelodyDialogStyle(
  state: GenerateSustainMelodyDialogState,
  selectedStyle: SustainMelodyStyle,
): GenerateSustainMelodyDialogState {
  return {
    ...state,
    selectedStyle,
    operationError: "",
    validationError: "",
  };
}

export function getSustainMelodySubmissionResultState(
  state: GenerateSustainMelodyDialogState,
  result: UpgradeSongToV2Result,
) {
  return result.status === "created"
    ? { ...state, operationError: "", shouldClose: true }
    : {
        ...state,
        operationError: result.message,
        shouldClose: false,
      };
}

export function GenerateSustainMelodyDialog({
  onClose,
  onCreate,
  sourceSong,
  text,
}: GenerateSustainMelodyDialogProps) {
  const [state, setState] = useState(() =>
    createInitialSustainMelodyDialogState(
      sourceSong,
      formatText(text.defaultName, { songName: sourceSong.name }),
    ),
  );
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const descriptionId = useId();
  const errorId = useId();
  const preview = getSustainMelodyPreview(sourceSong, state, text);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.name.trim().length === 0) {
      setState((current) => ({
        ...current,
        operationError: "",
        validationError: text.emptyName,
      }));
      return;
    }

    if (preview.plan === null) {
      setState((current) => ({
        ...current,
        operationError: preview.error,
        validationError: "",
      }));
      return;
    }
    const plan = preview.plan;

    const result = await runSingleFlightScoreUpgrade(
      isCreatingRef,
      setIsCreating,
      () => onCreate(plan),
    );

    if (result === null) {
      return;
    }

    const resultState = getSustainMelodySubmissionResultState(state, result);

    if (resultState.shouldClose) {
      onClose();
      return;
    }

    setState(resultState);
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
            <GenerateSustainMelodyForm
              descriptionId={descriptionId}
              errorId={errorId}
              errorMessage={
                state.validationError ||
                state.operationError ||
                preview.error
              }
              isCreating={isCreating}
              plan={preview.plan}
              state={state}
              text={text}
              onCancel={onClose}
              onNameChange={(name) =>
                setState((current) =>
                  editSustainMelodyDialogName(current, name),
                )
              }
              onStyleChange={(style) =>
                setState((current) =>
                  selectSustainMelodyDialogStyle(current, style),
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

export function GenerateSustainMelodyForm({
  descriptionId,
  errorId,
  errorMessage,
  isCreating,
  onCancel,
  onNameChange,
  onStyleChange,
  onSubmit,
  plan,
  state,
  text,
}: {
  descriptionId: string;
  errorId: string;
  errorMessage: string;
  isCreating: boolean;
  onCancel: () => void;
  onNameChange: (name: string) => void;
  onStyleChange: (style: SustainMelodyStyle) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  plan: SustainMelodyGenerationPlan | null;
  state: GenerateSustainMelodyDialogState;
  text: UiText["library"]["generateSustainMelody"];
}) {
  const radioGroupName = useId();
  const styleDescriptionId = useId();
  const stats = plan?.stats;

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
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={state.validationError !== ""}
          autoFocus
          disabled={isCreating}
          type="text"
          value={state.name}
          onChange={(event) => onNameChange(event.currentTarget.value)}
        />
      </label>

      <p className="score-upgrade-profile-summary">
        {
          text.recommendations[
            plan?.analysis.recommendedStyle ?? state.selectedStyle
          ]
        }
      </p>

      <fieldset
        className="score-upgrade-style-fieldset"
        aria-describedby={styleDescriptionId}
        disabled={isCreating}
      >
        <legend>{text.styleLabel}</legend>
        <div className="score-upgrade-style-options">
          {SUSTAIN_MELODY_STYLES.map((style) => (
            <label
              className={
                state.selectedStyle === style
                  ? "score-upgrade-style-option is-selected"
                  : "score-upgrade-style-option"
              }
              key={style}
            >
              <input
                checked={state.selectedStyle === style}
                name={radioGroupName}
                type="radio"
                value={style}
                onChange={() => onStyleChange(style)}
              />
              <span>{text.styles[style].label}</span>
            </label>
          ))}
        </div>
        <p
          className="score-upgrade-style-description"
          id={styleDescriptionId}
        >
          {text.styles[state.selectedStyle].description}
        </p>
      </fieldset>

      {stats ? (
        <section className="score-upgrade-melody-stats">
          <p>
            {formatText(text.stats.original, {
              original: stats.originalNoteCount,
            })}
          </p>
          <p>
            {formatText(text.stats.selected, {
              selected: stats.selectedMelodyNoteCount,
            })}
          </p>
          <p>
            {formatText(text.stats.removed, {
              removed: stats.removedNoteCount,
              percent: stats.removedPercent,
            })}
          </p>
          <p>
            {formatText(text.stats.sustained, {
              sustained: stats.generatedSustainCount,
            })}
          </p>
        </section>
      ) : null}

      {errorMessage ? (
        <p className="score-upgrade-error" id={errorId} role="alert">
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
          disabled={isCreating || plan === null}
          type="submit"
        >
          {isCreating ? text.creating : text.confirm}
        </button>
      </div>
    </form>
  );
}

function getSustainMelodyPreview(
  sourceSong: Song,
  state: GenerateSustainMelodyDialogState,
  text: UiText["library"]["generateSustainMelody"],
) {
  try {
    return {
      error: "",
      plan: buildSustainMelodyGenerationPlan(sourceSong, {
        name:
          state.name.trim().length === 0
            ? "sustain-melody-preview"
            : state.name,
        style: state.selectedStyle,
      }),
    };
  } catch (error) {
    return {
      error:
        error instanceof SustainMelodyGenerationError &&
        error.code === "no-supported-keys"
          ? text.noSupportedKeys
          : text.generationFailed,
      plan: null,
    };
  }
}
