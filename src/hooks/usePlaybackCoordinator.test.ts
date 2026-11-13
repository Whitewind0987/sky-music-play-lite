import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import {
  PlaybackContextTransactionStore,
  runPlaybackContextTransaction,
} from "../lib/playbackContextTransaction";
import { resolveNextQueueItemForCurrent } from "../lib/playbackQueueDecision";
import { resolveManualNextCurrentSong } from "../lib/manualNextPlayback";
import type { LocalLibrarySong } from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type { Song } from "../types/score";
import { shouldSkipTargetWindowEnumerationBeforePlayback, usePlaybackCoordinator } from "./usePlaybackCoordinator";
import { usePlaybackOrder } from "./usePlaybackOrder";
import { usePlaybackOutput } from "./usePlaybackOutput";
import { usePlaybackQueue } from "./usePlaybackQueue";
import { usePreviewPlayback } from "./usePreviewPlayback";

function createSong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 0,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: id,
      isComposed: false,
      lastNoteTimeMs: 50,
      name: id,
      noteCount: 1,
      noteGroupCount: 1,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

function createPreviewHarness(initialQueue: number[] = [], initialSelection: number | null = null) {
  type CoordinatorOptions = Parameters<typeof usePlaybackCoordinator>[0];
  const text = uiText["en-US"];
  const librarySongs = ["A", "B", "C", "D"].map(createSong);
  const librarySongsRef = { current: librarySongs };
  const visibleLibraryItems = librarySongs.map((librarySong, songIndex) => ({
    isLiked: false,
    librarySong,
    songIndex,
  }));
  const appendLog = vi.fn();
  let selectedSongIndex = initialSelection;
  let playbackSongIndex: number | null = null;
  const resolveSongForPlayback = vi.fn(async (songIndex: number): Promise<Song | null> => ({
    ...librarySongs[songIndex].metadata,
    songNotes: [{ key: "A", time: 50 }],
  }));

  // Mount the production handlers in Node. Their refs and playback timers drive
  // the events; the server renderer supplies the hook dispatcher without a DOM.
  function mount() {
    const playbackQueue = usePlaybackQueue({ appendLog, librarySongsRef, text: text.logs });
    const initialized = useRef(false);
    if (!initialized.current) {
      initialized.current = true;
      playbackQueue.replaceQueueWithSongIndices(initialQueue);
    }
    const playbackOrder = usePlaybackOrder();
    const currentSelectedSong = selectedSongIndex === null ? null : librarySongs[selectedSongIndex];
    const previewPlayback = usePreviewPlayback({
      appendLog,
      consumeQueuedItemAfterCurrent: playbackQueue.consumeQueuedItemAfterCurrent,
      currentSelectedSong,
      getPlaybackOrderNextSongIndex: (options) => playbackOrder.getNextPlaybackOrderSongIndex({
        ...options, librarySongs,
      }),
      librarySongsRef,
      peekNextQueueItemAfterCurrent: playbackQueue.peekNextQueueItemAfterCurrent,
      resolveSongForPlayback,
      selectedSongIndex,
      setSelectedSongIndex: (index) => {
        playbackSongIndex = index;
        selectedSongIndex = index;
      },
      startQueuePlayback: playbackQueue.startQueuePlayback,
      text,
    });
    const experimentalInput = {
      experimentalInputEnabled: false,
      getActiveForegroundPlaybackSongId: () => null,
      getActiveTargetWindowPlaybackSongId: () => null,
      manualPlaybackState: "idle",
      selectedWindowHwnd: null,
    } as CoordinatorOptions["experimentalInput"];
    const playbackOutput = usePlaybackOutput({
      experimentalInput,
      hasQueuedSong: playbackQueue.getFirstQueueItem() !== null,
      previewPlayback,
      text: text.bottomPlayer,
    });
    const onPlay = vi.spyOn(playbackOutput, "onPlay");
    const scoreLibrary = {
      get currentPlaybackLibrarySong() {
        return playbackSongIndex === null ? null : librarySongs[playbackSongIndex];
      },
      isSongLoading: () => false,
      librarySongs,
      librarySongsRef,
      get playbackSongIndex() { return playbackSongIndex; },
      selectedLibraryCategory: "local-imports",
      get selectedSongId() {
        return selectedSongIndex === null ? null : librarySongs[selectedSongIndex].id;
      },
      get selectedSongIndex() { return selectedSongIndex; },
      setPlaybackSongId: (songId: string | null) => {
        playbackSongIndex = songId === null ? null : librarySongs.findIndex((song) => song.id === songId);
      },
      setSelectedSongId: (songId: string | null) => {
        selectedSongIndex = songId === null ? null : librarySongs.findIndex((song) => song.id === songId);
      },
      visibleLibraryItems,
    } as unknown as CoordinatorOptions["scoreLibrary"];
    const coordinator = usePlaybackCoordinator({
      appendLog, experimentalInput, playbackOrder, playbackOutput, playbackQueue, scoreLibrary, text,
    });
    return {
      appendLog,
      coordinator,
      onPlay,
      playbackOrder,
      playbackOutput,
      previewPlayback,
      queueIds: () => playbackQueue.getValidQueueItemsFromItem(
        playbackQueue.getFirstQueueItem()?.id ?? "", librarySongs.length,
      ).map((item) => librarySongs[item.songIndex].id),
      queueHead: playbackQueue.getFirstQueueItem,
      queueItems: () => playbackQueue.getValidQueueItemsFromItem(
        playbackQueue.getFirstQueueItem()?.id ?? "", librarySongs.length,
      ),
      resolveSongForPlayback,
      visibleLibraryItems,
    };
  }

  let harness!: ReturnType<typeof mount>;
  renderToStaticMarkup(createElement(function Harness() {
    harness = mount();
    return null;
  }));
  return harness;
}

