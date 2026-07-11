import { describe, expect, it } from "vitest";
import {
  PlaybackContextTransactionStore,
  runPlaybackContextTransaction,
  type ActivePlaybackContext,
} from "./playbackContextTransaction";

function context(currentSongId: string): ActivePlaybackContext {
  return {
    currentSongId,
    songIds: ["A", "B", "C"],
    source: "local-imports",
  };
}

function deferredBoolean() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("PlaybackContextTransactionStore", () => {
  it("keeps committed, pending, and effective contexts distinct", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    expect(store.getCommittedCurrentSongId()).toBe("B");
    expect(store.getPendingCurrentSongId()).toBeNull();
    expect(store.getCurrentSongId()).toBe("B");

    const transaction = store.begin(context("C"));
    expect(store.getCommittedCurrentSongId()).toBe("B");
    expect(store.getPendingCurrentSongId()).toBe("C");
    expect(store.getCurrentSongId()).toBe("C");
    expect(store.hasPendingTransaction()).toBe(true);

    expect(store.commit(transaction)).toBe(true);
    expect(store.getCommittedCurrentSongId()).toBe("C");
    expect(store.getPendingCurrentSongId()).toBeNull();
    expect(store.getCurrentSongId()).toBe("C");
  });

  it("installs pending context synchronously and commits success", async () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const pendingStart = deferredBoolean();
    const transaction = store.begin(context("B"));
    const result = runPlaybackContextTransaction({
      commit: (value) => store.commit(value),
      rollback: (value) => store.rollback(value),
      start: () => pendingStart.promise,
      transaction,
    });

    expect(store.getCurrentSongId()).toBe("B");
    pendingStart.resolve(true);
    await expect(result).resolves.toBe("started");
    expect(store.getCurrentSongId()).toBe("B");
  });

  it("rolls a failed start back to the previous context", async () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const transaction = store.begin(context("B"));

    await expect(
      runPlaybackContextTransaction({
        commit: (value) => store.commit(value),
        rollback: (value) => store.rollback(value),
        start: async () => false,
        transaction,
      }),
    ).resolves.toBe("failed");
    expect(store.getCurrentSongId()).toBe("A");
  });

  it("does not let an older pending request overwrite newer next context", async () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const pendingB = deferredBoolean();
    const transactionB = store.begin(context("B"));
    const resultB = runPlaybackContextTransaction({
      commit: (value) => store.commit(value),
      rollback: (value) => store.rollback(value),
      start: () => pendingB.promise,
      transaction: transactionB,
    });

    const transactionC = store.beginCurrentSong("C")!;
    await expect(
      runPlaybackContextTransaction({
        commit: (value) => store.commit(value),
        rollback: (value) => store.rollback(value),
        start: async () => true,
        transaction: transactionC,
      }),
    ).resolves.toBe("started");
    pendingB.resolve(false);
    await expect(resultB).resolves.toBe("stale");
    expect(store.getCurrentSongId()).toBe("C");
  });

  it("restores the previous song when next fails and no newer request owns it", async () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.beginCurrentSong("C")!;

    await runPlaybackContextTransaction({
      commit: (value) => store.commit(value),
      rollback: (value) => store.rollback(value),
      start: async () => false,
      transaction,
    });
    expect(store.getCurrentSongId()).toBe("B");
  });

  it("can stage an out-of-order queue candidate and roll it back", async () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.beginCurrentSong("queued-D")!;
    expect(store.getContext()).toMatchObject({
      currentSongId: "queued-D",
      songIds: ["A", "B", "C", "queued-D"],
    });

    await runPlaybackContextTransaction({
      commit: (value) => store.commit(value),
      rollback: (value) => store.rollback(value),
      start: async () => false,
      transaction,
    });
    expect(store.getContext()).toEqual(context("B"));
  });

  it("uses monotonic tokens and rejects stale commit and rollback", () => {
    const store = new PlaybackContextTransactionStore();
    const first = store.begin(context("A"));
    const second = store.begin(context("B"));

    expect(second.token).toBeGreaterThan(first.token);
    expect(store.commit(first)).toBe(false);
    expect(store.rollback(first)).toBe(false);
    expect(store.getCurrentSongId()).toBe("B");
  });

  it("rolls a superseding failed D back to committed B instead of abandoned C", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transactionC = store.begin(context("C"));
    const transactionD = store.begin({
      ...context("D"),
      songIds: ["A", "B", "C", "D"],
    });

    expect(store.getCommittedCurrentSongId()).toBe("B");
    expect(store.rollback(transactionD)).toBe(true);
    expect(store.getCurrentSongId()).toBe("B");
    expect(store.getPendingContext()).toBeNull();
    expect(store.commit(transactionC)).toBe(false);
    expect(store.rollback(transactionC)).toBe(false);
  });

  it("replace invalidates pending ownership and installs committed context", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.begin(context("C"));
    store.replace(context("A"));

    expect(store.hasPendingTransaction()).toBe(false);
    expect(store.getCurrentSongId()).toBe("A");
    expect(store.commit(transaction)).toBe(false);
    expect(store.rollback(transaction)).toBe(false);
  });

  it("replace with null clears committed and pending contexts", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.begin(context("C"));
    store.replace(null);

    expect(store.getContext()).toBeNull();
    expect(store.getCommittedContext()).toBeNull();
    expect(store.getPendingContext()).toBeNull();
    expect(store.commit(transaction)).toBe(false);
    expect(store.rollback(transaction)).toBe(false);
  });

  it("marks the effective context without changing transaction ownership", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const transaction = store.begin(context("B"));
    store.markCurrentSong("C");

    expect(store.getCommittedCurrentSongId()).toBe("A");
    expect(store.getPendingCurrentSongId()).toBe("C");
    expect(store.hasPendingTransaction()).toBe(true);
    expect(store.rollback(transaction)).toBe(true);
    expect(store.getCurrentSongId()).toBe("A");
  });

  it("removes missing songs from pending and rollback contexts", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const transaction = store.begin(context("B"));
    store.removeSong("C");
    expect(store.rollback(transaction)).toBe(true);
    expect(store.getContext()?.songIds).toEqual(["A", "B"]);
  });

  it("updates committed and pending contexts independently during removal", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace({ ...context("B"), songIds: ["A", "B", "D"] });
    const transaction = store.begin({
      ...context("C"),
      songIds: ["A", "C", "D"],
    });
    store.removeSong("A");

    expect(store.getCommittedContext()?.songIds).toEqual(["B", "D"]);
    expect(store.getPendingContext()?.songIds).toEqual(["C", "D"]);
    expect(store.rollback(transaction)).toBe(true);
    expect(store.getContext()?.songIds).toEqual(["B", "D"]);
  });

  it("removing a pending current song cancels pending without corrupting committed", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.begin(context("C"));
    store.removeSong("C");

    expect(store.getCommittedCurrentSongId()).toBe("B");
    expect(store.getPendingContext()).toBeNull();
    expect(store.getCurrentSongId()).toBe("B");
    expect(store.commit(transaction)).toBe(false);
  });

  it("removing committed current does not commit pending state", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("B"));
    const transaction = store.begin(context("C"));
    store.removeSong("B");

    expect(store.getCommittedContext()).toBeNull();
    expect(store.getPendingCurrentSongId()).toBe("C");
    expect(store.rollback(transaction)).toBe(true);
    expect(store.getContext()).toBeNull();
  });
});
