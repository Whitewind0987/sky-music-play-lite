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
});
