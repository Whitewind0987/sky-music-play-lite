import { describe, expect, it, vi } from "vitest";
import type { Song } from "../types/score";
import { prepareWarmPlaybackPlan } from "./warmPlaybackPreparation";

const song: Song = {
  bitsPerPage: 16,
  bpm: 120,
  isComposed: false,
  name: "Warm",
  pitchLevel: 0,
  songNotes: [{ key: "1Key0", time: 0 }],
};

describe("prepareWarmPlaybackPlan", () => {
  it("passes the already silently resolved song into preparation", async () => {
    const resolveSongForWarmPreparation = vi.fn().mockResolvedValue(song);
    const prepareResolvedSong = vi.fn().mockResolvedValue("prepared");

    await expect(
      prepareWarmPlaybackPlan({
        prepareResolvedSong,
        resolveSongForWarmPreparation,
        songIndex: 7,
      }),
    ).resolves.toBe("prepared");

    expect(resolveSongForWarmPreparation).toHaveBeenCalledWith(7);
    expect(prepareResolvedSong).toHaveBeenCalledWith(song);
  });

  it("keeps a speculative resolution failure silent and skips preparation", async () => {
    const appendLog = vi.fn();
    const showNotice = vi.fn();
    const prepareResolvedSong = vi.fn();

    await expect(
      prepareWarmPlaybackPlan({
        prepareResolvedSong,
        resolveSongForWarmPreparation: async () => {
          void appendLog;
          void showNotice;
          return null;
        },
        songIndex: 1,
      }),
    ).resolves.toBeNull();

    expect(prepareResolvedSong).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });
});
