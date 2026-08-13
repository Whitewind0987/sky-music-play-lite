import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import type { ScoreRecordingLifecycle } from "../hooks/useScoreRecording";

export type ScoreRecordingPanelProps = {
  completedName: string;
  completedNoteCount: number | null;
  isSaving: boolean;
  lifecycle: ScoreRecordingLifecycle;
  onCancel: () => void;
  onCompletedNameChange: (name: string) => void;
  onSave: () => void;
  onStart: () => void;
  onStop: () => void;
  recordedNoteCount: number;
  text: UiText["scoreRecording"];
};

export function ScoreRecordingPanel({
  completedName,
  completedNoteCount,
  isSaving,
  lifecycle,
  onCancel,
  onCompletedNameChange,
  onSave,
  onStart,
  onStop,
  recordedNoteCount,
  text,
}: ScoreRecordingPanelProps) {
  const isActive =
    lifecycle === "recording" ||
    lifecycle === "stopping" ||
    lifecycle === "cancelling";
  const status =
    isSaving
      ? text.saving
      : lifecycle === "starting"
        ? text.starting
        : lifecycle === "stopping"
          ? text.stopping
          : lifecycle === "cancelling"
            ? text.cancelling
            : lifecycle === "recording"
              ? text.recording
              : completedNoteCount === null
                ? text.idle
                : text.completed;
  const visibleNoteCount = isActive
    ? recordedNoteCount
    : completedNoteCount;

  return (
    <section
      className="panel score-recording-panel"
      aria-labelledby="score-recording-title"
    >
      <div className="score-recording-copy">
        <h2 id="score-recording-title">{text.panelTitle}</h2>
        <p>{text.description}</p>
      </div>

      <div
        className={`score-recording-status${isActive ? " is-active" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="score-recording-status-label">
          {isActive && <span className="score-recording-dot" aria-hidden="true" />}
          {status}
        </span>
        {visibleNoteCount !== null && (
          <strong>
            {formatText(text.recordedNotes, { count: visibleNoteCount })}
          </strong>
        )}
        {completedNoteCount !== null && lifecycle === "idle" && (
          <span className="score-recording-memory-note">
            {text.completedInMemory}
          </span>
        )}
      </div>

      {completedNoteCount !== null && lifecycle === "idle" ? (
        <div className="score-recording-save">
          <label htmlFor="score-recording-name">{text.scoreNameLabel}</label>
          <input
            id="score-recording-name"
            type="text"
            value={completedName}
            placeholder={text.scoreNamePlaceholder}
            disabled={isSaving}
            onChange={(event) => onCompletedNameChange(event.target.value)}
          />
          <div className="score-recording-actions">
            <button
              className="score-recording-primary"
              type="button"
              disabled={isSaving}
              onClick={onSave}
            >
              {isSaving ? text.saving : text.saveRecording}
            </button>
            <button
              className="score-recording-secondary"
              type="button"
              disabled={isSaving}
              onClick={onStart}
            >
              {text.recordAgain}
            </button>
          </div>
        </div>
      ) : (
        <div className="score-recording-actions">
          {lifecycle === "idle" || lifecycle === "starting" ? (
            <button
              className="score-recording-primary"
              type="button"
              disabled={lifecycle === "starting"}
              onClick={onStart}
            >
              {lifecycle === "starting" ? text.starting : text.start}
            </button>
          ) : (
            <>
              <button
                className="score-recording-primary"
                type="button"
                disabled={lifecycle !== "recording"}
                onClick={onStop}
              >
                {lifecycle === "stopping" ? text.stopping : text.stop}
              </button>
              <button
                className="score-recording-secondary"
                type="button"
                disabled={lifecycle !== "recording"}
                onClick={onCancel}
              >
                {lifecycle === "cancelling" ? text.cancelling : text.cancel}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
