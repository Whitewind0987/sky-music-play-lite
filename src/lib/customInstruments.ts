import { skyKeyNames } from "../types/keyMapping";

export const customSamplePitches = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
export type CustomArticulation = "naturalDecay" | "sustained";
export type CustomInstrument = {
  id: string;
  name: string;
  articulation: CustomArticulation;
  releaseSeconds: number;
  createdAt: number;
  samples: { name: string; size: number }[];
};
export const customMaxFile = 8 * 1024 * 1024;
export const customMaxTotal = 48 * 1024 * 1024;
export const customAudioExtension = /\.(mp3|wav)$/i;

export function mapCustomSamples(files: readonly { name: string }[]) {
  const candidates = skyKeyNames.map(() => [] as number[]);
  files.forEach(({ name }, index) => {
    if (!customAudioExtension.test(name)) return;
    const stem = name.replace(customAudioExtension, "").toLowerCase();
    const key = skyKeyNames.findIndex((value, i) =>
      value.toLowerCase() === stem || customSamplePitches[i].toLowerCase() === stem,
    );
    if (key !== -1) candidates[key].push(index);
  });
  return {
    assignments: candidates.map(matches => matches.length === 1 ? matches[0] : null),
    conflicts: candidates.map(matches => matches.length > 1),
  };
}

export function resolveCustomSamples<T>(files: readonly T[], assignments: readonly (number | null)[]) {
  if (assignments.length !== skyKeyNames.length) return null;
  const mapped = assignments.map(index => index === null ? undefined : files[index]);
  return mapped.every(file => file !== undefined) ? mapped as T[] : null;
}

export function hasCustomAudioSignature(name: string, data: ArrayBuffer) {
  const b = new Uint8Array(data);
  return /\.wav$/i.test(name)
    ? b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.subarray(8, 12)) === "WAVE"
    : /\.mp3$/i.test(name) && ((b[0] === 73 && b[1] === 68 && b[2] === 51) ||
      (b.length >= 2 && b[0] === 255 && (b[1] & 224) === 224));
}
