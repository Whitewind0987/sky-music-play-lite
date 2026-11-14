import { skyKeyNames } from "../types/keyMapping";

export const customSamplePitches = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
export type CustomArticulation = "naturalDecay" | "sustained";
export type CustomInstrument = {
  id: string;
  name: string;
  articulation: CustomArticulation;
  releaseSeconds: number;
  createdAt: number;
  disabled?: boolean;
  samples: { name: string; size: number }[];
};
export const customMaxFile = 8 * 1024 * 1024;
export const customMaxTotal = 48 * 1024 * 1024;
export const customAudioExtension = /\.(mp3|wav)$/i;

export const customInstrumentNamingPrompt = `请将我提供的本地音频采样整理成可直接拖入 SkyMusicPlay Lite「管理自定义音源」的文件夹。

1. 保留原文件，在新的输出文件夹中生成采样副本。使用可正常解码的 MP3 或 WAV，每个文件非空且不超过 8 MiB、60 秒和 2 声道，15 个文件合计不超过 48 MiB。优先保留原格式；如需转码，不要改变音高、速度或响度。
2. 按实际音高或我提供的明确映射，将 15 个文件命名为 Key0 到 Key14，保留 .mp3 或 .wav 扩展名。编号 0–14 依次对应 ${customSamplePitches.join("、")}。若来源明确采用同一顺序的 0–14 编号，可直接加 Key 前缀。不要按文件名排序猜测音高；遇到缺失、冲突或无法确认的映射，请先指出。
3. 确认每个键恰好一个文件，15 个文件均位于输出文件夹顶层。最后给出可直接导入的文件夹完整路径。`;

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
