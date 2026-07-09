export type DeleteConfirmationGuard = {
  current: boolean;
};

export type SingleFlightDeleteResult = "busy" | "failure" | "success";

export async function runSingleFlightDelete(
  guard: DeleteConfirmationGuard,
  setIsInProgress: (isInProgress: boolean) => void,
  deleteAction: () => Promise<boolean>,
): Promise<SingleFlightDeleteResult> {
  if (guard.current) {
    return "busy";
  }

  guard.current = true;
  setIsInProgress(true);

  try {
    return (await deleteAction()) ? "success" : "failure";
  } finally {
    guard.current = false;
    setIsInProgress(false);
  }
}

export function canCloseDeleteConfirmation(guard: DeleteConfirmationGuard) {
  return !guard.current;
}
