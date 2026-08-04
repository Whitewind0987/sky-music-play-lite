export const playbackModes = ["sequence", "repeat-one", "repeat-all"] as const;
export type PlaybackMode = (typeof playbackModes)[number];

export type NoteIntervalDelayMs = number;

export type PlaybackSpeed = number;

export const noteIntervalDelayOptions = [-100, -50, 0, 50, 100, 200] as const;
export const playbackSpeedOptions = [0.5, 1, 1.25, 1.5, 2] as const;

export const noteIntervalDelayLimits = {
  buttonStep: 10,
  defaultValue: 0,
  inputStep: 1,
  max: 500,
  min: -200,
} as const;

export const playbackSpeedLimits = {
  buttonStep: 0.1,
  defaultValue: 1,
  inputStep: 0.01,
  max: 3,
  min: 0.25,
} as const;

export const defaultPlaybackMode: PlaybackMode = "sequence";
export const defaultNoteIntervalDelayMs: NoteIntervalDelayMs =
  noteIntervalDelayLimits.defaultValue;
export const defaultPlaybackSpeed: PlaybackSpeed =
  playbackSpeedLimits.defaultValue;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeNoteIntervalDelay(
  value: number,
  fallback: NoteIntervalDelayMs = defaultNoteIntervalDelayMs,
): NoteIntervalDelayMs {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const roundedValue = Math.round(safeValue);

  return clamp(
    roundedValue,
    noteIntervalDelayLimits.min,
    noteIntervalDelayLimits.max,
  );
}

export function normalizePlaybackSpeed(
  value: number,
  fallback: PlaybackSpeed = defaultPlaybackSpeed,
): PlaybackSpeed {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const clampedValue = clamp(
    safeValue,
    playbackSpeedLimits.min,
    playbackSpeedLimits.max,
  );

  return Number(clampedValue.toFixed(2));
}
