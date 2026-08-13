import type { UiText } from "../i18n/uiText";
import { formatText } from "../lib/formatText";
import type { ScoreRecordingLifecycle } from "../hooks/useScoreRecording";

type ScoreRecordingPanelProps = {
  completedNoteCount: number | null;
  lifecycle: ScoreRecordingLifecycle;
  onCancel: () => void;
  onStart: () => void;
  onStop: () => void;
  recordedNoteCount: number;
  text: UiText["scoreRecording"];
};

export function ScoreRecordingPanel({
  completedNoteCount,
  lifecycle,
  onCancel,
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
    lifecycle === "starting"
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
    </section>
  );
}
