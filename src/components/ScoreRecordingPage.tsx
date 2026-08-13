import type { UiText } from "../i18n/uiText";
import {
  ScoreRecordingPanel,
  type ScoreRecordingPanelProps,
} from "./ScoreRecordingPanel";

type ScoreRecordingPageProps = Omit<ScoreRecordingPanelProps, "text"> & {
  text: UiText["scoreRecording"];
};

export function ScoreRecordingPage({
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
}: ScoreRecordingPageProps) {
  return (
    <div className="score-recording-page">
      <ScoreRecordingPanel
        completedName={completedName}
        completedNoteCount={completedNoteCount}
        isSaving={isSaving}
        lifecycle={lifecycle}
        onCancel={onCancel}
        onCompletedNameChange={onCompletedNameChange}
        onSave={onSave}
        onStart={onStart}
        onStop={onStop}
        recordedNoteCount={recordedNoteCount}
        text={text}
      />

      <section
        className="score-recording-guide"
        aria-labelledby="score-recording-guide-title"
      >
        <h2 id="score-recording-guide-title">{text.guide.title}</h2>
        <ol>
          {text.guide.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
