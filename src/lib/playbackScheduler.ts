import type { Note } from "../types/score";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackSpeed,
  type NoteIntervalDelayMs,
  type PlaybackSpeed,
} from "../types/playbackOptions";

type PreviewNoteGroupHandler = (notes: Note[]) => void;
type PreviewFinishHandler = () => void;

const NOTE_HIGHLIGHT_MS = 300;
const PROGRESS_TICK_MS = 50;

type PreviewNoteGroup = {
  notes: Note[];
  playbackTime: number;
  time: number;
};

type ScheduledTask = "note" | "finish";

export type PreviewPlaybackProgress = {
  currentMs: number;
  percent: number;
  totalMs: number;
};

export type PreviewPlaybackController = {
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type PreviewPlaybackOptions = {
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onProgress?: (progress: PreviewPlaybackProgress) => void;
  playbackSpeed: PlaybackSpeed;
};

export function schedulePreviewPlayback(
  notes: Note[],
  onNoteGroup: PreviewNoteGroupHandler,
  onFinish: PreviewFinishHandler,
  options: PreviewPlaybackOptions = {
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackSpeed: defaultPlaybackSpeed,
  },
): PreviewPlaybackController {
  const sortedNotes = [...notes].sort((left, right) => left.time - right.time);
  const noteGroups = buildPreviewNoteGroups(sortedNotes, options);
  const totalMs = getAdjustedPreviewDurationMs(sortedNotes, options);
  let currentGroupIndex = 0;
  let timeoutId: number | null = null;
  let progressIntervalId: number | null = null;
  let scheduledTask: ScheduledTask =
    noteGroups.length > 0 ? "note" : "finish";
  let scheduledDelayMs =
    noteGroups.length > 0 ? noteGroups[0].playbackTime : 0;
  let scheduledAtMs = 0;
  let remainingDelayMs = scheduledDelayMs;
  let progressStartedAtMs = 0;
  let progressStartOffsetMs = 0;
  let currentProgressMs = 0;
  let isPaused = false;
  let isStopped = false;

  function emitProgress(progressMs: number) {
    currentProgressMs = Math.min(Math.max(progressMs, 0), totalMs);
    options.onProgress?.({
      currentMs: currentProgressMs,
      percent: totalMs > 0 ? (currentProgressMs / totalMs) * 100 : 0,
      totalMs,
    });
  }

  function clearCurrentTimeout() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function clearProgressTimer() {
    if (progressIntervalId !== null) {
      window.clearInterval(progressIntervalId);
      progressIntervalId = null;
    }
  }

  function updateProgressFromClock() {
    emitProgress(progressStartOffsetMs + Date.now() - progressStartedAtMs);
  }

  function startProgressTimer() {
    clearProgressTimer();
    progressStartOffsetMs = currentProgressMs;
    progressStartedAtMs = Date.now();
    progressIntervalId = window.setInterval(
      updateProgressFromClock,
      PROGRESS_TICK_MS,
    );
    updateProgressFromClock();
  }

  function pauseProgressTimer() {
    if (progressIntervalId === null) {
      return;
    }

    updateProgressFromClock();
    clearProgressTimer();
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
        clearProgressTimer();
        emitProgress(totalMs);
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

    emitProgress(currentGroup.playbackTime);
    onNoteGroup(currentGroup.notes);
    currentGroupIndex += 1;

    const nextGroup = noteGroups[currentGroupIndex];

    if (!nextGroup) {
      scheduleTask("finish", getScaledDelayMs(NOTE_HIGHLIGHT_MS, options));
      return;
    }

    scheduleTask("note", nextGroup.playbackTime - currentGroup.playbackTime);
  }

  emitProgress(0);
  startProgressTimer();
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
      pauseProgressTimer();
    },
    resume() {
      if (isStopped || !isPaused) {
        return;
      }

      isPaused = false;
      startProgressTimer();
      scheduleTask(scheduledTask, remainingDelayMs);
    },
    stop() {
      isStopped = true;
      clearCurrentTimeout();
      clearProgressTimer();
    },
  };
}

export function getAdjustedPreviewDurationMs(
  notes: Note[],
  options: Pick<
    PreviewPlaybackOptions,
    "noteIntervalDelayMs" | "playbackSpeed"
  > = {
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackSpeed: defaultPlaybackSpeed,
  },
) {
  const noteGroups = buildPreviewNoteGroups(notes, options);
  const lastGroup = noteGroups[noteGroups.length - 1];

  return lastGroup?.playbackTime ?? 0;
}

function buildPreviewNoteGroups(
  notes: Note[],
  options: Pick<PreviewPlaybackOptions, "noteIntervalDelayMs" | "playbackSpeed">,
) {
  const groupedNotes = groupNotesByTime(notes);
  let previousOriginalTime = 0;
  let previousPlaybackTime = 0;

  return groupedNotes.map((group, index) => {
    if (index === 0) {
      previousOriginalTime = group.time;
      previousPlaybackTime = getScaledDelayMs(Math.max(0, group.time), options);

      return {
        ...group,
        playbackTime: previousPlaybackTime,
      };
    }

    const originalGapMs = group.time - previousOriginalTime;
    const adjustedGapMs = Math.max(
      0,
      getScaledDelayMs(originalGapMs, options) + options.noteIntervalDelayMs,
    );

    previousOriginalTime = group.time;
    previousPlaybackTime += adjustedGapMs;

    return {
      ...group,
      playbackTime: previousPlaybackTime,
    };
  });
}

function getScaledDelayMs(
  delayMs: number,
  options: Pick<PreviewPlaybackOptions, "playbackSpeed">,
) {
  return Math.max(0, delayMs) / options.playbackSpeed;
}

function groupNotesByTime(notes: Note[]) {
  const noteGroups: Array<Omit<PreviewNoteGroup, "playbackTime">> = [];

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
