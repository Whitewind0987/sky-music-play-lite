import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewInstrumentAudio } from "./previewInstrumentAudio";
import { createPreviewV1Articulation } from "./previewV1Articulation";
import { readCustomInstrumentSample } from "./tauriApi";

vi.mock("./tauriApi", () => ({ readCustomInstrumentSample: vi.fn() }));

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
    decodeAudioData: vi.fn(async (buffer) => ({
      toString: () => String(buffer),
      length: 100,
      sampleRate: 100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(100).fill(0.1),
    })),
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

  it.each(["naturalDecay", "sustained"] as const)("plays custom %s samples at original pitch and releases on cleanup", async articulation => {
    const { context, voices, gains } = mockAudio();
    const read = vi.mocked(readCustomInstrumentSample);
    read.mockClear().mockResolvedValue(new ArrayBuffer(1));
    const audio = createPreviewInstrumentAudio();
    const releaseSeconds = articulation === "naturalDecay" ? 0.22 : 0.32;
    audio.selectInstrument({
      id: "f".repeat(32), name: "Custom", articulation, releaseSeconds, createdAt: 0,
      samples: Array.from({ length: 15 }, () => ({ name: "sample.wav", size: 1 })),
    });
    await Promise.all([audio.prepare(), audio.prepare()]);
    expect(read).toHaveBeenCalledTimes(15);
    const chord = [{ key: "Key0", time: 0 }, { key: "Key14", time: 0 }];
    const policy = createPreviewV1Articulation([...chord, { key: "Key0", time: 400 }]);
    const envelope = policy(0, { playbackSpeed: 1, noteIntervalDelayMs: 0 });
    audio.playGroup(chord, 1, envelope);
    const hold = envelope[articulation === "naturalDecay" ? "piano" : "guitar"].holdMs;
    expect(voices.map(({ start }) => start.mock.lastCall)).toEqual([[10], [10]]);
    expect(voices.every(voice => voice.playbackRate.value === 1 && !voice.loop)).toBe(true);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10 + hold / 1000 + releaseSeconds);
    context.currentTime = 10.1;
    audio.playGroup([{ ...chord[0], duration: 2000 }], 2);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.145);
    expect(voices[2].stop.mock.lastCall?.[0]).toBeCloseTo(11.1 + releaseSeconds);
    audio.setVolume(50, true);
    expect(gains[0].gain.linearRampToValueAtTime.mock.lastCall?.[0]).toBe(0);
    audio.stop();
    expect(voices[2].stop.mock.lastCall?.[0]).toBeCloseTo(10.115);
  });

  it("uses effective group gaps for V1 piano without moving attacks or changing V2 fallback", async () => {
    const notes = [
      { key: "Key0", time: 0 }, { key: "Key1", time: 0 }, { key: "Key0", time: 80 },
      { key: "Key2", time: 380 }, { key: "Key3", time: 1180 }, { key: "Key4", time: 3780 },
      { key: "Key5", time: Number.NaN },
    ];
    const policy = createPreviewV1Articulation(notes);
    const timing = { playbackSpeed: 1, noteIntervalDelayMs: 0 };
    const holds = [0, 80, 380, 1180, 3780].map(time => Math.round(policy(time, timing).piano.holdMs));
    expect(holds).toEqual([66, 246, 656, 780, 780]);
    const faster = { playbackSpeed: 2, noteIntervalDelayMs: -50 };
    expect(policy(0, faster).piano.holdMs).toBe(45);
    expect(policy(0, { ...timing, noteIntervalDelayMs: 100 }).piano.holdMs).toBeCloseTo(147.6);
    expect(createPreviewV1Articulation([])(0, timing).piano.holdMs).toBeCloseTo(344.4);

    const { context, voices } = mockAudio();
    const audio = createPreviewInstrumentAudio();
    await audio.prepare();
    const articulation = policy(0, timing);
    audio.playGroup(notes.slice(0, 2), 1, articulation);
    expect(voices.map(voice => voice.start.mock.lastCall)).toEqual([[10], [10]]);
    context.currentTime = 10.08;
    audio.playGroup([notes[2]], 1, policy(80, timing));
    expect(voices[0].stop).toHaveBeenLastCalledWith(10.08 + 0.045);
    expect(voices[1].stop).toHaveBeenCalledTimes(1);
    expect(voices[2].start).toHaveBeenCalledWith(10.08);
    audio.stop();
    context.currentTime = 11;
    audio.playGroup([notes[0]], 1);
    expect(voices[3].stop.mock.lastCall?.[0]).toBeCloseTo(11.38);
  });

  it("uses adaptive V1 guitar holds and leaves V2 guitar durations intact", async () => {
    const { voices, gains } = mockAudio();
    const audio = createPreviewInstrumentAudio();
    audio.selectInstrument("guitar");
    await audio.prepare();
    const chord = [{ key: "Key0", time: 0 }, { key: "Key1", time: 0 }];
    const policy = createPreviewV1Articulation([...chord, { key: "Key0", time: 600 }]);
    audio.playGroup(chord, 2, policy(0, { playbackSpeed: 2, noteIntervalDelayMs: 100 }));
    expect(voices.map(voice => voice.start.mock.lastCall)).toEqual([[10], [10]]);
    expect(gains[1].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.3);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.3 + 0.18 + 400 / 2400);
    audio.playGroup([{ ...chord[0], duration: 800 }], 2);
    expect(voices[2].stop.mock.lastCall?.[0]).toBeCloseTo(10.64);
  });

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
    expect(gains[1].gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.0008, 5);
    expect(gains[1].gain.exponentialRampToValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.315);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.32);
    expect(gains[2].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.5);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.68);

    context.currentTime = 10.1;
    piano.playGroup([{ key: "Key0", time: 200 }], 2);
    expect(voices[2].start).toHaveBeenCalledWith(10.1);
    expect(voices[0].stop.mock.lastCall?.[0]).toBeCloseTo(10.145);
    expect(voices[1].stop).toHaveBeenCalledTimes(1);

    context.currentTime = 10.2;
    piano.updateSpeed(1);
    expect(gains[2].gain.cancelScheduledValues).toHaveBeenCalledWith(10.5);
    expect(gains[2].gain.setValueAtTime.mock.lastCall?.[1]).toBeCloseTo(10.8);
    expect(voices[1].stop.mock.lastCall?.[0]).toBeCloseTo(10.98);
    piano.stop();
    expect(gains[2].gain.cancelAndHoldAtTime).toHaveBeenCalledWith(10.2);
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
    const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
    const notes = pitches.map((_, index) => ({
      key: `Key${index}`, time: 0, duration: 6000,
    }));
    audio.playGroup(notes, 2);
    expect(fetchSample.mock.calls.flat()).toEqual(
      pitches.map(pitch => `/audio/iowa-violin/${pitch}.wav`),
    );
    expect(voices.map(({ buffer }) => String(buffer))).toEqual(pitches.map(pitch => `${pitch}.wav`));
    expect(voices.every(({ loop, playbackRate }) => !loop && playbackRate.value === 1)).toBe(true);
    expect(voices[0].stop).toHaveBeenCalledWith(13.28);

    audio.selectInstrument("guitar");
    expect(voices[0].stop).toHaveBeenLastCalledWith(10.015);
    audio.playGroup(notes, 1);
    expect(voices).toHaveLength(15);
    await audio.prepare();
    context.currentTime = 11;
    audio.playGroup(notes, 1);
    const guitarVoices = voices.slice(15);
    expect(guitarVoices.map(({ buffer }) => String(buffer))).toEqual([
      "C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5",
    ].map(name => `${name}.wav`));
    expect(guitarVoices.every(({ loop, playbackRate }) => !loop && playbackRate.value === 1)).toBe(true);
    audio.selectInstrument("violin");
    await audio.prepare();
    expect(fetchSample).toHaveBeenCalledTimes(30);
  });

  it("ramps the shared gain for active voices and restores volume after mute and bank changes", async () => {
    const { gains, voices } = mockAudio();
    const audio = createPreviewInstrumentAudio();
    audio.setVolume(38, false);
    await audio.prepare();
    audio.playGroup([{ key: "Key0", time: 0, duration: 1000 }], 1);
    const master = gains[0];
    expect(master.gain).toHaveProperty("value", 0.38 * 1.6);
    expect(gains[1].connect).toHaveBeenCalledWith(master);
    audio.setVolume(38, true);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 10.015);
    expect(voices[0].stop).toHaveBeenCalledTimes(1);
    audio.setVolume(38, false);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.38 * 1.6, 10.015);
    audio.setVolume(0, false);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 10.015);
    audio.setVolume(38, false);
    audio.selectInstrument("guitar");
    await audio.prepare();
    audio.playGroup([{ key: "Key0", time: 0 }], 1);
    expect(gains[2].connect).toHaveBeenCalledWith(master);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.38 * 1.6, 10.015);
  });
});
