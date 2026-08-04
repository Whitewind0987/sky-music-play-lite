export type PlaybackShortcutAction = "pauseResume" | "next" | "stop";

export type PlaybackShortcutScope = "in-app" | "global";

export type PlaybackShortcutBinding = {
  alt: boolean;
  code: string;
  ctrl: boolean;
  shift: boolean;
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
  pauseResume: {
    alt: false,
    code: "Space",
    ctrl: true,
    shift: false,
    scope: "global",
  },
  next: {
    alt: false,
    code: "ArrowRight",
    ctrl: true,
    shift: false,
    scope: "global",
  },
  stop: {
    alt: false,
    code: "F9",
    ctrl: false,
    shift: false,
    scope: "global",
  },
};
