export const playbackModes = ["sequence", "repeat-one", "repeat-all"] as const;
export type PlaybackMode = (typeof playbackModes)[number];

export type NoteIntervalDelayMs = number;

export type PlaybackSpeed = number;

export const noteIntervalDelayOptions = [-100, -50, 0, 50, 100, 200] as const;
export const playbackSpeedOptions = [0.5, 1, 1.25, 1.5, 2] as const;

export const noteIntervalDelayLimits = {
  defaultValue: 0,
  max: 500,
  min: -200,
  step: 10,
} as const;

export const playbackSpeedLimits = {
  defaultValue: 1,
  max: 3,
  min: 0.25,
  step: 0.25,
} as const;

export const defaultPlaybackMode: PlaybackMode = "sequence";
export const defaultNoteIntervalDelayMs: NoteIntervalDelayMs =
  noteIntervalDelayLimits.defaultValue;
export const defaultPlaybackSpeed: PlaybackSpeed =
  playbackSpeedLimits.defaultValue;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function normalizeNoteIntervalDelay(
  value: number,
  fallback: NoteIntervalDelayMs = defaultNoteIntervalDelayMs,
): NoteIntervalDelayMs {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const steppedValue = roundToStep(safeValue, noteIntervalDelayLimits.step);

  return clamp(
    steppedValue,
    noteIntervalDelayLimits.min,
    noteIntervalDelayLimits.max,
  );
}

export function normalizePlaybackSpeed(
  value: number,
  fallback: PlaybackSpeed = defaultPlaybackSpeed,
): PlaybackSpeed {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const steppedValue = roundToStep(safeValue, playbackSpeedLimits.step);
  const clampedValue = clamp(
    steppedValue,
    playbackSpeedLimits.min,
    playbackSpeedLimits.max,
  );

  return Number(clampedValue.toFixed(2));
}
