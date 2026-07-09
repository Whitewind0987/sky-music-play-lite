import { describe, expect, it } from "vitest";
import {
  canCloseDeleteConfirmation,
  runSingleFlightDelete,
  type DeleteConfirmationGuard,
} from "./deleteConfirmationFlow";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("delete confirmation single-flight flow", () => {
  it("runs only one delete action for repeated confirmations while pending", async () => {
    const guard: DeleteConfirmationGuard = { current: false };
    const progressStates: boolean[] = [];
    const deletion = createDeferred<boolean>();
    let deleteCallCount = 0;

    const firstConfirmation = runSingleFlightDelete(
      guard,
      (isInProgress) => progressStates.push(isInProgress),
      () => {
        deleteCallCount += 1;
        return deletion.promise;
      },
    );
    const secondConfirmation = runSingleFlightDelete(
      guard,
      (isInProgress) => progressStates.push(isInProgress),
      () => {
        deleteCallCount += 1;
        return Promise.resolve(true);
      },
    );

    expect(deleteCallCount).toBe(1);
    expect(canCloseDeleteConfirmation(guard)).toBe(false);
    await expect(secondConfirmation).resolves.toBe("busy");

    deletion.resolve(true);

    await expect(firstConfirmation).resolves.toBe("success");
    expect(progressStates).toEqual([true, false]);
    expect(canCloseDeleteConfirmation(guard)).toBe(true);
  });

  it("returns failure and resets the guard after a failed deletion", async () => {
    const guard: DeleteConfirmationGuard = { current: false };
    const progressStates: boolean[] = [];

    await expect(
      runSingleFlightDelete(
        guard,
        (isInProgress) => progressStates.push(isInProgress),
        () => Promise.resolve(false),
      ),
    ).resolves.toBe("failure");

    expect(progressStates).toEqual([true, false]);
    expect(canCloseDeleteConfirmation(guard)).toBe(true);
  });

  it("blocks cancellation or dialog close while deletion is pending", async () => {
    const guard: DeleteConfirmationGuard = { current: false };
    const deletion = createDeferred<boolean>();

    const confirmation = runSingleFlightDelete(
      guard,
      () => {},
      () => deletion.promise,
    );

    expect(canCloseDeleteConfirmation(guard)).toBe(false);

    deletion.resolve(true);
    await confirmation;

    expect(canCloseDeleteConfirmation(guard)).toBe(true);
  });
});
