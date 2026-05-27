import type { Note } from "../types/score";

type PreviewNoteHandler = (note: Note) => void;
type PreviewFinishHandler = () => void;

const NOTE_HIGHLIGHT_MS = 300;

export function schedulePreviewPlayback(
  notes: Note[],
  onNote: PreviewNoteHandler,
  onFinish: PreviewFinishHandler,
) {
  const timeoutIds: number[] = [];

  const sortedNotes = [...notes].sort((left, right) => left.time - right.time);

  sortedNotes.forEach((note) => {
    const timeoutId = window.setTimeout(() => {
      onNote(note);
    }, Math.max(0, note.time));

    timeoutIds.push(timeoutId);
  });

  const lastNoteTime =
    sortedNotes.length > 0 ? sortedNotes[sortedNotes.length - 1].time : 0;
  const finishTimeoutId = window.setTimeout(() => {
    onFinish();
  }, Math.max(0, lastNoteTime) + NOTE_HIGHLIGHT_MS);

  timeoutIds.push(finishTimeoutId);

  return function stopPreviewPlayback() {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  };
}