describe("playback queue entry points", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(queue?: number[], selected?: number | null) {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    return createPreviewHarness(queue, selected);
  }

  it("plays a queue without a selected score and restarts the same head after Stop", async () => {
    const app = setup([0, 1, 2]);
    const initialHead = app.queueHead();
    expect(app.coordinator.canPlay).toBe(true);

    await app.coordinator.handleBottomPlayerPlay();
    app.coordinator.handleStopPlayback();
    await app.coordinator.handleBottomPlayerPlay();

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0], [0]]);
    expect(app.queueHead()).toBe(initialHead);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
    expect(app.onPlay).not.toHaveBeenCalled();
  });

  it("starts an empty queue when a score is added with no selection", async () => {
    const app = setup();
    expect(app.coordinator.canPlay).toBe(false);
    await app.coordinator.handleAddSongToQueue(2);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[2]]);
    expect(app.queueIds()).toEqual(["C"]);
  });

  it("starts the existing head when appending to an idle queue", async () => {
    const app = setup([0, 1], 3);
    await app.coordinator.handleAddSongToQueue(2);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0]]);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
  });

  it("prioritizes an already queued song when idle without duplicating it", async () => {
    const app = setup([0, 1, 2]);
    await app.coordinator.handlePlaySongNext(1);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[1]]);
    expect(app.queueIds()).toEqual(["B", "A", "C"]);
    expect(app.playbackOrder.activePlaybackContextRef.current?.songIds).toEqual(["B", "A", "C"]);
  });

  it("preserves queue order if the idle Play Next request fails to start", async () => {
    const app = setup([0, 1, 2]);
    app.resolveSongForPlayback.mockResolvedValueOnce(null);
    await app.coordinator.handlePlaySongNext(1);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[1]]);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
  });

  it("plays directly from the library and keeps the previous pending songs", async () => {
    const app = setup([0, 1, 2]);
    await app.coordinator.handleBottomPlayerPlay();
    app.coordinator.handleStopPlayback();
    await app.coordinator.handlePlayLibraryItem(app.visibleLibraryItems[3]);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0], [3]]);
    expect(app.queueIds()).toEqual(["D", "B", "C"]);
    expect(app.playbackOrder.getCommittedPlaybackContextSongId()).toBe("D");
  });

  it("plays through each pending score and finishes on the last item", async () => {
    const app = setup([0, 1, 2]);
    await app.coordinator.handleBottomPlayerPlay();
    await vi.runAllTimersAsync();

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0], [1], [2]]);
    expect(app.queueIds()).toEqual(["C"]);
    expect(app.appendLog).toHaveBeenLastCalledWith(uiText["en-US"].logs.previewFinished);
  });

  it("uses the resume action for paused output without starting or changing the queue", async () => {
    const app = setup([0, 1]);
    const onResume = vi.spyOn(app.playbackOutput, "onResume");
    app.playbackOutput.playbackState = "paused";
    await app.coordinator.handleBottomPlayerPlay();

    expect(onResume).toHaveBeenCalledOnce();
    expect(app.resolveSongForPlayback).not.toHaveBeenCalled();
    expect(app.queueIds()).toEqual(["A", "B"]);
  });

  it("does not start output when adding to a paused queue", async () => {
    const app = setup([0, 1]);
    app.playbackOutput.playbackState = "paused";
    app.playbackOutput.canStartQueue = false;
    await app.coordinator.handleAddSongToQueue(2);

    expect(app.resolveSongForPlayback).not.toHaveBeenCalled();
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
  });

  it("clears the queue only when explicitly requested after Stop", async () => {
    const app = setup([0, 1]);
    await app.coordinator.handleBottomPlayerPlay();
    app.coordinator.handleStopPlayback();
    expect(app.queueIds()).toEqual(["A", "B"]);
    app.coordinator.handleQueueClear();
    expect(app.queueIds()).toEqual([]);
    expect(app.playbackOrder.getCommittedPlaybackContextSongId()).toBeNull();
  });

  it("keeps the next score queued when automatic loading fails", async () => {
    const app = setup([0, 1, 2]);
    await app.coordinator.handleBottomPlayerPlay();
    app.resolveSongForPlayback.mockResolvedValueOnce(null);
    await vi.runAllTimersAsync();

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0], [1]]);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
  });

  it("keeps the queue and prior context when a clicked queue item fails to load", async () => {
    const app = setup([0, 1, 2]);
    await app.coordinator.handleBottomPlayerPlay();
    app.resolveSongForPlayback.mockResolvedValueOnce(null);
    await app.coordinator.handlePlayQueueItem(app.queueItems()[1]);

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0], [1]]);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
    expect(app.playbackOrder.getCommittedPlaybackContextSongId()).toBe("A");
  });

  it("starts only once during concurrent Add and Play, and cancels loading on Stop", async () => {
    const app = setup([0, 1]);
    let finishLoading!: (song: Song) => void;
    app.resolveSongForPlayback.mockImplementationOnce(() => new Promise((resolve) => {
      finishLoading = resolve;
    }));
    const start = app.coordinator.handleBottomPlayerPlay();
    await app.coordinator.handleAddSongToQueue(2);
    app.coordinator.handleStopPlayback();
    finishLoading({ ...createSong("A").metadata, songNotes: [{ key: "A", time: 50 }] });
    await start;
    await vi.runAllTimersAsync();

    expect(app.resolveSongForPlayback.mock.calls).toEqual([[0]]);
    expect(app.queueIds()).toEqual(["A", "B", "C"]);
    expect(app.playbackOrder.getCommittedPlaybackContextSongId()).toBeNull();
    expect(app.previewPlayback.getActivePreviewPlaybackSongId()).toBeNull();
  });
});

