export type ExitConfirmationGuard = {
  current: boolean;
};

export type ExitConfirmationDialogState = {
  doNotAskAgain: boolean;
  isOpen: boolean;
};

export type ExitCloseRequestDecision = "allow" | "ignore" | "open";

export type ExitConfirmationActionResult =
  | { status: "busy" }
  | { status: "exit-failed"; error: unknown }
  | { status: "preference-save-failed"; error: unknown }
  | { status: "success" };

export function getExitCloseRequestDecision({
  confirmBeforeExit,
  isDialogOpen,
  isExitInProgress,
}: {
  confirmBeforeExit: boolean;
  isDialogOpen: boolean;
  isExitInProgress: boolean;
}): ExitCloseRequestDecision {
  if (isExitInProgress || !confirmBeforeExit) {
    return "allow";
  }

  return isDialogOpen ? "ignore" : "open";
}

export function openExitConfirmationDialog(): ExitConfirmationDialogState {
  return { doNotAskAgain: false, isOpen: true };
}

export function dismissExitConfirmationDialog(): ExitConfirmationDialogState {
  return { doNotAskAgain: false, isOpen: false };
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
