import { getPreviewKeyName, skyKeyNames } from "../types/keyMapping";
import type { Note } from "../types/score";
import { isValidExplicitDuration } from "./scoreTiming";
import type { PreviewV1Articulation } from "./previewV1Articulation";
import { defaultPreviewVolume } from "./previewAudioPreferences";
import { previewInstrumentSamples, type PreviewInstrument } from "./previewInstrumentSamples";
import type { CustomInstrument } from "./customInstruments";
import { readCustomInstrumentSample } from "./tauriApi";

const keyIndices = new Map<string, number>(skyKeyNames.map((key, index) => [key, index]));
const retriggerFadeSeconds = 0.045;
const cleanupFadeSeconds = 0.015;
const maxVoices = 32;
// At full volume, a 15-note chord has headroom even at aligned sample peaks.
const maxMasterGain = 1.6;
const customNotes = skyKeyNames.map((_, index) => ({ file: String(index), rate: 1 }));

type Voice = {
  key: string;
  hasExplicitDuration: boolean;
  source: AudioBufferSourceNode;
  gain: GainNode;
  peakGain: number;
  releaseSeconds: number;
  releaseAt: number;
  stopAt: number;
  speed: number;
};

export function createPreviewInstrumentAudio() {
  let selected: PreviewInstrument | CustomInstrument = "piano";
  let customBank = new Map<string, AudioBuffer>();
  let customRequest: Promise<void> | undefined;
  let audition: Voice | undefined;
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let masterLevel = defaultPreviewVolume / 100 * maxMasterGain;
  const loading = new Map<PreviewInstrument, Promise<void>>();
  const banks = new Map<PreviewInstrument, Map<string, AudioBuffer>>();
  const voices = new Set<Voice>();

  function openAudio() {
    const audio = context ??= new AudioContext();
    if (!master) {
      master = audio.createGain();
      master.gain.value = masterLevel;
      master.connect(audio.destination);
    }
    if (audio.state !== "running") void audio.resume().catch(() => {});
    return audio;
  }

  async function prepare() {
    try {
      const audio = openAudio();
      const instrument = selected;
      if (typeof instrument !== "string") {
        customRequest ??= (async () => {
          const buffers = new Map<string, AudioBuffer>();
          for (const index of skyKeyNames.keys()) {
            if (selected !== instrument || context !== audio) return;
            const bytes = await readCustomInstrumentSample(instrument.id, index);
            buffers.set(String(index), await audio.decodeAudioData(bytes));
          }
          if (selected === instrument && context === audio) customBank = buffers;
        })().catch(() => {
          if (selected === instrument && context === audio) customRequest = undefined;
        });
        await customRequest;
        return;
      }
      if (!loading.has(instrument)) {
        const { directory, notes } = previewInstrumentSamples[instrument];
        const files = new Set(notes.map(({ file }) => file));
        const request = Promise.all(Array.from(files, async file => {
          const response = await fetch(`${import.meta.env.BASE_URL}audio/${directory}/${file}`);
          if (!response.ok) throw new Error(`Could not load preview sample ${file}`);
          return [file, await audio.decodeAudioData(await response.arrayBuffer())] as const;
        })).then(decoded => {
          if (context === audio) banks.set(instrument, new Map(decoded));
        }).catch(() => {
          if (context === audio) loading.delete(instrument);
        });
        loading.set(instrument, request);
      }
      await loading.get(instrument);
    } catch {
      // The preview scheduler can continue silently if audio is unavailable.
    }
  }

  function scheduleRelease(voice: Voice) {
    voice.stopAt = voice.releaseAt + voice.releaseSeconds;
    voice.gain.gain.setValueAtTime(voice.peakGain, voice.releaseAt);
    voice.gain.gain.exponentialRampToValueAtTime(voice.peakGain * 0.01, voice.stopAt - 0.005);
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

  function playGroup(notes: Note[], speed: number, v1Articulation?: PreviewV1Articulation) {
    const audio = context;
    const custom = typeof selected === "string" ? undefined : selected;
    const buffers = typeof selected === "string" ? banks.get(selected) : customBank;
    if (audio?.state !== "running" || !buffers || !master) return;
    const instrument = typeof selected === "string" ? previewInstrumentSamples[selected] : {
      notes: customNotes,
      gain: 0.016, attackSeconds: 0.0008, implicitHoldMs: 150,
      implicitReleaseSeconds: selected.releaseSeconds, explicitReleaseSeconds: selected.releaseSeconds,
    };
    const adaptive = custom ? v1Articulation?.[custom.articulation === "naturalDecay" ? "piano" : "guitar"]
      : selected === "piano" || selected === "guitar" ? v1Articulation?.[selected] : undefined;

    const durations = new Map<string, number>();
    for (const note of notes) {
      const key = getPreviewKeyName(note.key);
      const duration = !adaptive && isValidExplicitDuration(note.duration) ? note.duration : 0;
      durations.set(key, Math.max(durations.get(key) ?? 0, duration));
    }

    const now = audio.currentTime;
    for (const [key, duration] of durations) {
      const index = keyIndices.get(key);
      if (index === undefined) continue;
      const sample = instrument.notes[index];
      const buffer = buffers.get(sample.file);
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
      source.playbackRate.value = sample.rate;
      source.connect(gain);
      gain.connect(master);
      gain.gain.setValueAtTime(0, now);
      const holdSeconds = (adaptive?.holdMs ?? (duration || instrument.implicitHoldMs) / speed) / 1000;
      gain.gain.linearRampToValueAtTime(instrument.gain, now + Math.min(instrument.attackSeconds, holdSeconds));
      const voice = {
        key,
        hasExplicitDuration: duration > 0,
        source,
        gain,
        peakGain: instrument.gain,
        releaseSeconds: (custom ? custom.releaseSeconds : adaptive?.releaseSeconds) ??
          (duration > 0 ? instrument.explicitReleaseSeconds : instrument.implicitReleaseSeconds),
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
    stopAudition();
  }

  let auditionRequest = 0;
  function stopAudition() {
    auditionRequest++;
    if (audition && context) fadeVoice(audition, context.currentTime, cleanupFadeSeconds);
    audition = undefined;
  }

  async function auditionSample(file: Blob) {
    stopAudition();
    const request = auditionRequest;
    const audio = openAudio();
    const buffer = await audio.decodeAudioData(await file.arrayBuffer());
    if (request !== auditionRequest || context !== audio || !master) return;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    const now = audio.currentTime;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(master);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.004);
    const voice = { key: "", hasExplicitDuration: true, source, gain, peakGain: 0.3,
      releaseSeconds: 0.22, releaseAt: now + buffer.duration, stopAt: now + buffer.duration, speed: 1 };
    audition = voice;
    source.onended = () => {
      if (audition === voice) audition = undefined;
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
  }

  function dispose() {
    stop();
    master?.disconnect();
    master = undefined;
    void context?.close().catch(() => {});
    context = undefined;
    loading.clear();
    banks.clear();
    customBank.clear();
    customRequest = undefined;
  }

  function setVolume(volume: number, muted: boolean) {
    masterLevel = muted ? 0 : volume / 100 * maxMasterGain;
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.cancelAndHoldAtTime(now);
    master.gain.linearRampToValueAtTime(masterLevel, now + 0.015);
  }

  function selectInstrument(instrument: PreviewInstrument | CustomInstrument) {
    if (selected === instrument || (typeof selected !== "string" &&
      typeof instrument !== "string" && selected.id === instrument.id)) return;
    stop();
    selected = instrument;
    customBank.clear();
    customRequest = undefined;
  }

  return { prepare, playGroup, selectInstrument, setVolume, updateSpeed, stop, dispose, auditionSample, stopAudition };
}
