import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewPiano } from "./previewPiano";

function mockAudio() {
  const voices: ReturnType<typeof createSource>[] = [];
  const gains: ReturnType<typeof createGain>[] = [];
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    createBufferSource: () => {
      const source = createSource();
      voices.push(source);
      return source;
    },
    createGain: () => {
      const gain = createGain();
      gains.push(gain);
      return gain;
    },
    decodeAudioData: vi.fn(async (buffer) => buffer),
    close: vi.fn(async () => {}),
  };
  function createGain() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        cancelAndHoldAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    };
  }
  function createSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
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
  return { context, voices, gains, fetchSample };
}

describe("offline preview piano", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps all logical keys to local samples and starts a chord on one audio clock tick", async () => {
    const { voices, fetchSample } = mockAudio();
    const piano = createPreviewPiano();
    await Promise.all([piano.prepare(), piano.prepare()]);
    expect(fetchSample.mock.calls.flat()).toEqual(
      ["C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6"]
        .map((name) => `/audio/upright-piano-kw-bright/${name}vH.wav`),
    );

    piano.playGroup(Array.from({ length: 15 }, (_, index) => ({
      key: `1Key${index}`,
      time: 0,
    })), 1);

    const roots = new Map([
      ["C4vH.wav", 60], ["Ds4vH.wav", 63], ["Fs4vH.wav", 66],
      ["A4vH.wav", 69], ["C5vH.wav", 72], ["Ds5vH.wav", 75],
      ["Fs5vH.wav", 78], ["A5vH.wav", 81], ["C6vH.wav", 84],
    ]);
    const samplePitches = voices.map(({ buffer }) => roots.get(String(buffer))!);
    expect(samplePitches).toEqual([60, 63, 63, 66, 66, 69, 72, 72, 75, 75, 78, 78, 81, 84, 84]);
    voices.forEach(({ playbackRate }, index) => {
      const expectedPitch = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84][index];
      expect(samplePitches[index] + 12 * Math.log2(playbackRate.value)).toBeCloseTo(expectedPitch, 8);
    });
    expect(voices.map(({ start }) => start.mock.calls[0])).toEqual(Array(15).fill([10]));
    expect(voices.map(({ loop }) => loop)).toEqual([
      true, true, true, true, true, false, false, false, false, false, false, false, false, false, false,
    ]);
    expect(voices[0].loopStart).toBeCloseTo(145927 / 44100, 8);
    expect(voices[0].loopEnd).toBeCloseTo(213380 / 44100, 8);
  });

  it("scales V1 and V2 holds, adjusts a live hold, and fades voices before the next group", async () => {
    const { context, voices, gains } = mockAudio();
    const piano = createPreviewPiano();
    await piano.prepare();
    piano.playGroup([
      { key: "Key0", time: 0 },
      { key: "Key4", time: 0, duration: 1000 },
    ], 2);
    expect(gains[0].gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.0008, 5);
    expect(gains[0].gain.exponentialRampToValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.315);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.32);
    expect(gains[1].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.5);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(11.1);

    context.currentTime = 10.1;
    piano.playGroup([{ key: "Key0", time: 200 }], 2);
    expect(voices[2].start).toHaveBeenCalledWith(10.1);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.145);
    expect(voices[1].stop).toHaveBeenCalledTimes(1);

    context.currentTime = 10.2;
    piano.updateSpeed(1);
    expect(gains[1].gain.cancelScheduledValues).toHaveBeenCalledWith(10.5);
    expect(gains[1].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.8);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(11.4);
    piano.stop();
    expect(gains[1].gain.cancelAndHoldAtTime).toHaveBeenCalledWith(10.2);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.215);
    context.currentTime = 11;
    piano.playGroup([{ key: "Key4", time: 1200 }], 1);
    expect(voices[3].start).toHaveBeenCalledWith(11);
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
