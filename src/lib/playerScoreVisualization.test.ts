import { describe, expect, it } from "vitest";
import type { PlaybackState } from "../types/playback";
import type { Note } from "../types/score";
import { derivePlayerScoreVisualizationFrame } from "./playerScoreVisualization";
import { buildScoreVisualization } from "./scoreVisualization";

const defaultTimingOptions = {
  noteIntervalDelayMs: 0,
  playbackSpeed: 1,
} as const;

function buildGroups(notes: Note[]) {
  return buildScoreVisualization(notes, defaultTimingOptions, {
    visualChordWindowMs: 0,
  }).groups;
}

function buildSequentialGroups(count: number) {
  return buildGroups(
    Array.from({ length: count }, (_, index) => ({
      key: `Key${index % 15}`,
      time: index * 100,
    })),
  );
}

function derive(
  notes: Note[],
  playbackState: PlaybackState,
  currentMs: number,
) {
  return derivePlayerScoreVisualizationFrame(
    buildGroups(notes),
    playbackState,
    currentMs,
  );
}

describe("derivePlayerScoreVisualizationFrame", () => {
  it("keeps idle playback on the opening page without a focused or active note", () => {
    expect(derive([{ key: "Key0", time: 0 }], "idle", 0)).toEqual({
      activeKeys: [],
      focusGroupIndex: -1,
      pageIndex: 0,
      markCurrentGroup: false,
    });
  });

  it("focuses and activates the first group while playing", () => {
    expect(derive([{ key: "Key4", time: 100 }], "playing", 100)).toEqual({
      activeKeys: ["Key4"],
      focusGroupIndex: 0,
      pageIndex: 0,
      markCurrentGroup: true,
    });
  });

  it("focuses the most recently started group between group starts", () => {
    const frame = derive(
      [
        { key: "Key0", time: 100 },
        { key: "Key1", time: 200 },
        { key: "Key2", time: 300 },
      ],
      "playing",
      250,
    );

    expect(frame.focusGroupIndex).toBe(1);
    expect(frame.pageIndex).toBe(0);
  });

  it("freezes focus, page, and a held V2 key at the paused instant", () => {
    const frame = derive(
      [
        { key: "Key0", time: 0, duration: 2000 },
        { key: "Key1", time: 500 },
      ],
      "paused",
      750,
    );

    expect(frame).toMatchObject({
      activeKeys: ["Key0", "Key1"],
      focusGroupIndex: 1,
      pageIndex: 0,
      markCurrentGroup: true,
    });
  });

  it("clears active keys after finish while retaining final focus and page", () => {
    const groups = buildSequentialGroups(31);

    expect(
      derivePlayerScoreVisualizationFrame(groups, "finished", 10_000),
    ).toEqual({
      activeKeys: [],
      focusGroupIndex: 30,
      pageIndex: 2,
      markCurrentGroup: true,
    });
  });

  it("does not make the first note active in the stopped idle state", () => {
    const frame = derive([{ key: "Key0", time: 0 }], "idle", 0);

    expect(frame.activeKeys).toEqual([]);
    expect(frame.focusGroupIndex).toBe(-1);
    expect(frame.markCurrentGroup).toBe(false);
  });

  it.each([
    [14, 0],
    [15, 1],
    [29, 1],
    [30, 2],
  ])("maps focused group %i to page %i", (groupIndex, pageIndex) => {
    const groups = buildSequentialGroups(31);
    const frame = derivePlayerScoreVisualizationFrame(
      groups,
      "playing",
      groupIndex * 100,
    );

    expect(frame.focusGroupIndex).toBe(groupIndex);
    expect(frame.pageIndex).toBe(pageIndex);
  });

  it("keeps a long earlier V2 note active while focus advances", () => {
    const frame = derive(
      [
        { key: "Key0", time: 0, duration: 2000 },
        { key: "Key1", time: 500 },
        { key: "Key2", time: 1000 },
        { key: "Key3", time: 1500 },
      ],
      "playing",
      1500,
    );

    expect(frame.focusGroupIndex).toBe(3);
    expect(frame.activeKeys).toEqual(["Key0", "Key3"]);
  });

  it("returns every active key in a chord", () => {
    const frame = derive(
      [
        { key: "Key8", time: 0 },
        { key: "Key0", time: 0 },
        { key: "Key4", time: 0 },
      ],
      "playing",
      0,
    );

    expect(frame.activeKeys).toEqual(["Key0", "Key4", "Key8"]);
    expect(frame.focusGroupIndex).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "returns a safe frame for invalid progress %s",
    (currentMs) => {
      expect(
        derive([{ key: "Key0", time: 0 }], "playing", currentMs),
      ).toEqual({
        activeKeys: [],
        focusGroupIndex: -1,
        pageIndex: 0,
        markCurrentGroup: false,
      });
    },
  );

  it("returns a safe frame for an empty score", () => {
    expect(
      derivePlayerScoreVisualizationFrame([], "playing", 0),
    ).toEqual({
      activeKeys: [],
      focusGroupIndex: -1,
      pageIndex: 0,
      markCurrentGroup: false,
    });
  });
});
