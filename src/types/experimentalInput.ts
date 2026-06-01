export type CandidateWindow = {
  hwnd: string;
  title: string;
  class_name: string;
  process_name: string | null;
};

export type ExperimentalInputMode = "target-window-message" | "foreground";

export type TargetWindowMessageMethod = "post-message" | "send-message";

export type TargetWindowCompatibilityProfile =
  | "standard"
  | "legacy-vkscan-zero-lparam"
  | "legacy-vkscan-scan-lparam"
  | "grouped-legacy"
  | "legacy-activate-scan-lparam";

export type ForegroundPlaybackState =
  | "idle"
  | "countdown"
  | "playing"
  | "paused"
  | "stopped"
  | "finished"
  | "error";

