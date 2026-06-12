import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/score";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
} from "./playbackScheduler";

const notes: Note[] = [
  { time: 0, key: "Key0" },
  { time: 500, key: "Key1" },
  { time: 500, key: "Key2" },
  { time: 1000, key: "Key3" },
];

describe("getAdjustedPreviewDurationMs", () => {
  it("returns 0 for empty notes", () => {
    expect(
      getAdjustedPreviewDurationMs([], {
        noteIntervalDelayMs: 0,
        playbackSpeed: 1,
      }),
    ).toBe(0);
  });

  it("groups notes with the same time and calculates gaps", () => {
    expect(
      getAdjustedPreviewDurationMs(notes, {
        noteIntervalDelayMs: 0,
        playbackSpeed: 1,
      }),
    ).toBe(1000);
  });

  it("includes noteIntervalDelayMs between groups", () => {
    expect(
      getAdjustedPreviewDurationMs(notes, {
        noteIntervalDelayMs: 50,
        playbackSpeed: 1,
      }),
    ).toBe(1100);
  });

  it("applies playbackSpeed to note gaps but not the interval delay", () => {
    expect(
      getAdjustedPreviewDurationMs(notes, {
        noteIntervalDelayMs: 50,
        playbackSpeed: 2,
      }),
    ).toBe(600);
  });

  it("sorts notes before calculating duration", () => {
    expect(
      getAdjustedPreviewDurationMs([...notes].reverse(), {
        noteIntervalDelayMs: 50,
        playbackSpeed: 2,
      }),
    ).toBe(600);
  });
});

describe("schedulePreviewPlayback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("schedules grouped notes in order", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();

    schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      playbackSpeed: 1,
    });

    vi.advanceTimersByTime(0);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);
    expect(onNoteGroup.mock.calls[0]?.[0]).toEqual([
      { time: 0, key: "Key0" },
    ]);

    vi.advanceTimersByTime(500);
    expect(onNoteGroup).toHaveBeenCalledTimes(2);
    expect(onNoteGroup.mock.calls[1]?.[0]).toEqual([
      { time: 500, key: "Key1" },
      { time: 500, key: "Key2" },
    ]);

    vi.advanceTimersByTime(500);
    expect(onNoteGroup).toHaveBeenCalledTimes(3);
    expect(onNoteGroup.mock.calls[2]?.[0]).toEqual([
      { time: 1000, key: "Key3" },
    ]);

    vi.advanceTimersByTime(300);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("stops later callbacks", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();

    const controller = schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      playbackSpeed: 1,
    });

    vi.advanceTimersByTime(0);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    controller.stop();
    vi.advanceTimersByTime(2000);

    expect(onNoteGroup).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("delays callbacks while paused until playback resumes", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const twoNotes: Note[] = [
      { time: 0, key: "Key0" },
      { time: 1000, key: "Key1" },
    ];

    const controller = schedulePreviewPlayback(twoNotes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      playbackSpeed: 1,
    });

    vi.advanceTimersByTime(0);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(400);
    controller.pause();
    vi.advanceTimersByTime(1000);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    controller.resume();
    vi.advanceTimersByTime(599);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onNoteGroup).toHaveBeenCalledTimes(2);
    expect(onNoteGroup.mock.calls[1]?.[0]).toEqual([
      { time: 1000, key: "Key1" },
    ]);
  });

  it("seeks while playing and skips note groups before the target", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();

    const controller = schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    vi.advanceTimersByTime(0);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    controller.seekTo(750);

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 750,
      percent: 75,
      totalMs: 1000,
    });

    vi.advanceTimersByTime(249);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onNoteGroup).toHaveBeenCalledTimes(2);
    expect(onNoteGroup.mock.calls[1]?.[0]).toEqual([
      { time: 1000, key: "Key3" },
    ]);
    expect(
      onNoteGroup.mock.calls.some((call) =>
        call[0].some(
          (note: Note) => note.key === "Key1" || note.key === "Key2",
        ),
      ),
    ).toBe(false);
  });

  it("seeks while paused without emitting notes until resume", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();

    const controller = schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    vi.advanceTimersByTime(0);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    controller.pause();
    controller.seekTo(750);

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 750,
      percent: 75,
      totalMs: 1000,
    });

    vi.advanceTimersByTime(500);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    controller.resume();
    vi.advanceTimersByTime(249);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onNoteGroup).toHaveBeenCalledTimes(2);
    expect(onNoteGroup.mock.calls[1]?.[0]).toEqual([
      { time: 1000, key: "Key3" },
    ]);
  });

  it("clamps seek targets to the playback duration", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();

    const controller = schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    controller.seekTo(-100);
    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 0,
      percent: 0,
      totalMs: 1000,
    });

    controller.seekTo(5000);
    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 1000,
      percent: 100,
      totalMs: 1000,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
