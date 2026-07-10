export type ExitConfirmationGuard = {
  current: boolean;
};

export type ExitConfirmationDialogState = {
  doNotAskAgain: boolean;
  isOpen: boolean;
};

export type ExitCloseRequestDecision = "force-close" | "ignore" | "open";

export type ExitConfirmationActionResult =
  | { status: "busy" }
  | { status: "exit-failed"; error: unknown }
  | { status: "preference-save-failed"; error: unknown }
  | { status: "success" };

export type ConfirmBeforeExitPreferenceChangeResult =
  | { status: "busy" }
  | { status: "preference-save-failed"; error: unknown }
  | { status: "success" };

export type ForceCloseActionResult =
  | { status: "busy" }
  | { status: "failure"; error: unknown }
  | { status: "success" };

export function getExitCloseRequestDecision({
  confirmBeforeExit,
  isDialogOpen,
  isExitInProgress,
  isPreferenceSaveInProgress = false,
}: {
  confirmBeforeExit: boolean;
  isDialogOpen: boolean;
  isExitInProgress: boolean;
  isPreferenceSaveInProgress?: boolean;
}): ExitCloseRequestDecision {
  if (isPreferenceSaveInProgress) {
    return "ignore";
  }

  if (isExitInProgress) {
    return "ignore";
  }

  if (!confirmBeforeExit) {
    return "force-close";
  }

  return isDialogOpen ? "ignore" : "open";
}

export function openExitConfirmationDialog(): ExitConfirmationDialogState {
  return { doNotAskAgain: false, isOpen: true };
}

export function dismissExitConfirmationDialog(): ExitConfirmationDialogState {
  return { doNotAskAgain: false, isOpen: false };
}

export async function runForceCloseAction(
  guard: ExitConfirmationGuard,
  forceClose: () => Promise<void>,
): Promise<ForceCloseActionResult> {
  if (guard.current) {
    return { status: "busy" };
  }

  guard.current = true;

  try {
    await forceClose();
    return { status: "success" };
  } catch (error) {
    guard.current = false;
    return { error, status: "failure" };
  }
}

export async function runConfirmBeforeExitPreferenceChange(
  guard: ExitConfirmationGuard,
  setIsSaving: (isSaving: boolean) => void,
  {
    applyConfirmBeforeExit,
    nextConfirmBeforeExit,
    persistConfirmBeforeExit,
  }: {
    applyConfirmBeforeExit: (confirmBeforeExit: boolean) => void;
    nextConfirmBeforeExit: boolean;
    persistConfirmBeforeExit: (confirmBeforeExit: boolean) => Promise<void>;
  },
): Promise<ConfirmBeforeExitPreferenceChangeResult> {
  if (guard.current) {
    return { status: "busy" };
  }

  guard.current = true;
  setIsSaving(true);

  try {
    await persistConfirmBeforeExit(nextConfirmBeforeExit);
    applyConfirmBeforeExit(nextConfirmBeforeExit);
    return { status: "success" };
  } catch (error) {
    return { error, status: "preference-save-failed" };
  } finally {
    guard.current = false;
    setIsSaving(false);
  }
}

export async function runExitConfirmationAction(
  guard: ExitConfirmationGuard,
  setIsConfirming: (isConfirming: boolean) => void,
  {
    doNotAskAgain,
    exit,
    persistConfirmBeforeExit,
  }: {
    doNotAskAgain: boolean;
    exit: () => Promise<void>;
    persistConfirmBeforeExit: (confirmBeforeExit: boolean) => Promise<void>;
  },
): Promise<ExitConfirmationActionResult> {
  if (guard.current) {
    return { status: "busy" };
  }

  guard.current = true;
  setIsConfirming(true);

  try {
    if (doNotAskAgain) {
      try {
        await persistConfirmBeforeExit(false);
      } catch (error) {
        return { error, status: "preference-save-failed" };
      }
    }

    try {
      await exit();
      return { status: "success" };
    } catch (error) {
      return { error, status: "exit-failed" };
    }
  } finally {
    guard.current = false;
    setIsConfirming(false);
  }
}
