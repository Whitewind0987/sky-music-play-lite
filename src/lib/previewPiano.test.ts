import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewPiano } from "./previewPiano";

function mockAudio() {
  const voices: ReturnType<typeof createSource>[] = [];
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    createBufferSource: () => {
      const source = createSource();
      voices.push(source);
      return source;
    },
    createGain: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        cancelAndHoldAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    }),
    decodeAudioData: vi.fn(async (buffer) => buffer),
    close: vi.fn(async () => {}),
  };
  function createSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      playbackRate: { value: 1 },
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  const fetchSample = vi.fn(async (url: string) => ({
    ok: true,
    arrayBuffer: async () => url.slice(url.lastIndexOf("/") + 1),
  }));
  vi.stubGlobal("AudioContext", function () { return context; });
  vi.stubGlobal("fetch", fetchSample);
  return { context, voices, fetchSample };
}

describe("offline preview piano", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps all logical keys to local samples and starts a chord on one audio clock tick", async () => {
    const { voices, fetchSample } = mockAudio();
    const piano = createPreviewPiano();
    await Promise.all([piano.prepare(), piano.prepare()]);
    expect(fetchSample).toHaveBeenCalledTimes(9);
    expect(fetchSample).toHaveBeenCalledWith("/audio/salamander/C4.mp3");

    piano.playGroup(Array.from({ length: 15 }, (_, index) => ({
      key: `1Key${index}`,
      time: 0,
    })), 1);

    const samplePitches = new Map([
      ["C4.mp3", 60], ["Ds4.mp3", 63], ["Fs4.mp3", 66], ["A4.mp3", 69],
      ["C5.mp3", 72], ["Ds5.mp3", 75], ["Fs5.mp3", 78], ["A5.mp3", 81], ["C6.mp3", 84],
    ]);
    expect(voices.map(({ buffer, playbackRate }) => {
      const pitch = samplePitches.get(String(buffer))!;
      return Math.round(pitch + 12 * Math.log2(playbackRate.value));
    })).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]);
    expect(voices.map(({ start }) => start.mock.calls[0])).toEqual(Array(15).fill([10]));
  });

  it("scales V1 and V2 holds, adjusts a live hold, and fades voices before the next group", async () => {
    const { context, voices } = mockAudio();
    const piano = createPreviewPiano();
    await piano.prepare();
    piano.playGroup([
      { key: "Key0", time: 0 },
      { key: "Key4", time: 0, duration: 1000 },
    ], 2);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.115);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.525);

    context.currentTime = 10.2;
    piano.updateSpeed(1);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.825);
    piano.stop();
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.225);
    context.currentTime = 11;
    piano.playGroup([{ key: "Key4", time: 1200 }], 1);
    expect(voices[2].start).toHaveBeenCalledWith(11);
    piano.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("stays silent after a sample load fails and can retry", async () => {
    const { voices, fetchSample } = mockAudio();
    fetchSample.mockRejectedValueOnce(new Error("load failed"));
    const piano = createPreviewPiano();
    const notes = [{ key: "Key0", time: 0 }];
    await piano.prepare();
    piano.playGroup(notes, 1);
    expect(voices).toHaveLength(0);
    await piano.prepare();
    piano.playGroup(notes, 1);
    expect(voices).toHaveLength(1);
  });
});
