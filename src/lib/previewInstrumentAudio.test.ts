import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewInstrumentAudio } from "./previewInstrumentAudio";

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
    const piano = createPreviewInstrumentAudio();
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
    const { context, voices, gains } = mockAudio();
    const piano = createPreviewInstrumentAudio();
    await piano.prepare();
    piano.playGroup([
      { key: "Key0", time: 0 },
      { key: "Key4", time: 0, duration: 1000 },
    ], 2);
    expect(gains[0].gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.0008, 5);
    expect(gains[0].gain.exponentialRampToValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.315);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.32);
    expect(gains[1].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.5);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.68);

    context.currentTime = 10.1;
    piano.playGroup([{ key: "Key0", time: 200 }], 2);
    expect(voices[2].start).toHaveBeenCalledWith(10.1);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.145);
    expect(voices[1].stop).toHaveBeenCalledTimes(1);

    context.currentTime = 10.2;
    piano.updateSpeed(1);
    expect(gains[1].gain.cancelScheduledValues).toHaveBeenCalledWith(10.5);
    expect(gains[1].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.8);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.98);
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
    const piano = createPreviewInstrumentAudio();
    const notes = [{ key: "Key0", time: 0 }];
    await piano.prepare();
    piano.playGroup(notes, 1);
    expect(voices).toHaveLength(0);
    await piano.prepare();
    piano.playGroup(notes, 1);
    expect(voices).toHaveLength(1);
  });

  it("loads only the selected bank, fades on switches and reuses decoded samples", async () => {
    const { context, voices, fetchSample } = mockAudio();
    const audio = createPreviewInstrumentAudio();
    audio.selectInstrument("violin");
    await audio.prepare();
    const violinRoots = new Map([
      ["C4.wav", 60], ["E4.wav", 64], ["G4.wav", 67], ["A4.wav", 69],
      ["C5.wav", 72], ["E5.wav", 76], ["G5.wav", 79], ["A5.wav", 81], ["C6.wav", 84],
    ]);
    const notes = Array.from({ length: 15 }, (_, index) => ({
      key: `Key${index}`, time: 0, duration: 6000,
    }));
    audio.playGroup(notes, 2);
    expect(fetchSample.mock.calls.flat()).toEqual(
      Array.from(violinRoots.keys(), file => `/audio/vsco-violin/${file}`),
    );
    expect(voices.map(({ buffer, playbackRate }) =>
      Math.round(violinRoots.get(String(buffer))! + 12 * Math.log2(playbackRate.value)),
    )).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]);
    expect(voices[0]).toMatchObject({ loop: true, loopStart: 1, loopEnd: 106496 / 44100 });
    expect(voices[0].stop).toHaveBeenCalledWith(13.28);

    audio.selectInstrument("guitar");
    expect(voices[0].stop).toHaveBeenLastCalledWith(10.015);
    audio.playGroup(notes, 1);
    expect(voices).toHaveLength(15);
    await audio.prepare();
    context.currentTime = 11;
    audio.playGroup(notes, 1);
    const guitarVoices = voices.slice(15);
    expect(guitarVoices.map(({ buffer }) => buffer)).toEqual([
      "C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5",
    ].map(name => `${name}.wav`));
    expect(guitarVoices.every(({ loop, playbackRate }) => !loop && playbackRate.value === 1)).toBe(true);
    audio.selectInstrument("violin");
    await audio.prepare();
    expect(fetchSample).toHaveBeenCalledTimes(24);
  });
});
