import type { UiText } from "../i18n/uiText";
import type { ScoreRecordingSession } from "../types/scoreRecording";
import {
  ScoreRecordingPanel,
  type ScoreRecordingPanelProps,
} from "./ScoreRecordingPanel";
import { RecordingScoreVisualizer } from "./score-visualization/RecordingScoreVisualizer";

type ScoreRecordingPageProps = Omit<ScoreRecordingPanelProps, "text"> & {
  completedSession: ScoreRecordingSession | null;
  liveSession: ScoreRecordingSession | null;
  text: UiText["scoreRecording"];
};

export function ScoreRecordingPage({
  completedName,
  completedNoteCount,
  completedSession,
  isSaving,
  lifecycle,
  liveSession,
  onCancel,
  onCompletedNameChange,
  onSave,
  onStart,
  onStop,
  recordedNoteCount,
  text,
}: ScoreRecordingPageProps) {
  const visualizationSession = liveSession ?? completedSession;

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

      <RecordingScoreVisualizer
        isLive={liveSession !== null}
        session={visualizationSession}
        text={text.visualization}
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
