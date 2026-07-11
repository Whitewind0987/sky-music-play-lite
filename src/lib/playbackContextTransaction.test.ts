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

  it("removes missing songs from pending and rollback contexts", () => {
    const store = new PlaybackContextTransactionStore();
    store.replace(context("A"));
    const transaction = store.begin(context("B"));
    store.removeSong("C");
    expect(store.rollback(transaction)).toBe(true);
    expect(store.getContext()?.songIds).toEqual(["A", "B"]);
  });
});
