import type { Note } from "../types/score";
import { groupNotesByFiniteSourceTime, type ScoreTimingOptions } from "./scoreTiming";

export type PreviewV1Articulation = Record<"piano" | "guitar", {
  holdMs: number;
  releaseSeconds: number;
}>;

export function createPreviewV1Articulation(notes: Note[]) {
  const groups = groupNotesByFiniteSourceTime(notes);
  const intervals = new Map(groups.map(({ sourceTimeMs }, index) => [
    sourceTimeMs,
    {
      before: index > 0 ? sourceTimeMs - groups[index - 1].sourceTimeMs : undefined,
      after: index + 1 < groups.length ? groups[index + 1].sourceTimeMs - sourceTimeMs : undefined,
    },
  ]));

  return (sourceTimeMs: number, { playbackSpeed, noteIntervalDelayMs }: ScoreTimingOptions): PreviewV1Articulation => {
    const neighbors = intervals.get(sourceTimeMs);
    const interval = neighbors?.after ?? neighbors?.before;
    const gap = interval === undefined ? 420 : Math.max(0, interval / playbackSpeed + noteIntervalDelayMs);
    return {
      piano: {
        holdMs: Math.min(780, Math.max(45, gap * 0.82)),
        releaseSeconds: Math.min(0.65, 0.16 + gap / 2200),
      },
      guitar: {
        holdMs: Math.min(540, Math.max(40, gap * 0.75)),
        releaseSeconds: Math.min(0.48, 0.18 + gap / 2400),
      },
    };
  };
}
