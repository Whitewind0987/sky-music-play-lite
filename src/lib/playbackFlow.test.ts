import { describe, expect, it, vi } from "vitest";
import { decidePlaybackFinish, getRandomNextSongIndex } from "./playbackFlow";

describe("decidePlaybackFinish", () => {
  it("repeats the current song in repeat-one mode", () => {
    expect(
      decidePlaybackFinish({
        currentSongIndex: 2,
        isShuffleEnabled: false,
        playbackMode: "repeat-one",
        queuedSongIndex: 3,
        songCount: 5,
      }),
    ).toEqual({ type: "repeat-current" });
  });

  it("plays the queued song next when not in repeat-one mode", () => {
    expect(
      decidePlaybackFinish({
        currentSongIndex: 1,
        isShuffleEnabled: false,
        playbackMode: "repeat-all",
        queuedSongIndex: 4,
        songCount: 5,
      }),
    ).toEqual({ nextSongIndex: 4, type: "play-next" });
  });

  it("finishes sequence playback when there is no queue", () => {
    expect(
      decidePlaybackFinish({
        currentSongIndex: 1,
        isShuffleEnabled: false,
        playbackMode: "sequence",
        queuedSongIndex: null,
        songCount: 5,
      }),
    ).toEqual({ type: "finish" });
  });

  it("moves to the next song in repeat-all mode", () => {
    expect(
      decidePlaybackFinish({
        currentSongIndex: 1,
        isShuffleEnabled: false,
        playbackMode: "repeat-all",
        queuedSongIndex: null,
        songCount: 3,
      }),
    ).toEqual({ nextSongIndex: 2, type: "play-next" });
  });

  it("wraps to the first song at the end in repeat-all mode", () => {
    expect(
      decidePlaybackFinish({
        currentSongIndex: 2,
        isShuffleEnabled: false,
        playbackMode: "repeat-all",
        queuedSongIndex: null,
        songCount: 3,
      }),
    ).toEqual({ nextSongIndex: 0, type: "play-next" });
  });

  it("finishes without queue when library fallback is disabled", () => {
    expect(
      decidePlaybackFinish({
        allowLibraryFallback: false,
        currentSongIndex: 1,
        isShuffleEnabled: false,
        playbackMode: "repeat-all",
        queuedSongIndex: null,
        songCount: 3,
      }),
    ).toEqual({ type: "finish" });
  });
});

describe("getRandomNextSongIndex", () => {
  it("returns the current index when there is only one song", () => {
    expect(getRandomNextSongIndex(0, 1)).toBe(0);
  });

  it("retries until it returns a different index", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.8);

    expect(getRandomNextSongIndex(1, 3)).toBe(2);
    expect(randomSpy).toHaveBeenCalledTimes(2);

    randomSpy.mockRestore();
  });
});
