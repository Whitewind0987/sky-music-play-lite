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
const DEFAULT_PROGRESS_TICK_MS = 50;

type PreviewNoteGroup = {
  notes: Note[];
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
  seekTo: (timeMs: number) => void;
  stop: () => void;
  updateOptions: (
    nextOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) => void;
};

export type PreviewPlaybackOptions = {
  initialProgressMs?: number;
  noteIntervalDelayMs: NoteIntervalDelayMs;
  onProgress?: (progress: PreviewPlaybackProgress) => void;
  playbackSpeed: PlaybackSpeed;
  progressTickMs?: number;
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
  const noteGroups = groupNotesByTime(sortedNotes);
  let liveOptions = { ...options };
  let totalMs = getAdjustedPreviewDurationMs(sortedNotes, liveOptions);
  let currentGroupIndex = 0;
  let timeoutId: number | null = null;
  let progressIntervalId: number | null = null;
  let scheduledTask: ScheduledTask =
    noteGroups.length > 0 ? "note" : "finish";
  let scheduledDelayMs =
    noteGroups.length > 0 ? getDelayToGroup(0, liveOptions) : 0;
  let scheduledAtMs = 0;
  let remainingDelayMs = scheduledDelayMs;
  let progressStartedAtMs = 0;
  let progressStartOffsetMs = 0;
  let currentProgressMs = 0;
  let isPaused = false;
  let isStopped = false;

  function emitProgress(progressMs: number) {
    currentProgressMs = Math.min(Math.max(progressMs, 0), totalMs);
    liveOptions.onProgress?.({
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

  function getClockMs() {
    return performance.now();
  }

  function updateProgressFromClock() {
    emitProgress(progressStartOffsetMs + getClockMs() - progressStartedAtMs);
  }

  function startProgressTimer() {
    clearProgressTimer();
    progressStartOffsetMs = currentProgressMs;
    progressStartedAtMs = getClockMs();
    progressIntervalId = window.setInterval(
      updateProgressFromClock,
      liveOptions.progressTickMs ?? DEFAULT_PROGRESS_TICK_MS,
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
    scheduledAtMs = getClockMs();

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

    onNoteGroup(currentGroup.notes);
    currentGroupIndex += 1;

    const nextGroup = noteGroups[currentGroupIndex];

    if (!nextGroup) {
      updateTotalFromRemaining(0);
      scheduleTask("finish", getScaledDelayMs(NOTE_HIGHLIGHT_MS, liveOptions));
      return;
    }

    scheduleTask("note", getDelayToGroup(currentGroupIndex, liveOptions));
  }

  function getDelayToGroup(
    groupIndex: number,
    timingOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) {
    const nextGroup = noteGroups[groupIndex];

    if (!nextGroup) {
      return 0;
    }

    if (groupIndex === 0) {
      return getScaledDelayMs(Math.max(0, nextGroup.time), timingOptions);
    }

    const previousGroup = noteGroups[groupIndex - 1];
    const originalGapMs = nextGroup.time - previousGroup.time;

    return Math.max(
      0,
      getScaledDelayMs(originalGapMs, timingOptions) +
        timingOptions.noteIntervalDelayMs,
    );
  }

  function getGroupStartProgressMs(
    groupIndex: number,
    timingOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) {
    if (groupIndex < 0 || groupIndex >= noteGroups.length) {
      return 0;
    }

    let progressMs = 0;

    for (let index = 0; index <= groupIndex; index += 1) {
      progressMs += getDelayToGroup(index, timingOptions);
    }

    return progressMs;
  }

  function findNextGroupIndexFromProgressMs(
    progressMs: number,
    timingOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) {
    const clampedProgressMs = Math.min(Math.max(progressMs, 0), totalMs);

    for (let index = 0; index < noteGroups.length; index += 1) {
      const groupStartProgressMs = getGroupStartProgressMs(index, timingOptions);

      if (
        clampedProgressMs <= 0
          ? groupStartProgressMs >= clampedProgressMs
          : groupStartProgressMs > clampedProgressMs
      ) {
        return index;
      }
    }

    return noteGroups.length;
  }

  function getDelayFromProgressToGroup(
    progressMs: number,
    groupIndex: number,
    timingOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) {
    if (groupIndex >= noteGroups.length) {
      return 0;
    }

    return Math.max(
      0,
      getGroupStartProgressMs(groupIndex, timingOptions) - progressMs,
    );
  }

  function getRemainingDurationFromGroup(
    groupIndex: number,
    firstDelayMs: number,
    timingOptions: Pick<
      PreviewPlaybackOptions,
      "noteIntervalDelayMs" | "playbackSpeed"
    >,
  ) {
    if (groupIndex >= noteGroups.length) {
      return 0;
    }

    let remainingDurationMs = Math.max(0, firstDelayMs);

    for (let index = groupIndex + 1; index < noteGroups.length; index += 1) {
      remainingDurationMs += getDelayToGroup(index, timingOptions);
    }

    return remainingDurationMs;
  }

  function updateTotalFromRemaining(remainingDurationMs: number) {
    totalMs = Math.max(
      currentProgressMs,
      currentProgressMs + remainingDurationMs,
    );
    emitProgress(currentProgressMs);
  }

  function getElapsedRatio() {
    const elapsedMs = getClockMs() - scheduledAtMs;

    if (scheduledDelayMs <= 0) {
      return 1;
    }

    return Math.min(Math.max(elapsedMs / scheduledDelayMs, 0), 1);
  }

  function getPausedElapsedRatio() {
    if (scheduledDelayMs <= 0) {
      return 1;
    }

    return Math.min(Math.max(1 - remainingDelayMs / scheduledDelayMs, 0), 1);
  }

  function reschedulePendingTaskAfterOptionsChange() {
    if (scheduledTask === "finish") {
      const nextRemainingDelayMs = isPaused
        ? remainingDelayMs
        : Math.max(0, scheduledDelayMs * (1 - getElapsedRatio()));

      remainingDelayMs = nextRemainingDelayMs;
      updateTotalFromRemaining(0);

      if (!isPaused && timeoutId !== null) {
        clearCurrentTimeout();
        scheduleTask("finish", nextRemainingDelayMs);
      }

      return;
    }

    const elapsedRatio = isPaused ? getPausedElapsedRatio() : getElapsedRatio();
    const nextFullDelayMs = getDelayToGroup(currentGroupIndex, liveOptions);
    const nextRemainingDelayMs = Math.max(
      0,
      nextFullDelayMs * (1 - Math.min(Math.max(elapsedRatio, 0), 1)),
    );

    remainingDelayMs = nextRemainingDelayMs;
    updateTotalFromRemaining(
      getRemainingDurationFromGroup(
        currentGroupIndex,
        nextRemainingDelayMs,
        liveOptions,
      ),
    );

    if (!isPaused && timeoutId !== null) {
      clearCurrentTimeout();
      scheduleTask("note", nextRemainingDelayMs);
    }
  }

  function finishFromSeek() {
    isStopped = true;
    isPaused = false;
    currentGroupIndex = noteGroups.length;
    scheduledTask = "finish";
    scheduledDelayMs = 0;
    remainingDelayMs = 0;
    clearCurrentTimeout();
    clearProgressTimer();
    emitProgress(totalMs);
    onFinish();
  }

  function seekToProgress(timeMs: number) {
    if (isStopped) {
      return;
    }

    const targetProgressMs = Math.min(Math.max(timeMs, 0), totalMs);

    clearCurrentTimeout();
    clearProgressTimer();
    emitProgress(targetProgressMs);

    if (targetProgressMs >= totalMs) {
      finishFromSeek();
      return;
    }

    currentGroupIndex = findNextGroupIndexFromProgressMs(
      targetProgressMs,
      liveOptions,
    );

    if (currentGroupIndex >= noteGroups.length) {
      scheduledTask = "finish";
      scheduledDelayMs = Math.max(0, totalMs - targetProgressMs);
      remainingDelayMs = scheduledDelayMs;
      scheduledAtMs = getClockMs();
    } else {
      scheduledTask = "note";
      scheduledDelayMs = getDelayFromProgressToGroup(
        targetProgressMs,
        currentGroupIndex,
        liveOptions,
      );
      remainingDelayMs = scheduledDelayMs;
      scheduledAtMs = getClockMs();
    }

    updateTotalFromRemaining(
      getRemainingDurationFromGroup(
        currentGroupIndex,
        remainingDelayMs,
        liveOptions,
      ),
    );

    if (isPaused) {
      return;
    }

    startProgressTimer();
    scheduleTask(scheduledTask, remainingDelayMs);
  }

  function initializeFromProgress(timeMs: number) {
    const targetProgressMs = Math.min(Math.max(timeMs, 0), totalMs);

    currentProgressMs = targetProgressMs;

    if (targetProgressMs >= totalMs) {
      currentGroupIndex = noteGroups.length;
      scheduledTask = "finish";
      scheduledDelayMs = 0;
      remainingDelayMs = 0;
      return;
    }

    currentGroupIndex = findNextGroupIndexFromProgressMs(
      targetProgressMs,
      liveOptions,
    );

    if (currentGroupIndex >= noteGroups.length) {
      scheduledTask = "finish";
      scheduledDelayMs = Math.max(0, totalMs - targetProgressMs);
    } else {
      scheduledTask = "note";
      scheduledDelayMs = getDelayFromProgressToGroup(
        targetProgressMs,
        currentGroupIndex,
        liveOptions,
      );
    }

    remainingDelayMs = scheduledDelayMs;
  }

  initializeFromProgress(liveOptions.initialProgressMs ?? 0);
  emitProgress(currentProgressMs);

  if (currentProgressMs >= totalMs) {
    scheduleTask("finish", 0);
  } else {
    startProgressTimer();
    scheduleTask(scheduledTask, scheduledDelayMs);
  }

  return {
    pause() {
      if (isStopped || isPaused || timeoutId === null) {
        return;
      }

      const elapsedMs = getClockMs() - scheduledAtMs;
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
    seekTo(timeMs) {
      seekToProgress(timeMs);
    },
    stop() {
      isStopped = true;
      clearCurrentTimeout();
      clearProgressTimer();
    },
    updateOptions(nextOptions) {
      if (isStopped) {
        return;
      }

      if (!isPaused && progressIntervalId !== null) {
        updateProgressFromClock();
      }

      liveOptions = {
        ...liveOptions,
        ...nextOptions,
      };

      reschedulePendingTaskAfterOptionsChange();
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
  const sortedNotes = [...notes].sort((left, right) => left.time - right.time);
  const groupedNotes = groupNotesByTime(sortedNotes);

  return groupedNotes.reduce((durationMs, group, index) => {
    if (index === 0) {
      return durationMs + getScaledDelayMs(Math.max(0, group.time), options);
    }

    const previousGroup = groupedNotes[index - 1];
    const originalGapMs = group.time - previousGroup.time;

    return (
      durationMs +
      Math.max(
        0,
        getScaledDelayMs(originalGapMs, options) + options.noteIntervalDelayMs,
      )
    );
  }, 0);
}

function getScaledDelayMs(
  delayMs: number,
  options: Pick<PreviewPlaybackOptions, "playbackSpeed">,
) {
  return Math.max(0, delayMs) / options.playbackSpeed;
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
