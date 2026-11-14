import { getPreviewKeyName, skyKeyNames } from "../types/keyMapping";
import type { Note } from "../types/score";
import { isValidExplicitDuration } from "./scoreTiming";

const pianoPitches = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
type SampleRegion = {
  root: number;
  low: number;
  high: number;
  name: string;
  loop?: readonly [startFrame: number, endFrame: number];
};

// Regions and inclusive loop endpoints from the 2019-07-03 Bright SFZ.
const samples: SampleRegion[] = [
  { root: 60, low: 59, high: 61, name: "C4", loop: [145927, 213379] },
  { root: 63, low: 62, high: 64, name: "Ds4", loop: [151896, 217597] },
  { root: 66, low: 65, high: 67, name: "Fs4", loop: [138527, 185330] },
  { root: 69, low: 68, high: 70, name: "A4" },
  { root: 72, low: 71, high: 73, name: "C5" },
  { root: 75, low: 74, high: 76, name: "Ds5" },
  { root: 78, low: 77, high: 79, name: "Fs5" },
  { root: 81, low: 80, high: 82, name: "A5" },
  { root: 84, low: 83, high: 85, name: "C6" },
];
const sampleRate = 44100;
const pianoNotes = new Map<string, { sample: SampleRegion; rate: number }>();
skyKeyNames.forEach((key, index) => {
  const pitch = pianoPitches[index];
  const sample = samples.find(({ low, high }) => low <= pitch && pitch <= high);
  if (sample) pianoNotes.set(key, { sample, rate: 2 ** ((pitch - sample.root) / 12) });
});

const implicitHoldMs = 120;
const implicitReleaseSeconds = 0.26;
const explicitReleaseSeconds = 0.6;
const retriggerFadeSeconds = 0.045;
const cleanupFadeSeconds = 0.015;
const attackSeconds = 0.0008;
// The Bright samples peak near full scale. Leave room for dense chords and fades.
const voiceGain = 0.025;
const maxVoices = 32;

type Voice = {
  key: string;
  hasExplicitDuration: boolean;
  source: AudioBufferSourceNode;
  gain: GainNode;
  releaseAt: number;
  stopAt: number;
  speed: number;
};

export function createPreviewPiano() {
  let context: AudioContext | undefined;
  let loading: Promise<void> | undefined;
  const buffers = new Map<number, AudioBuffer>();
  const voices = new Set<Voice>();

  async function prepare() {
    try {
      const audio = context ??= new AudioContext();
      if (audio.state !== "running") void audio.resume().catch(() => {});
      loading ??= Promise.all(samples.map(async ({ root, name }) => {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/upright-piano-kw-bright/${name}vH.wav`);
        if (!response.ok) throw new Error(`Could not load piano sample ${name}`);
        return [root, await audio.decodeAudioData(await response.arrayBuffer())] as const;
      })).then((decoded) => {
        if (context !== audio) return;
        for (const [name, buffer] of decoded) buffers.set(name, buffer);
      }).catch(() => {
        if (context === audio) loading = undefined;
      });
      await loading;
    } catch {
      // The preview scheduler can continue silently if audio is unavailable.
    }
  }

  function scheduleRelease(voice: Voice) {
    const releaseSeconds = voice.hasExplicitDuration
      ? explicitReleaseSeconds
      : implicitReleaseSeconds;
    voice.stopAt = voice.releaseAt + releaseSeconds;
    voice.gain.gain.setValueAtTime(voiceGain, voice.releaseAt);
    voice.gain.gain.exponentialRampToValueAtTime(voiceGain * 0.01, voice.stopAt - 0.005);
    voice.gain.gain.linearRampToValueAtTime(0, voice.stopAt);
    voice.source.stop(voice.stopAt);
  }

  function fadeVoice(voice: Voice, now: number, fadeSeconds: number) {
    const end = now + fadeSeconds;
    if (voice.stopAt <= end) return;
    voice.releaseAt = now;
    voice.stopAt = end;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  }

  function playGroup(notes: Note[], speed: number) {
    const audio = context;
    if (audio?.state !== "running" || buffers.size === 0) return;

    const durations = new Map<string, number>();
    for (const note of notes) {
      const key = getPreviewKeyName(note.key);
      const duration = isValidExplicitDuration(note.duration) ? note.duration : 0;
      durations.set(key, Math.max(durations.get(key) ?? 0, duration));
    }

    const now = audio.currentTime;
    for (const [key, duration] of durations) {
      const pianoNote = pianoNotes.get(key);
      if (!pianoNote) continue;
      const buffer = buffers.get(pianoNote.sample.root);
      if (!buffer) continue;
      for (const voice of voices) {
        if (voice.key === key && !voice.hasExplicitDuration) {
          fadeVoice(voice, now, retriggerFadeSeconds);
        }
      }
      const oldest = voices.values().next().value;
      if (voices.size >= maxVoices && oldest) {
        voices.delete(oldest);
        fadeVoice(oldest, now, cleanupFadeSeconds);
      }

      const source = audio.createBufferSource();
      const gain = audio.createGain();
      source.buffer = buffer;
      source.playbackRate.value = pianoNote.rate;
      const loop = pianoNote.sample.loop;
      if (loop) {
        source.loop = true;
        source.loopStart = loop[0] / sampleRate;
        source.loopEnd = (loop[1] + 1) / sampleRate;
      }
      source.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0, now);
      const holdSeconds = (duration || implicitHoldMs) / speed / 1000;
      gain.gain.linearRampToValueAtTime(voiceGain, now + Math.min(attackSeconds, holdSeconds));
      const voice = {
        key,
        hasExplicitDuration: duration > 0,
        source,
        gain,
        releaseAt: now + holdSeconds,
        stopAt: now,
        speed,
      };
      voices.add(voice);
      source.onended = () => {
        voices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(now);
      scheduleRelease(voice);
    }
  }

  function updateSpeed(speed: number) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of voices) {
      if (voice.releaseAt <= now || voice.speed === speed) continue;
      voice.gain.gain.cancelScheduledValues(voice.releaseAt);
      voice.releaseAt = now + (voice.releaseAt - now) * voice.speed / speed;
      voice.speed = speed;
      scheduleRelease(voice);
    }
  }

  function stop() {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of voices) fadeVoice(voice, now, cleanupFadeSeconds);
    voices.clear();
  }

  function dispose() {
    stop();
    void context?.close().catch(() => {});
    context = undefined;
    loading = undefined;
    buffers.clear();
  }

  return { prepare, playGroup, updateSpeed, stop, dispose };
}
