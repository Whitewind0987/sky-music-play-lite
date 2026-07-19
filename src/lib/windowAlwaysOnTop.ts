import { formatText } from "./formatText";
import type { AppLogEntry } from "./tauriApi";

export type AlwaysOnTopTransitionResult =
  | {
      status: "applied";
      value: boolean;
    }
  | {
      status: "blocked";
      value: boolean;
    }
  | {
      error: unknown;
      status: "failed";
      value: boolean;
    };

export async function applyAlwaysOnTopTransition({
  currentValue,
  desiredValue,
  isUpdating,
  setNativeAlwaysOnTop,
}: {
  currentValue: boolean;
  desiredValue: boolean;
  isUpdating: boolean;
  setNativeAlwaysOnTop: (value: boolean) => Promise<void>;
}): Promise<AlwaysOnTopTransitionResult> {
  if (isUpdating) {
    return { status: "blocked", value: currentValue };
  }

  try {
    await setNativeAlwaysOnTop(desiredValue);

    return { status: "applied", value: desiredValue };
  } catch (error) {
    return { error, status: "failed", value: currentValue };
  }
}

export function createAlwaysOnTopFailureReport({
  desiredAlwaysOnTop,
  error,
  messageTemplate,
}: {
  desiredAlwaysOnTop: boolean;
  error: unknown;
  messageTemplate: string;
}): {
  detailedLog: AppLogEntry;
  message: string;
} {
  return {
    detailedLog: {
      details: {
        desiredAlwaysOnTop,
        error: String(error),
      },
      level: "error",
      message: "Failed to change always-on-top state",
      source: "window",
    },
    message: formatText(messageTemplate, {
      error: String(error instanceof Error ? error.message : error),
    }),
  };
}
