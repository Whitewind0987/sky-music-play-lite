export type CandidateWindow = {
  hwnd: string;
  title: string;
  class_name: string;
  process_name: string | null;
};

export type ExperimentalInputMode = "target-window-message" | "foreground";

export type ForegroundPlaybackState =
  | "idle"
  | "countdown"
  | "playing"
  | "stopped"
  | "finished"
  | "error";

