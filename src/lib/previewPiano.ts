import { getPreviewKeyName, skyKeyNames } from "../types/keyMapping";
import type { Note } from "../types/score";
import { isValidExplicitDuration } from "./scoreTiming";

const pianoPitches = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
const samples = [
  [60, "C4"], [63, "Ds4"], [66, "Fs4"], [69, "A4"], [72, "C5"],
  [75, "Ds5"], [78, "Fs5"], [81, "A5"], [84, "C6"],
] as const;
const pianoNotes = new Map<string, { sample: string; rate: number }>();
skyKeyNames.forEach((key, index) => {
  const pitch = pianoPitches[index];
  const [samplePitch, sample] = samples.reduce((nearest, candidate) =>
    Math.abs(candidate[0] - pitch) < Math.abs(nearest[0] - pitch) ? candidate : nearest,
  );
  pianoNotes.set(key, { sample, rate: 2 ** ((pitch - samplePitch) / 12) });
});

const shortNoteMs = 180;
const releaseSeconds = 0.025;
const voiceGain = 0.12;
const maxVoices = 32;

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  releaseAt: number;
  speed: number;
};

export function createPreviewPiano() {
  let context: AudioContext | undefined;
  let loading: Promise<void> | undefined;
  const buffers = new Map<string, AudioBuffer>();
  const voices = new Set<Voice>();

  async function prepare() {
    try {
      const audio = context ??= new AudioContext();
      if (audio.state !== "running") void audio.resume().catch(() => {});
      loading ??= Promise.all(samples.map(async ([, name]) => {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/salamander/${name}.mp3`);
        if (!response.ok) throw new Error(`Could not load piano sample ${name}`);
        return [name, await audio.decodeAudioData(await response.arrayBuffer())] as const;
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
    voice.gain.gain.setValueAtTime(voiceGain, voice.releaseAt);
    voice.gain.gain.linearRampToValueAtTime(0, voice.releaseAt + releaseSeconds);
    voice.source.stop(voice.releaseAt + releaseSeconds);
  }

  function playGroup(notes: Note[], speed: number) {
    const audio = context;
    if (audio?.state !== "running" || buffers.size === 0) return;

    const durations = new Map<string, number>();
    for (const note of notes) {
      const key = getPreviewKeyName(note.key);
      const duration = isValidExplicitDuration(note.duration) ? note.duration : shortNoteMs;
      durations.set(key, Math.max(durations.get(key) ?? 0, duration));
    }

    const now = audio.currentTime;
    for (const [key, duration] of durations) {
      const pianoNote = pianoNotes.get(key);
      if (!pianoNote) continue;
      const buffer = buffers.get(pianoNote.sample);
      if (!buffer) continue;
      const oldest = voices.values().next().value;
      if (voices.size >= maxVoices && oldest) {
        voices.delete(oldest);
        oldest.source.stop(now);
      }

      const source = audio.createBufferSource();
      const gain = audio.createGain();
      source.buffer = buffer;
      source.playbackRate.value = pianoNote.rate;
      source.connect(gain);
      gain.connect(audio.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(voiceGain, now + Math.min(0.004, duration / speed / 1000));
      const voice = { source, gain, releaseAt: now + duration / speed / 1000, speed };
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
    for (const voice of voices) {
      const end = Math.min(now + releaseSeconds, voice.releaseAt + releaseSeconds);
      if (end <= now) continue;
      voice.gain.gain.cancelAndHoldAtTime(now);
      voice.gain.gain.linearRampToValueAtTime(0, end);
      voice.source.stop(end);
    }
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
