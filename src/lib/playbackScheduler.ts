import type { Note } from "../types/score";

type PreviewNoteGroupHandler = (notes: Note[]) => void;
type PreviewFinishHandler = () => void;

const NOTE_HIGHLIGHT_MS = 300;

export function schedulePreviewPlayback(
  notes: Note[],
  onNoteGroup: PreviewNoteGroupHandler,
  onFinish: PreviewFinishHandler,
) {
  const timeoutIds: number[] = [];

  const sortedNotes = [...notes].sort((left, right) => left.time - right.time);
  const noteGroups = groupNotesByTime(sortedNotes);

  noteGroups.forEach((noteGroup) => {
    const timeoutId = window.setTimeout(() => {
      onNoteGroup(noteGroup.notes);
    }, Math.max(0, noteGroup.time));

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

function groupNotesByTime(notes: Note[]) {
  const noteGroups: Array<{ time: number; notes: Note[] }> = [];

  notes.forEach((note) => {
    const lastGroup = noteGroups[noteGroups.length - 1];

    if (lastGroup && lastGroup.time === note.time) {
      lastGroup.notes.push(note);
      return;
    }

    noteGroups.push({
      time: note.time,
      notes: [note],
    });
  });

  return noteGroups;
}