describe("shouldSkipTargetWindowEnumerationBeforePlayback", () => {
  it("skips full window enumeration for ordinary target-window song switches", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: "1234",
      }),
    ).toBe(true);
  });

  it("still requires the existing missing-target handling when no target is selected", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "experimental-target-window",
        selectedWindowHwnd: null,
      }),
    ).toBe(false);
  });

  it("does not enumerate windows for non-target playback modes", () => {
    expect(
      shouldSkipTargetWindowEnumerationBeforePlayback({
        mode: "preview",
        selectedWindowHwnd: null,
      }),
    ).toBe(true);
  });
});

describe("pending playback coordination", () => {
  it("keeps the newer next request and applies its queue update exactly once", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "A",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    let resolvePendingB!: (didStart: boolean) => void;
    const pendingB = new Promise<boolean>((resolve) => {
      resolvePendingB = resolve;
    });
    const transactionB = contextStore.begin({
      currentSongId: "B",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    const resultB = runPlaybackContextTransaction({
      commit: (transaction) => contextStore.commit(transaction),
      rollback: (transaction) => contextStore.rollback(transaction),
      start: () => pendingB,
      transaction: transactionB,
    });

    let queueUpdates = 0;
    let unavailableStops = 0;
    const transactionC = contextStore.beginCurrentSong("C")!;
    const resultC = await runPlaybackContextTransaction({
      commit: (transaction) => contextStore.commit(transaction),
      rollback: (transaction) => contextStore.rollback(transaction),
      start: async () => true,
      transaction: transactionC,
    });
    if (resultC === "started") {
      queueUpdates += 1;
    } else {
      unavailableStops += 1;
    }

    resolvePendingB(false);
    await expect(resultB).resolves.toBe("stale");
    expect(contextStore.getCurrentSongId()).toBe("C");
    expect(queueUpdates).toBe(1);
    expect(unavailableStops).toBe(0);
  });

  it("continues B to C to D from queue without playback-order context", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    let queueItems: PlaybackQueueItem[] = [
      { addedAt: 1, id: "B", songIndex: 1 },
      { addedAt: 2, id: "C", songIndex: 2 },
      { addedAt: 3, id: "D", songIndex: 3 },
    ];
    let stopCalls = 0;
    let unavailableLogs = 0;

    for (const currentSongIndex of [1, 2]) {
      const decision = resolveNextQueueItemForCurrent({
        currentSongIndex,
        queueItems,
        songCount: 4,
      });
      expect(decision.status).toBe("next");
      if (decision.status !== "next") {
        stopCalls += 1;
        unavailableLogs += 1;
        continue;
      }

      const nextSongId = decision.nextItem.id;
      const transaction = contextStore.begin({
        currentSongId: nextSongId,
        songIds: decision.remainingItems.map((item) => item.id),
        source: "queue",
      });
      await expect(
        runPlaybackContextTransaction({
          commit: (value) => contextStore.commit(value),
          rollback: (value) => contextStore.rollback(value),
          start: async () => true,
          transaction,
        }),
      ).resolves.toBe("started");
      queueItems = [decision.nextItem, ...decision.remainingItems.slice(1)];
    }

    expect(contextStore.getContext()).toEqual({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });
    expect(queueItems.map((item) => item.id)).toEqual(["D"]);
    expect(stopCalls).toBe(0);
    expect(unavailableLogs).toBe(0);
  });

  it("rolls back failed queued C and leaves the queue unchanged", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["A", "B", "C"],
      source: "local-imports",
    });
    const queueItems: PlaybackQueueItem[] = [
      { addedAt: 1, id: "B", songIndex: 1 },
      { addedAt: 2, id: "C", songIndex: 2 },
      { addedAt: 3, id: "D", songIndex: 3 },
    ];
    const transaction = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });

    await expect(
      runPlaybackContextTransaction({
        commit: (value) => contextStore.commit(value),
        rollback: (value) => contextStore.rollback(value),
        start: async () => false,
        transaction,
      }),
    ).resolves.toBe("failed");
    expect(contextStore.getCurrentSongId()).toBe("B");
    expect(queueItems.map((item) => item.id)).toEqual(["B", "C", "D"]);
  });

  it("does not let stale queued C consume or restore over pending D", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["B", "C", "D"],
      source: "queue",
    });
    let resolveC!: (didStart: boolean) => void;
    const pendingC = new Promise<boolean>((resolve) => {
      resolveC = resolve;
    });
    let consumedC = 0;
    const transactionC = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });
    const resultC = runPlaybackContextTransaction({
      commit: (value) => contextStore.commit(value),
      rollback: (value) => contextStore.rollback(value),
      start: () => pendingC,
      transaction: transactionC,
    });

    const transactionD = contextStore.begin({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });
    await runPlaybackContextTransaction({
      commit: (value) => contextStore.commit(value),
      rollback: (value) => contextStore.rollback(value),
      start: async () => true,
      transaction: transactionD,
    });
    resolveC(true);
    if ((await resultC) === "started") {
      consumedC += 1;
    }

    expect(consumedC).toBe(0);
    expect(contextStore.getCurrentSongId()).toBe("D");
  });

  it("uses pending C over active B so rapid Next resolves D", async () => {
    const librarySongs = ["A", "B", "C", "D"].map(createSong);
    const queueItems: PlaybackQueueItem[] = [
      { addedAt: 1, id: "B", songIndex: 1 },
      { addedAt: 2, id: "C", songIndex: 2 },
      { addedAt: 3, id: "D", songIndex: 3 },
    ];
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["B", "C", "D"],
      source: "queue",
    });
    let resolveC!: (didStart: boolean) => void;
    const pendingC = new Promise<boolean>((resolve) => {
      resolveC = resolve;
    });
    const transactionC = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });
    const resultC = runPlaybackContextTransaction({
      commit: (value) => contextStore.commit(value),
      rollback: (value) => contextStore.rollback(value),
      start: () => pendingC,
      transaction: transactionC,
    });

    const currentResolution = resolveManualNextCurrentSong({
      activeForegroundSongId: "B",
      activeTargetWindowSongId: null,
      contextSongId: contextStore.getCurrentSongId(),
      librarySongs,
      pendingContextSongId: contextStore.getPendingCurrentSongId(),
      playbackSongIndex: 1,
      selectedSongIndex: 1,
    });
    expect(currentResolution).toMatchObject({
      status: "resolved",
      songId: "C",
      source: "pending-playback-context",
    });
    if (currentResolution.status !== "resolved") {
      throw new Error("Pending C should resolve before active B.");
    }
    const queueDecision = resolveNextQueueItemForCurrent({
      currentSongIndex: currentResolution.songIndex,
      queueItems,
      songCount: librarySongs.length,
    });
    expect(queueDecision).toMatchObject({
      status: "next",
      nextItem: { id: "D", songIndex: 3 },
    });

    const transactionD = contextStore.begin({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });
    await expect(
      runPlaybackContextTransaction({
        commit: (value) => contextStore.commit(value),
        rollback: (value) => contextStore.rollback(value),
        start: async () => true,
        transaction: transactionD,
      }),
    ).resolves.toBe("started");
    resolveC(true);
    await expect(resultC).resolves.toBe("stale");
    expect(contextStore.getCommittedCurrentSongId()).toBe("D");
    expect(contextStore.getPendingContext()).toBeNull();
  });

  it("returns to committed B when superseding D fails", async () => {
    const contextStore = new PlaybackContextTransactionStore();
    contextStore.replace({
      currentSongId: "B",
      songIds: ["B", "C", "D"],
      source: "queue",
    });
    const transactionC = contextStore.begin({
      currentSongId: "C",
      songIds: ["C", "D"],
      source: "queue",
    });
    const transactionD = contextStore.begin({
      currentSongId: "D",
      songIds: ["D"],
      source: "queue",
    });

    await expect(
      runPlaybackContextTransaction({
        commit: (value) => contextStore.commit(value),
        rollback: (value) => contextStore.rollback(value),
        start: async () => false,
        transaction: transactionD,
      }),
    ).resolves.toBe("failed");
    expect(contextStore.getCurrentSongId()).toBe("B");
    expect(contextStore.getCommittedCurrentSongId()).toBe("B");
    expect(contextStore.getPendingContext()).toBeNull();
    expect(contextStore.commit(transactionC)).toBe(false);
  });
});
