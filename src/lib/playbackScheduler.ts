import type { LocalSongMetadata } from "../types/library";
import type { Note } from "../types/score";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackSpeed,
  type NoteIntervalDelayMs,
  type PlaybackSpeed,
} from "../types/playbackOptions";
import {
  calculateScoreTiming,
  calculateScoreTimingFromMetadata,
  type ScoreTiming,
  type ScoreTimingOptions,
} from "./scoreTiming";

type PreviewNoteGroupHandler = (notes: Note[]) => void;
type PreviewFinishHandler = () => void;

const DEFAULT_PROGRESS_TICK_MS = 50;

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
  let liveOptions = { ...options };
  let timing = calculateScoreTiming(notes, liveOptions);
  let timelinePositionMs = Math.min(
    Math.max(liveOptions.initialProgressMs ?? 0, 0),
    timing.totalMs,
  );
  let currentGroupIndex = findNextGroupIndex(timing, timelinePositionMs);
  let timeoutId: number | null = null;
  let progressIntervalId: number | null = null;
  let clockStartedAtMs = 0;
  let clockStartPositionMs = timelinePositionMs;
  let scheduledTargetMs = getNextTargetMs(timing, currentGroupIndex);
  let isPaused = false;
  let isStopped = false;

  function getClockMs() {
    return performance.now();
  }

  function emitProgress() {
    const currentMs = Math.min(
      Math.max(timelinePositionMs, 0),
      timing.totalMs,
    );
    liveOptions.onProgress?.({
      currentMs,
      percent: timing.totalMs > 0 ? (currentMs / timing.totalMs) * 100 : 0,
      totalMs: timing.totalMs,
    });
  }

  function syncPositionFromClock() {
    if (isPaused || isStopped) {
      return;
    }

    timelinePositionMs = Math.min(
      scheduledTargetMs,
      clockStartPositionMs + getClockMs() - clockStartedAtMs,
    );
  }

  function clearTimers() {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (progressIntervalId !== null) {
      window.clearInterval(progressIntervalId);
      progressIntervalId = null;
    }
  }

  function startProgressTimer() {
    if (isPaused || isStopped) {
      return;
    }

    progressIntervalId = window.setInterval(() => {
      syncPositionFromClock();
      emitProgress();
    }, liveOptions.progressTickMs ?? DEFAULT_PROGRESS_TICK_MS);
  }

  function finishPlayback() {
    if (isStopped) {
      return;
    }

    timelinePositionMs = timing.finishMs;
    clearTimers();
    emitProgress();
    isStopped = true;
    onFinish();
  }

  function runScheduledTarget() {
    timeoutId = null;
    if (isPaused || isStopped) {
      return;
    }

    timelinePositionMs = scheduledTargetMs;
    emitProgress();
    const group = timing.groups[currentGroupIndex];

    if (!group) {
      finishPlayback();
      return;
    }

    onNoteGroup(group.notes);
    currentGroupIndex += 1;
    scheduleNextTarget();
  }

  function scheduleNextTarget() {
    if (isPaused || isStopped) {
      return;
    }

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    scheduledTargetMs = getNextTargetMs(timing, currentGroupIndex);
    clockStartPositionMs = timelinePositionMs;
    clockStartedAtMs = getClockMs();
    timeoutId = window.setTimeout(
      runScheduledTarget,
      Math.max(0, scheduledTargetMs - timelinePositionMs),
    );
  }

  function restartRunningTimers() {
    clearTimers();
    if (isPaused || isStopped) {
      return;
    }
    scheduleNextTarget();
    startProgressTimer();
  }

  function seekToProgress(timeMs: number) {
    if (isStopped) {
      return;
    }

    clearTimers();
    timelinePositionMs = Math.min(Math.max(timeMs, 0), timing.totalMs);
    currentGroupIndex = findNextGroupIndex(timing, timelinePositionMs);
    emitProgress();
    restartRunningTimers();
  }

  function updateTimingOptions(nextOptions: ScoreTimingOptions) {
    if (isStopped) {
      return;
    }

    syncPositionFromClock();
    const oldTiming = timing;
    const oldSegment = getCurrentSegment(oldTiming, currentGroupIndex);
    const elapsedRatio =
      oldSegment.endMs > oldSegment.startMs
        ? Math.min(
            1,
            Math.max(
              0,
              (timelinePositionMs - oldSegment.startMs) /
                (oldSegment.endMs - oldSegment.startMs),
            ),
          )
        : 1;

    liveOptions = { ...liveOptions, ...nextOptions };
    timing = calculateScoreTiming(notes, liveOptions);
    const nextSegment = getCurrentSegment(timing, currentGroupIndex);
    timelinePositionMs =
      nextSegment.startMs +
      elapsedRatio * (nextSegment.endMs - nextSegment.startMs);
    timelinePositionMs = Math.min(timelinePositionMs, timing.finishMs);
    emitProgress();
    restartRunningTimers();
  }

  emitProgress();
  scheduleNextTarget();
  startProgressTimer();

  return {
    pause() {
      if (isStopped || isPaused) {
        return;
      }
      syncPositionFromClock();
      isPaused = true;
      clearTimers();
      emitProgress();
    },
    resume() {
      if (isStopped || !isPaused) {
        return;
      }
      isPaused = false;
      restartRunningTimers();
    },
    seekTo(timeMs) {
      seekToProgress(timeMs);
    },
    stop() {
      isStopped = true;
      clearTimers();
    },
    updateOptions(nextOptions) {
      updateTimingOptions(nextOptions);
    },
  };
}

