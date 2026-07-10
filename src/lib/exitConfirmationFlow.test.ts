import { describe, expect, it, vi } from "vitest";
import {
  dismissExitConfirmationDialog,
  getExitCloseRequestDecision,
  openExitConfirmationDialog,
  runConfirmBeforeExitPreferenceChange,
  runExitConfirmationAction,
  type ExitConfirmationGuard,
} from "./exitConfirmationFlow";

describe("exit confirmation close requests", () => {
  it("allows close requests when confirmation is disabled", () => {
    expect(
      getExitCloseRequestDecision({
        confirmBeforeExit: false,
        isDialogOpen: false,
        isExitInProgress: false,
      }),
    ).toBe("allow");
  });

  it("opens the confirmation when the preference is enabled", () => {
    expect(
      getExitCloseRequestDecision({
        confirmBeforeExit: true,
        isDialogOpen: false,
        isExitInProgress: false,
      }),
    ).toBe("open");
  });

  it("ignores repeated close requests while the dialog is open", () => {
    expect(
      getExitCloseRequestDecision({
        confirmBeforeExit: true,
        isDialogOpen: true,
        isExitInProgress: false,
      }),
    ).toBe("ignore");
  });

  it("prevents close requests while a preference save is pending", () => {
    expect(
      getExitCloseRequestDecision({
        confirmBeforeExit: false,
        isDialogOpen: false,
        isExitInProgress: false,
        isPreferenceSaveInProgress: true,
      }),
    ).toBe("ignore");
    expect(
      getExitCloseRequestDecision({
        confirmBeforeExit: true,
        isDialogOpen: false,
        isExitInProgress: false,
        isPreferenceSaveInProgress: true,
      }),
    ).toBe("ignore");
  });

  it("resets the temporary checkbox when the dialog is dismissed or reopened", () => {
    expect(dismissExitConfirmationDialog()).toEqual({
      doNotAskAgain: false,
      isOpen: false,
    });
    expect(openExitConfirmationDialog()).toEqual({
      doNotAskAgain: false,
      isOpen: true,
    });
  });
});

describe("exit confirmation preference setting", () => {
  it("saves before applying the runtime preference", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const stateChanges: boolean[] = [];
    const applyConfirmBeforeExit = vi.fn();
    const persistConfirmBeforeExit = vi.fn().mockReturnValue(save);

    const change = runConfirmBeforeExitPreferenceChange(
      guard,
      (isSaving) => stateChanges.push(isSaving),
      {
        applyConfirmBeforeExit,
        nextConfirmBeforeExit: false,
        persistConfirmBeforeExit,
      },
    );

    expect(persistConfirmBeforeExit).toHaveBeenCalledWith(false);
    expect(applyConfirmBeforeExit).not.toHaveBeenCalled();
    expect(stateChanges).toEqual([true]);

    resolveSave();

    await expect(change).resolves.toEqual({ status: "success" });
    expect(applyConfirmBeforeExit).toHaveBeenCalledWith(false);
    expect(stateChanges).toEqual([true, false]);
  });

  it("keeps the runtime preference unchanged when saving fails", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    const stateChanges: boolean[] = [];
    const applyConfirmBeforeExit = vi.fn();

    await expect(
      runConfirmBeforeExitPreferenceChange(
        guard,
        (isSaving) => stateChanges.push(isSaving),
        {
          applyConfirmBeforeExit,
          nextConfirmBeforeExit: false,
          persistConfirmBeforeExit: async () => {
            throw new Error("disk full");
          },
        },
      ),
    ).resolves.toMatchObject({ status: "preference-save-failed" });

    expect(applyConfirmBeforeExit).not.toHaveBeenCalled();
    expect(stateChanges).toEqual([true, false]);
  });

  it("runs only one settings save while a previous save is pending", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const persistConfirmBeforeExit = vi.fn().mockReturnValue(save);
    const applyConfirmBeforeExit = vi.fn();

    const first = runConfirmBeforeExitPreferenceChange(guard, () => {}, {
      applyConfirmBeforeExit,
      nextConfirmBeforeExit: false,
      persistConfirmBeforeExit,
    });
    const second = runConfirmBeforeExitPreferenceChange(guard, () => {}, {
      applyConfirmBeforeExit,
      nextConfirmBeforeExit: true,
      persistConfirmBeforeExit,
    });

    await expect(second).resolves.toEqual({ status: "busy" });
    expect(persistConfirmBeforeExit).toHaveBeenCalledTimes(1);

    resolveSave();
    await expect(first).resolves.toEqual({ status: "success" });
    expect(applyConfirmBeforeExit).toHaveBeenCalledWith(false);
  });
});

describe("exit confirmation action", () => {
  it("exits without saving when do-not-ask-again is not selected", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    const exit = vi.fn().mockResolvedValue(undefined);
    const persistConfirmBeforeExit = vi.fn().mockResolvedValue(undefined);

    await expect(
      runExitConfirmationAction(guard, () => {}, {
        doNotAskAgain: false,
        exit,
        persistConfirmBeforeExit,
      }),
    ).resolves.toEqual({ status: "success" });

    expect(persistConfirmBeforeExit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("saves false before exiting when do-not-ask-again is selected", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    const order: string[] = [];

    await expect(
      runExitConfirmationAction(guard, () => {}, {
        doNotAskAgain: true,
        exit: async () => {
          order.push("exit");
        },
        persistConfirmBeforeExit: async (confirmBeforeExit) => {
          expect(confirmBeforeExit).toBe(false);
          order.push("save");
        },
      }),
    ).resolves.toEqual({ status: "success" });

    expect(order).toEqual(["save", "exit"]);
  });

  it("does not exit or change runtime state when saving fails", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    const exit = vi.fn().mockResolvedValue(undefined);
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    const setRuntimePreference = vi.fn();

    await expect(
      runExitConfirmationAction(guard, () => {}, {
        doNotAskAgain: true,
        exit,
        persistConfirmBeforeExit: async () => {
          await save();
          setRuntimePreference(false);
        },
      }),
    ).resolves.toMatchObject({ status: "preference-save-failed" });

    expect(exit).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(setRuntimePreference).not.toHaveBeenCalled();
  });

  it("runs only one confirmation action while saving", async () => {
    const guard: ExitConfirmationGuard = { current: false };
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const persistConfirmBeforeExit = vi.fn().mockReturnValue(save);
    const exit = vi.fn().mockResolvedValue(undefined);

    const first = runExitConfirmationAction(guard, () => {}, {
      doNotAskAgain: true,
      exit,
      persistConfirmBeforeExit,
    });
    const second = runExitConfirmationAction(guard, () => {}, {
      doNotAskAgain: true,
      exit,
      persistConfirmBeforeExit,
    });

    await expect(second).resolves.toEqual({ status: "busy" });
    expect(persistConfirmBeforeExit).toHaveBeenCalledTimes(1);

    resolveSave();
    await expect(first).resolves.toEqual({ status: "success" });
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
