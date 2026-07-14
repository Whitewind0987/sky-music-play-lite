import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/score";
import {
  getAdjustedPreviewDurationFromMetadata,
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
} from "./playbackScheduler";
import { createLocalSongMetadata } from "./libraryCollections";
import type { Song } from "../types/score";

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

describe("getAdjustedPreviewDurationFromMetadata", () => {
  const cases: Array<{
    name: string;
    notes: Note[];
    options: { noteIntervalDelayMs: number; playbackSpeed: number };
  }> = [
    {
      name: "empty song",
      notes: [],
      options: { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    },
    {
      name: "one note group",
      notes: [{ key: "Key0", time: 250 }],
      options: { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    },
    {
      name: "simultaneous notes",
      notes: [
        { key: "Key0", time: 500 },
        { key: "Key1", time: 500 },
      ],
      options: { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    },
    {
      name: "multiple groups",
      notes,
      options: { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    },
    {
      name: "non-default speed",
      notes,
      options: { noteIntervalDelayMs: 0, playbackSpeed: 1.25 },
    },
    {
      name: "positive interval delay",
      notes,
      options: { noteIntervalDelayMs: 50, playbackSpeed: 1.5 },
    },
    {
      name: "negative interval delay with short gaps",
      notes: [
        { key: "Key0", time: 0 },
        { key: "Key1", time: 50 },
        { key: "Key2", time: 500 },
      ],
      options: { noteIntervalDelayMs: -100, playbackSpeed: 1 },
    },
  ];

  it.each(cases)("matches full-note duration for $name", ({ notes, options }) => {
    const song: Song = {
      bitsPerPage: 16,
      bpm: 120,
      isComposed: false,
      name: "Duration",
      pitchLevel: 0,
      songNotes: notes,
    };

    expect(
      getAdjustedPreviewDurationFromMetadata(
        createLocalSongMetadata(song),
        options,
      ),
    ).toBe(getAdjustedPreviewDurationMs(notes, options));
  });
});

describe("scores-v2 sustain tails", () => {
  const sustainNotes: Note[] = [
    { time: 0, key: "Key0", duration: 5000 },
    { time: 1000, key: "Key1" },
  ];

  it("includes the scaled sustain tail in the adjusted duration", () => {
    expect(
      getAdjustedPreviewDurationMs(sustainNotes, {
        noteIntervalDelayMs: 0,
        playbackSpeed: 2,
      }),
    ).toBe(2500);
  });

  it("ignores tails that end before the last group", () => {
    expect(
      getAdjustedPreviewDurationMs(
        [
          { time: 0, key: "Key0", duration: 400 },
          { time: 1000, key: "Key1" },
        ],
        { noteIntervalDelayMs: 0, playbackSpeed: 1 },
      ),
    ).toBe(1000);
  });

  it.each([
    { noteIntervalDelayMs: 0, playbackSpeed: 1 },
    { noteIntervalDelayMs: 50, playbackSpeed: 2 },
  ])("matches metadata duration for sustained songs (%o)", (options) => {
    const song: Song = {
      bitsPerPage: 16,
      bpm: 120,
      isComposed: false,
      name: "Sustained",
      pitchLevel: 0,
      songNotes: sustainNotes,
    };

    expect(
      getAdjustedPreviewDurationFromMetadata(
        createLocalSongMetadata(song),
        options,
      ),
    ).toBe(getAdjustedPreviewDurationMs(sustainNotes, options));
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

  it("delays preview finish until the sustain tail ends", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();
    const sustainNotes: Note[] = [
      { time: 0, key: "Key0", duration: 4000 },
      { time: 1000, key: "Key1" },
    ];

    schedulePreviewPlayback(sustainNotes, onNoteGroup, onFinish, {
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 0,
      percent: 0,
      totalMs: 4000,
    });

    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(1000);
    expect(onNoteGroup).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2999);
    expect(onFinish).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("keeps the sustain tail in the total when seeking", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();
    const sustainNotes: Note[] = [
      { time: 0, key: "Key0", duration: 4000 },
      { time: 1000, key: "Key1" },
    ];

    const controller = schedulePreviewPlayback(
      sustainNotes,
      onNoteGroup,
      onFinish,
      {
        noteIntervalDelayMs: 0,
        onProgress,
        playbackSpeed: 1,
      },
    );

    vi.advanceTimersByTime(0);
    controller.seekTo(500);

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 500,
      percent: 12.5,
      totalMs: 4000,
    });

    controller.seekTo(3000);
    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 3000,
      percent: 75,
      totalMs: 4000,
    });

    vi.advanceTimersByTime(1000);
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

  it("starts from an initial progress and skips earlier note groups", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();

    schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      initialProgressMs: 750,
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 750,
      percent: 75,
      totalMs: 1000,
    });

    vi.advanceTimersByTime(249);
    expect(onNoteGroup).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onNoteGroup).toHaveBeenCalledTimes(1);
    expect(onNoteGroup.mock.calls[0]?.[0]).toEqual([
      { time: 1000, key: "Key3" },
    ]);
    expect(
      onNoteGroup.mock.calls.some((call) =>
        call[0].some(
          (note: Note) =>
            note.key === "Key0" || note.key === "Key1" || note.key === "Key2",
        ),
      ),
    ).toBe(false);
  });

  it("clamps initial progress and finishes safely at the end", () => {
    const onNoteGroup = vi.fn();
    const onFinish = vi.fn();
    const onProgress = vi.fn();

    schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      initialProgressMs: -100,
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 0,
      percent: 0,
      totalMs: 1000,
    });

    schedulePreviewPlayback(notes, onNoteGroup, onFinish, {
      initialProgressMs: 5000,
      noteIntervalDelayMs: 0,
      onProgress,
      playbackSpeed: 1,
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      currentMs: 1000,
      percent: 100,
      totalMs: 1000,
    });

    vi.advanceTimersByTime(299);
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
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
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("recalculates an early hold safely after an option update", () => {
    const onFinish = vi.fn();
    const onProgress = vi.fn();
    const controller = schedulePreviewPlayback(
      [
        { time: 0, key: "Key0", duration: 1000 },
        { time: 500, key: "Key1" },
      ],
      vi.fn(),
      onFinish,
      { noteIntervalDelayMs: 0, onProgress, playbackSpeed: 1 },
    );

    vi.advanceTimersByTime(0);
    vi.advanceTimersByTime(100);
    controller.updateOptions({ noteIntervalDelayMs: -200, playbackSpeed: 1 });

    expect(onProgress.mock.calls[onProgress.mock.calls.length - 1]?.[0].totalMs).toBe(
      1000,
    );
    vi.advanceTimersByTime(939);
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  function createLegacySustainMetadata() {
    const metadata = createLocalSongMetadata({
      bitsPerPage: 16,
      bpm: 120,
      isComposed: false,
      name: "Legacy sustain",
      pitchLevel: 0,
      songNotes: [
        { time: 0, key: "Key0", duration: 1000 },
        { time: 500, key: "Key1" },
      ],
    });
    const { noteGroupMaxHoldMs: _removed, ...legacyMetadata } = metadata;

    return legacyMetadata;
  }

  it("does not underestimate an early legacy hold after negative compression", () => {
    expect(
      getAdjustedPreviewDurationFromMetadata(createLegacySustainMetadata(), {
        noteIntervalDelayMs: -200,
        playbackSpeed: 1,
      }),
    ).toBe(1000);
  });

  it("keeps positive interval delay in the conservative legacy fallback", () => {
    expect(
      getAdjustedPreviewDurationFromMetadata(createLegacySustainMetadata(), {
        noteIntervalDelayMs: 200,
        playbackSpeed: 1,
      }),
    ).toBe(1200);
  });

  it("keeps zero-interval legacy duration unchanged", () => {
    expect(
      getAdjustedPreviewDurationFromMetadata(createLegacySustainMetadata(), {
        noteIntervalDelayMs: 0,
        playbackSpeed: 1,
      }),
    ).toBe(1000);
  });
});
