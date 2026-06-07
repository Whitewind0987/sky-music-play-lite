export type PlaybackShortcutAction = "pauseResume" | "next" | "stop";

export type PlaybackShortcuts = Record<PlaybackShortcutAction, string>;

export type PlaybackShortcutNotices = Partial<
  Record<PlaybackShortcutAction, string>
>;

export const playbackShortcutActions: PlaybackShortcutAction[] = [
  "pauseResume",
  "next",
  "stop",
];

export const defaultPlaybackShortcuts: PlaybackShortcuts = {
  pauseResume: "Space",
  next: "ArrowRight",
  stop: "F9",
};