export function getAdjustedPreviewDurationMs(
  notes: Note[],
  options: ScoreTimingOptions = {
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackSpeed: defaultPlaybackSpeed,
  },
) {
  return calculateScoreTiming(notes, options).totalMs;
}

export function getAdjustedPreviewDurationFromMetadata(
  metadata: Pick<
    LocalSongMetadata,
    | "lastNoteTimeMs"
    | "noteGroupCount"
    | "noteGroupDelaysMs"
    | "noteGroupMaxHoldMs"
    | "sustainTailMs"
  >,
  options: ScoreTimingOptions = {
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackSpeed: defaultPlaybackSpeed,
  },
) {
  if (metadata.noteGroupCount === 0) {
    return 0;
  }

  if (
    metadata.noteGroupDelaysMs?.length === metadata.noteGroupCount &&
    metadata.noteGroupMaxHoldMs?.length === metadata.noteGroupCount
  ) {
    return calculateScoreTimingFromMetadata(
      metadata.noteGroupDelaysMs,
      metadata.noteGroupMaxHoldMs,
      options,
    ).totalMs;
  }

  const scaledTailMs = Math.max(0, metadata.sustainTailMs ?? 0) /
    options.playbackSpeed;

  if (metadata.noteGroupDelaysMs?.length === metadata.noteGroupCount) {
    return (
      metadata.noteGroupDelaysMs.reduce((durationMs, delayMs, index) => {
        const adjustedDelayMs =
          Math.max(0, delayMs) / options.playbackSpeed +
          (index === 0 ? 0 : options.noteIntervalDelayMs);
        return durationMs + Math.max(0, adjustedDelayMs);
      }, 0) + scaledTailMs
    );
  }

  return (
    Math.max(
      0,
      Math.max(0, metadata.lastNoteTimeMs) / options.playbackSpeed +
        (metadata.noteGroupCount - 1) * options.noteIntervalDelayMs,
    ) + scaledTailMs
  );
}

function findNextGroupIndex(timing: ScoreTiming, progressMs: number) {
  const nextGroupIndex = timing.groups.findIndex((group) =>
    progressMs <= 0
      ? group.adjustedStartMs >= progressMs
      : group.adjustedStartMs > progressMs,
  );

  return nextGroupIndex === -1 ? timing.groups.length : nextGroupIndex;
}

function getNextTargetMs(timing: ScoreTiming, groupIndex: number) {
  return timing.groups[groupIndex]?.adjustedStartMs ?? timing.finishMs;
}

function getCurrentSegment(timing: ScoreTiming, groupIndex: number) {
  const endMs = getNextTargetMs(timing, groupIndex);
  const startMs =
    groupIndex > 0
      ? (timing.groups[Math.min(groupIndex, timing.groups.length) - 1]
          ?.adjustedStartMs ?? 0)
      : 0;

  return { endMs, startMs };
}
