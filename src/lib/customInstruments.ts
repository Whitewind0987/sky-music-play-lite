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

export function createCustomInstrumentSearchPrompt(instrumentName: string) {
  const name = instrumentName.trim();
  const target = name
    ? `目标乐器是「${name}」。`
    : "我还没指定乐器。请先直接问我「你想找什么乐器的音源？」等我回答后再搜索。";

  return `请帮我搜索可用于 SkyMusicPlay Lite 自定义音源的采样。${target}

优先查找录音作者或发行方提供的独立采样库，并核对具体采样的官方授权，优先选用 CC0 或公有领域录音。请列出采样来源、许可条款链接、署名要求，以及可覆盖的音高。代码仓库的许可证不能代替音频采样的授权。跳过游戏提取音频和授权不明的资源；若没有合适的采样，请说明缺少哪些音高或授权信息。

如果找到授权明确的完整采样，请从官方来源下载到临时目录，并将这些文件作为下面命名流程的输入。

${customInstrumentNamingPrompt}

第三方音源使用说明与免责声明

1. 此提示词用于辅助查找和整理音频采样。Agent 的搜索结果、来源说明和许可判断可能不准确、不完整或已过时，仅供参考，不构成法律意见。SkyMusicPlay Lite 的导入功能只校验文件格式和键位映射，不审查音频权属，也不代表项目认可或授权使用该音源。
2. 下载、导入、修改、公开播放、商用或分享前，请核对录音权利人发布的原始条款，确认条款适用于具体录音和计划用途。公开可下载、标注免费或存放在开源仓库，均不能单独证明允许修改或再分发。请核查署名、许可链接、修改标记、非商业用途、禁止演绎及相同方式共享等适用条件。
3. 请保留来源链接、授权条款和署名记录。若权属、条款或授权范围不清楚，请暂缓使用并联系权利人确认。收到权利人异议或发现授权有误时，请停止相关使用或分发，并及时处理已发布的副本。
4. 第三方音源的权利归相应权利人所有。用户应对自行选择、获取和使用的音源进行核查，并对自己的使用和分发行为负责。本说明不改变任何第三方许可条款，也不限制适用法律赋予的权利。`;
}

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
