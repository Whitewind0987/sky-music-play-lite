export const playbackModes = ["sequence", "repeat-one", "repeat-all"] as const;
export type PlaybackMode = (typeof playbackModes)[number];

export const noteIntervalDelayOptions = [-100, -50, 0, 50, 100, 200] as const;
export type NoteIntervalDelayMs = (typeof noteIntervalDelayOptions)[number];

export const playbackSpeedOptions = [0.5, 1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof playbackSpeedOptions)[number];

export const defaultPlaybackMode: PlaybackMode = "sequence";
export const defaultNoteIntervalDelayMs: NoteIntervalDelayMs = 0;
export const defaultPlaybackSpeed: PlaybackSpeed = 1;
