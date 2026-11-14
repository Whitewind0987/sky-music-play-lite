import type { Note } from "../types/score";
import { groupNotesByFiniteSourceTime, type ScoreTimingOptions } from "./scoreTiming";

export function createPreviewPianoArticulation(notes: Note[]) {
  const groups = groupNotesByFiniteSourceTime(notes);
  const intervals = new Map(groups.map(({ sourceTimeMs }, index) => [
    sourceTimeMs,
    {
      before: index > 0 ? sourceTimeMs - groups[index - 1].sourceTimeMs : undefined,
      after: index + 1 < groups.length ? groups[index + 1].sourceTimeMs - sourceTimeMs : undefined,
    },
  ]));

  return (sourceTimeMs: number, { playbackSpeed, noteIntervalDelayMs }: ScoreTimingOptions) => {
    const neighbors = intervals.get(sourceTimeMs);
    const interval = neighbors?.after ?? neighbors?.before;
    const gap = interval === undefined ? 420 : Math.max(0, interval / playbackSpeed + noteIntervalDelayMs);
    return {
      holdMs: Math.min(780, Math.max(45, gap * 0.82)),
      releaseSeconds: Math.min(0.65, 0.16 + gap / 2200),
    };
  };
}
