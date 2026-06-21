export type PlaybackShortcutAction = "pauseResume" | "next" | "stop";

export type PlaybackShortcutScope = "in-app" | "global";

export type PlaybackShortcutBinding = {
  code: string;
  scope: PlaybackShortcutScope;
};

export type PlaybackShortcuts = Record<
  PlaybackShortcutAction,
  PlaybackShortcutBinding
>;

export type PlaybackShortcutNotices = Partial<
  Record<PlaybackShortcutAction, string>
>;

export const playbackShortcutActions: PlaybackShortcutAction[] = [
  "pauseResume",
  "next",
  "stop",
];

export const defaultPlaybackShortcuts: PlaybackShortcuts = {
  pauseResume: { code: "Space", scope: "in-app" },
  next: { code: "ArrowRight", scope: "in-app" },
  stop: { code: "F9", scope: "global" },
};
