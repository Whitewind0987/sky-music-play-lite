import type { Note } from "../types/score";

type PreviewNoteGroupHandler = (notes: Note[]) => void;
type PreviewFinishHandler = () => void;

const NOTE_HIGHLIGHT_MS = 300;

type PreviewNoteGroup = {
  time: number;
  notes: Note[];
};

type ScheduledTask = "note" | "finish";

export type PreviewPlaybackController = {
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export function schedulePreviewPlayback(
  notes: Note[],
  onNoteGroup: PreviewNoteGroupHandler,
  onFinish: PreviewFinishHandler,
): PreviewPlaybackController {
  const sortedNotes = [...notes].sort((left, right) => left.time - right.time);
  const noteGroups = groupNotesByTime(sortedNotes);
  let currentGroupIndex = 0;
  let timeoutId: number | null = null;
  let scheduledTask: ScheduledTask =
    noteGroups.length > 0 ? "note" : "finish";
  let scheduledDelayMs =
    noteGroups.length > 0 ? Math.max(0, noteGroups[0].time) : 0;
  let scheduledAtMs = 0;
  let remainingDelayMs = scheduledDelayMs;
  let isPaused = false;
  let isStopped = false;

  function clearCurrentTimeout() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function scheduleTask(task: ScheduledTask, delayMs: number) {
    if (isStopped) {
      return;
    }

    scheduledTask = task;
    scheduledDelayMs = Math.max(0, delayMs);
    remainingDelayMs = scheduledDelayMs;
    scheduledAtMs = Date.now();

    timeoutId = window.setTimeout(() => {
      timeoutId = null;

      if (isStopped || isPaused) {
        return;
      }

      if (task === "finish") {
        onFinish();
        return;
      }

      playCurrentGroup();
    }, scheduledDelayMs);
  }

  function playCurrentGroup() {
    const currentGroup = noteGroups[currentGroupIndex];

    if (!currentGroup) {
      scheduleTask("finish", 0);
      return;
    }

    onNoteGroup(currentGroup.notes);
    currentGroupIndex += 1;

    const nextGroup = noteGroups[currentGroupIndex];

    if (!nextGroup) {
      scheduleTask("finish", NOTE_HIGHLIGHT_MS);
      return;
    }

    scheduleTask("note", nextGroup.time - currentGroup.time);
  }

  scheduleTask(scheduledTask, scheduledDelayMs);

  return {
    pause() {
      if (isStopped || isPaused || timeoutId === null) {
        return;
      }

      const elapsedMs = Date.now() - scheduledAtMs;
      remainingDelayMs = Math.max(0, scheduledDelayMs - elapsedMs);
      isPaused = true;
      clearCurrentTimeout();
    },
    resume() {
      if (isStopped || !isPaused) {
        return;
      }

      isPaused = false;
      scheduleTask(scheduledTask, remainingDelayMs);
    },
    stop() {
      isStopped = true;
      clearCurrentTimeout();
    },
  };
}

function groupNotesByTime(notes: Note[]) {
  const noteGroups: PreviewNoteGroup[] = [];

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
