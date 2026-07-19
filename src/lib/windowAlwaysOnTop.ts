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

export type AlwaysOnTopControllerState = {
  isAlwaysOnTop: boolean;
  isReady: boolean;
  isUpdating: boolean;
  persistedAlwaysOnTop: boolean;
};

type AlwaysOnTopControllerOptions = {
  onFailure?: (desiredAlwaysOnTop: boolean, error: unknown) => void;
  onStateChange?: (state: AlwaysOnTopControllerState) => void;
  setNativeAlwaysOnTop: (value: boolean) => Promise<void>;
};

export function createInitialAlwaysOnTopControllerState(): AlwaysOnTopControllerState {
  return {
    isAlwaysOnTop: false,
    isReady: false,
    isUpdating: false,
    persistedAlwaysOnTop: false,
  };
}

export function createAlwaysOnTopController({
  onFailure,
  onStateChange,
  setNativeAlwaysOnTop,
}: AlwaysOnTopControllerOptions) {
  let state = createInitialAlwaysOnTopControllerState();
  let hasAppliedPersistedPreference = false;
  let hasStartedInitialization = false;

  function updateState(nextState: AlwaysOnTopControllerState) {
    state = nextState;
    onStateChange?.({ ...state });
  }

  return {
    applyPersistedPreference(persistedAlwaysOnTop: boolean) {
      hasAppliedPersistedPreference = true;
      updateState({
        ...state,
        isAlwaysOnTop: persistedAlwaysOnTop,
        persistedAlwaysOnTop,
      });
    },
    getState() {
      return { ...state };
    },
    async initializeNativeState(): Promise<
      AlwaysOnTopTransitionResult | undefined
    > {
      if (
        !hasAppliedPersistedPreference ||
        hasStartedInitialization
      ) {
        return undefined;
      }

      hasStartedInitialization = true;
      const desiredValue = state.persistedAlwaysOnTop;
      updateState({
        ...state,
        isUpdating: true,
      });

      const result = await applyAlwaysOnTopTransition({
        currentValue: false,
        desiredValue,
        isUpdating: false,
        setNativeAlwaysOnTop,
      });

      if (result.status === "applied") {
        updateState({
          ...state,
          isAlwaysOnTop: result.value,
          isReady: true,
          isUpdating: false,
        });
      } else if (result.status === "failed") {
        updateState({
          ...state,
          isAlwaysOnTop: false,
          isReady: true,
          isUpdating: false,
        });
        onFailure?.(desiredValue, result.error);
      }

      return result;
    },
    async toggle(): Promise<AlwaysOnTopTransitionResult> {
      if (!state.isReady || state.isUpdating) {
        return {
          status: "blocked",
          value: state.isAlwaysOnTop,
        };
      }

      const previousState = state;
      const desiredValue = !previousState.isAlwaysOnTop;
      updateState({
        ...previousState,
        isUpdating: true,
      });

      const result = await applyAlwaysOnTopTransition({
        currentValue: previousState.isAlwaysOnTop,
        desiredValue,
        isUpdating: false,
        setNativeAlwaysOnTop,
      });

      if (result.status === "applied") {
        updateState({
          ...state,
          isAlwaysOnTop: result.value,
          isUpdating: false,
          persistedAlwaysOnTop: result.value,
        });
      } else if (result.status === "failed") {
        updateState({
          ...previousState,
          isUpdating: false,
        });
        onFailure?.(desiredValue, result.error);
      }

      return result;
    },
  };
}

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
