import { getPreviewKeyName } from "../types/keyMapping";
import type { Note, Song } from "../types/score";
import {
  MIN_V2_NOTE_DURATION_MS,
  V1_TO_V2_RETRIGGER_SAFETY_MS,
} from "./v1ToV2Conversion";

export type SustainMelodyStyle = "melody" | "smooth" | "minimal";

export const SUSTAIN_MELODY_STYLES = [
  "melody",
  "smooth",
  "minimal",
] as const satisfies readonly SustainMelodyStyle[];

/**
 * All selection and sustain weights live here so a visible style maps to one
 * stable, inspectable algorithm configuration.
 */
export const SUSTAIN_MELODY_STYLE_CONFIG = {
  melody: {
    minimumSelectedGapMs: 140,
    baseReward: 26,
    pitchWeight: 20,
    topNoteBonus: 30,
    prominenceWeight: 20,
    polyphonyPenalty: 4,
    nearbyRepeatPenalty: 12,
    denseOnsetPenalty: 8,
    transitionReward: 12,
    pitchJumpPenaltyPerStep: 2.2,
    rapidSameKeyPenalty: 14,
    phraseBreakMs: 1000,
    restartPenalty: 4,
    minimumSustainGapMs: 250,
    releaseLeadMs: 30,
    restGapThresholdMs: 1400,
    maxDurationMs: 1200,
    finalGroupDurationMs: 500,
  },
  smooth: {
    minimumSelectedGapMs: 220,
    baseReward: 24,
    pitchWeight: 14,
    topNoteBonus: 18,
    prominenceWeight: 12,
    polyphonyPenalty: 5,
    nearbyRepeatPenalty: 14,
    denseOnsetPenalty: 10,
    transitionReward: 12,
    pitchJumpPenaltyPerStep: 5,
    rapidSameKeyPenalty: 16,
    phraseBreakMs: 900,
    restartPenalty: 3,
    minimumSustainGapMs: 220,
    releaseLeadMs: 25,
    restGapThresholdMs: 1600,
    maxDurationMs: 1400,
    finalGroupDurationMs: 600,
  },
  minimal: {
    minimumSelectedGapMs: 420,
    baseReward: 18,
    pitchWeight: 16,
    topNoteBonus: 22,
    prominenceWeight: 16,
    polyphonyPenalty: 8,
    nearbyRepeatPenalty: 22,
    denseOnsetPenalty: 18,
    transitionReward: 8,
    pitchJumpPenaltyPerStep: 3.5,
    rapidSameKeyPenalty: 24,
    phraseBreakMs: 800,
    restartPenalty: 1,
    minimumSustainGapMs: 400,
    releaseLeadMs: 40,
    restGapThresholdMs: 1200,
    maxDurationMs: 1000,
    finalGroupDurationMs: 400,
  },
} as const;

export type SustainMelodySourceAnalysis = {
  typicalGapMs: number | null;
  multiNoteGroupRatio: number;
  denseGapRatio: number;
  recommendedStyle: SustainMelodyStyle;
};

export type SustainMelodyGenerationStats = {
  originalNoteCount: number;
  selectedMelodyNoteCount: number;
  removedNoteCount: number;
  removedPercent: number;
  generatedSustainCount: number;
};

export type SustainMelodyGenerationPlan = {
  analysis: SustainMelodySourceAnalysis;
  generatedSong: Song;
  selectedStyle: SustainMelodyStyle;
  stats: SustainMelodyGenerationStats;
};

export type SustainMelodyGenerationOptions = {
  name: string;
  style: SustainMelodyStyle;
};

export type MelodyCandidate = {
  groupIndex: number;
  sourceNoteIndex: number;
  time: number;
  normalizedKey: string;
  pitchIndex: number;
  groupSize: number;
  isHighestInGroup: boolean;
  groupMedianPitch: number;
  previousGroupGapMs: number | null;
  nextGroupGapMs: number | null;
  nearbySameKeyCount: number;
};

export class SustainMelodyGenerationError extends Error {
  constructor(
    public readonly code:
      | "already-v2"
      | "empty-name"
      | "no-supported-keys"
      | "empty-generated-melody",
  ) {
    super(code);
    this.name = "SustainMelodyGenerationError";
  }
}

type SourceGroup = {
  time: number;
  noteIndexes: number[];
  uniqueNormalizedKeys: string[];
};

type CandidateWithScore = MelodyCandidate & {
  localScore: number;
  rawKey: string;
};

type PathState = {
  eventCount: number;
  predecessorIndex: number | null;
  score: number;
};

const NEARBY_REPEAT_WINDOW_MS = 600;
const MAX_DETAILED_TRANSITION_LOOKBACK_MS = 5000;
const SCORE_TIE_EPSILON = 1e-9;

export function analyzeSustainMelodySource(
  sourceSong: Song,
): SustainMelodySourceAnalysis {
  const groups = buildSourceGroups(sourceSong);
  const positiveGaps = groups
    .slice(1)
    .map((group, index) => group.time - (groups[index]?.time ?? group.time))
    .filter((gapMs) => gapMs > 0)
    .sort((left, right) => left - right);
  const typicalGapMs = getMedian(positiveGaps);
  const multiNoteGroupRatio =
    groups.length === 0
      ? 0
      : groups.filter((group) => group.uniqueNormalizedKeys.length > 1)
          .length / groups.length;
  const denseGapRatio =
    positiveGaps.length === 0
      ? 0
      : positiveGaps.filter((gapMs) => gapMs <= 250).length /
        positiveGaps.length;
  const recommendedStyle =
    (typicalGapMs !== null && typicalGapMs <= 250) ||
    multiNoteGroupRatio >= 0.35 ||
    denseGapRatio >= 0.5
      ? "minimal"
      : (typicalGapMs !== null && typicalGapMs <= 400) ||
          multiNoteGroupRatio >= 0.15 ||
          denseGapRatio >= 0.25
        ? "smooth"
        : "melody";

  return {
    typicalGapMs,
    multiNoteGroupRatio,
    denseGapRatio,
    recommendedStyle,
  };
}

export function hasSupportedSustainMelodyKeys(sourceSong: Song) {
  return sourceSong.songNotes.some(
    (note) =>
      Number.isFinite(note.time) &&
      getSupportedPitchIndex(getPreviewKeyName(note.key)) !== null,
  );
}

export function buildSustainMelodyGenerationPlan(
  sourceSong: Song,
  options: SustainMelodyGenerationOptions,
): SustainMelodyGenerationPlan {
  if (sourceSong.formatVersion === 2) {
    throw new SustainMelodyGenerationError("already-v2");
  }

  if (options.name.trim().length === 0) {
    throw new SustainMelodyGenerationError("empty-name");
  }

  const groups = buildSourceGroups(sourceSong);
  const candidates = buildCandidates(sourceSong, groups, options.style);

  if (candidates.length === 0) {
    throw new SustainMelodyGenerationError("no-supported-keys");
  }

  const selectedCandidates = selectMelodyPath(candidates, options.style);

  if (selectedCandidates.length === 0) {
    throw new SustainMelodyGenerationError("empty-generated-melody");
  }

  const generatedSong = buildGeneratedSong(
    sourceSong,
    selectedCandidates,
    options,
  );
  const originalNoteCount = sourceSong.songNotes.length;
  const selectedMelodyNoteCount = generatedSong.songNotes.length;
  const removedNoteCount = originalNoteCount - selectedMelodyNoteCount;
  const stats: SustainMelodyGenerationStats = {
    originalNoteCount,
    selectedMelodyNoteCount,
    removedNoteCount,
    removedPercent:
      originalNoteCount === 0
        ? 0
        : Math.round((removedNoteCount / originalNoteCount) * 1000) / 10,
    generatedSustainCount: generatedSong.songNotes.filter(
      (note) => note.duration !== undefined,
    ).length,
  };

  return {
    analysis: analyzeSustainMelodySource(sourceSong),
    generatedSong,
    selectedStyle: options.style,
    stats,
  };
}

function buildSourceGroups(sourceSong: Song): SourceGroup[] {
  const noteIndexesByTime = new Map<number, number[]>();

  sourceSong.songNotes.forEach((note, noteIndex) => {
    if (!Number.isFinite(note.time)) {
      return;
    }

    const noteIndexes = noteIndexesByTime.get(note.time) ?? [];
    noteIndexes.push(noteIndex);
    noteIndexesByTime.set(note.time, noteIndexes);
  });

  return Array.from(noteIndexesByTime, ([time, noteIndexes]) => ({
    time,
    noteIndexes,
    uniqueNormalizedKeys: Array.from(
      new Set(
        noteIndexes.map((noteIndex) =>
          getPreviewKeyName(sourceSong.songNotes[noteIndex]?.key ?? ""),
        ),
      ),
    ),
  })).sort((left, right) => left.time - right.time);
}

function buildCandidates(
  sourceSong: Song,
  groups: readonly SourceGroup[],
  style: SustainMelodyStyle,
): CandidateWithScore[] {
  const config = SUSTAIN_MELODY_STYLE_CONFIG[style];
  const occurrencesByKey = new Map<string, number[]>();

  groups.forEach((group) => {
    group.uniqueNormalizedKeys.forEach((normalizedKey) => {
      if (getSupportedPitchIndex(normalizedKey) === null) {
        return;
      }
      const times = occurrencesByKey.get(normalizedKey) ?? [];
      times.push(group.time);
      occurrencesByKey.set(normalizedKey, times);
    });
  });

  return groups.flatMap((group, groupIndex) => {
    const representatives = new Map<
      string,
      { pitchIndex: number; sourceNoteIndex: number; rawKey: string }
    >();

    group.noteIndexes.forEach((sourceNoteIndex) => {
      const rawKey = sourceSong.songNotes[sourceNoteIndex]?.key ?? "";
      const normalizedKey = getPreviewKeyName(rawKey);
      const pitchIndex = getSupportedPitchIndex(normalizedKey);

      if (pitchIndex === null || representatives.has(normalizedKey)) {
        return;
      }

      representatives.set(normalizedKey, {
        pitchIndex,
        sourceNoteIndex,
        rawKey,
      });
    });

    const supported = Array.from(representatives, ([normalizedKey, value]) => ({
      normalizedKey,
      ...value,
    }));
    const sortedPitches = supported
      .map((candidate) => candidate.pitchIndex)
      .sort((left, right) => left - right);
    const groupMedianPitch = getMedian(sortedPitches) ?? 0;
    const highestPitch = sortedPitches[sortedPitches.length - 1] ?? 0;
    const previousGroup = groups[groupIndex - 1];
    const nextGroup = groups[groupIndex + 1];

    return supported.map((candidate) => {
      const nearbySameKeyCount = (
        occurrencesByKey.get(candidate.normalizedKey) ?? []
      ).filter(
        (time) =>
          time !== group.time &&
          Math.abs(time - group.time) <= NEARBY_REPEAT_WINDOW_MS,
      ).length;
      const melodyCandidate: MelodyCandidate = {
        groupIndex,
        sourceNoteIndex: candidate.sourceNoteIndex,
        time: group.time,
        normalizedKey: candidate.normalizedKey,
        pitchIndex: candidate.pitchIndex,
        groupSize: supported.length,
        isHighestInGroup: candidate.pitchIndex === highestPitch,
        groupMedianPitch,
        previousGroupGapMs: previousGroup
          ? group.time - previousGroup.time
          : null,
        nextGroupGapMs: nextGroup ? nextGroup.time - group.time : null,
        nearbySameKeyCount,
      };

      return {
        ...melodyCandidate,
        localScore: getCandidateLocalScore(melodyCandidate, config),
        rawKey: candidate.rawKey,
      };
    });
  });
}

function getCandidateLocalScore(
  candidate: MelodyCandidate,
  config: (typeof SUSTAIN_MELODY_STYLE_CONFIG)[SustainMelodyStyle],
) {
  const normalizedPitch = candidate.pitchIndex / 14;
  const prominence =
    (candidate.pitchIndex - candidate.groupMedianPitch) / 14;
  const closestAdjacentGap = Math.min(
    candidate.previousGroupGapMs ?? Number.POSITIVE_INFINITY,
    candidate.nextGroupGapMs ?? Number.POSITIVE_INFINITY,
  );

  return (
    config.baseReward +
    normalizedPitch * config.pitchWeight +
    (candidate.isHighestInGroup ? config.topNoteBonus : 0) +
    prominence * config.prominenceWeight -
    Math.max(0, candidate.groupSize - 1) * config.polyphonyPenalty -
    Math.max(0, candidate.nearbySameKeyCount - 1) *
      config.nearbyRepeatPenalty -
    (closestAdjacentGap < config.minimumSelectedGapMs
      ? config.denseOnsetPenalty
      : 0)
  );
}

function selectMelodyPath(
  candidates: readonly CandidateWithScore[],
  style: SustainMelodyStyle,
): CandidateWithScore[] {
  const config = SUSTAIN_MELODY_STYLE_CONFIG[style];
  const states: PathState[] = candidates.map((candidate) => ({
    eventCount: 1,
    predecessorIndex: null,
    score: candidate.localScore,
  }));
  let firstDetailedCandidateIndex = 0;
  let bestOlderIndex: number | null = null;

  candidates.forEach((next, nextIndex) => {
    let best = states[nextIndex] as PathState;

    while (
      firstDetailedCandidateIndex < nextIndex &&
      next.time -
        (candidates[firstDetailedCandidateIndex]?.time ?? next.time) >
        MAX_DETAILED_TRANSITION_LOOKBACK_MS
    ) {
      const olderIndex = firstDetailedCandidateIndex;
      const olderCandidate = candidates[olderIndex] as CandidateWithScore;
      const olderState = states[olderIndex] as PathState;

      if (
        bestOlderIndex === null ||
        isPathStateBetter(
          olderState,
          olderCandidate,
          states[bestOlderIndex] as PathState,
          candidates[bestOlderIndex] as CandidateWithScore,
        )
      ) {
        bestOlderIndex = olderIndex;
      }

      firstDetailedCandidateIndex += 1;
    }

    for (
      let previousIndex = firstDetailedCandidateIndex;
      previousIndex < nextIndex;
      previousIndex += 1
    ) {
      const previous = candidates[previousIndex];
      const previousState = states[previousIndex];

      if (!previous || !previousState || previous.time >= next.time) {
        continue;
      }

      const gapMs = next.time - previous.time;

      if (gapMs < config.minimumSelectedGapMs) {
        continue;
      }

      const pitchJump = Math.abs(next.pitchIndex - previous.pitchIndex);
      const phraseJumpScale = gapMs >= config.phraseBreakMs ? 0.25 : 1;
      const transitionScore =
        config.transitionReward -
        pitchJump *
          config.pitchJumpPenaltyPerStep *
          phraseJumpScale -
        (next.normalizedKey === previous.normalizedKey && gapMs < 600
          ? config.rapidSameKeyPenalty
          : 0);
      const candidateState: PathState = {
        eventCount: previousState.eventCount + 1,
        predecessorIndex: previousIndex,
        score:
          previousState.score +
          transitionScore +
          next.localScore -
          (gapMs >= config.phraseBreakMs ? config.restartPenalty : 0),
      };

      if (isPathStateBetter(candidateState, next, best, next)) {
        best = candidateState;
      }
    }

    if (bestOlderIndex !== null) {
      const olderState = states[bestOlderIndex] as PathState;
      const phraseState: PathState = {
        eventCount: olderState.eventCount + 1,
        predecessorIndex: bestOlderIndex,
        score: olderState.score + next.localScore - config.restartPenalty,
      };

      if (isPathStateBetter(phraseState, next, best, next)) {
        best = phraseState;
      }
    }

    states[nextIndex] = best;
  });

  let bestFinalIndex = 0;

  for (let index = 1; index < candidates.length; index += 1) {
    if (
      isPathStateBetter(
        states[index] as PathState,
        candidates[index] as CandidateWithScore,
        states[bestFinalIndex] as PathState,
        candidates[bestFinalIndex] as CandidateWithScore,
      )
    ) {
      bestFinalIndex = index;
    }
  }

  if ((states[bestFinalIndex]?.score ?? 0) <= 0) {
    bestFinalIndex = candidates.reduce((bestIndex, candidate, index) => {
      const bestCandidate = candidates[bestIndex] as CandidateWithScore;
      return isCandidateScoreBetter(candidate, bestCandidate)
        ? index
        : bestIndex;
    }, 0);
    return [candidates[bestFinalIndex] as CandidateWithScore];
  }

  const selected: CandidateWithScore[] = [];
  let currentIndex: number | null = bestFinalIndex;

  while (currentIndex !== null) {
    selected.push(candidates[currentIndex] as CandidateWithScore);
    currentIndex = states[currentIndex]?.predecessorIndex ?? null;
  }

  return selected.reverse();
}

function isPathStateBetter(
  candidateState: PathState,
  candidateEnd: CandidateWithScore,
  currentState: PathState,
  currentEnd: CandidateWithScore,
) {
  const scoreDifference = candidateState.score - currentState.score;

  if (Math.abs(scoreDifference) > SCORE_TIE_EPSILON) {
    return scoreDifference > 0;
  }

  if (candidateState.eventCount !== currentState.eventCount) {
    return candidateState.eventCount < currentState.eventCount;
  }

  if (candidateEnd.sourceNoteIndex !== currentEnd.sourceNoteIndex) {
    return candidateEnd.sourceNoteIndex < currentEnd.sourceNoteIndex;
  }

  return candidateEnd.pitchIndex < currentEnd.pitchIndex;
}

function isCandidateScoreBetter(
  candidate: CandidateWithScore,
  current: CandidateWithScore,
) {
  const scoreDifference = candidate.localScore - current.localScore;
  return Math.abs(scoreDifference) > SCORE_TIE_EPSILON
    ? scoreDifference > 0
    : candidate.sourceNoteIndex !== current.sourceNoteIndex
      ? candidate.sourceNoteIndex < current.sourceNoteIndex
      : candidate.pitchIndex < current.pitchIndex;
}

function buildGeneratedSong(
  sourceSong: Song,
  selected: readonly CandidateWithScore[],
  options: SustainMelodyGenerationOptions,
): Song {
  const config = SUSTAIN_MELODY_STYLE_CONFIG[options.style];
  const timesByNormalizedKey = new Map<string, number[]>();

  selected.forEach((candidate) => {
    const times = timesByNormalizedKey.get(candidate.normalizedKey) ?? [];
    times.push(candidate.time);
    timesByNormalizedKey.set(candidate.normalizedKey, times);
  });

  const songNotes: Note[] = selected.map((candidate, index) => {
    const next = selected[index + 1];
    let duration: number | undefined;

    if (next === undefined) {
      duration = Math.min(
        Math.round(config.finalGroupDurationMs),
        config.maxDurationMs,
      );
    } else {
      const gapMs = next.time - candidate.time;

      if (
        gapMs >= config.minimumSustainGapMs &&
        gapMs <= config.restGapThresholdMs
      ) {
        duration = Math.min(
          gapMs - config.releaseLeadMs,
          config.maxDurationMs,
        );
        const nextSameKeyTime = (
          timesByNormalizedKey.get(candidate.normalizedKey) ?? []
        ).find((time) => time > candidate.time);

        if (nextSameKeyTime !== undefined) {
          duration = Math.min(
            duration,
            nextSameKeyTime -
              candidate.time -
              V1_TO_V2_RETRIGGER_SAFETY_MS,
          );
        }

        if (duration < MIN_V2_NOTE_DURATION_MS) {
          duration = undefined;
        }
      }
    }

    return duration === undefined
      ? { time: candidate.time, key: candidate.rawKey }
      : {
          time: candidate.time,
          key: candidate.rawKey,
          duration: Math.round(duration),
        };
  });

  return {
    formatVersion: 2,
    name: options.name.trim(),
    bpm: sourceSong.bpm,
    bitsPerPage: sourceSong.bitsPerPage,
    pitchLevel: sourceSong.pitchLevel,
    isComposed: sourceSong.isComposed,
    songNotes,
  };
}

function getSupportedPitchIndex(normalizedKey: string) {
  const match = /^Key(\d+)$/.exec(normalizedKey);

  if (!match) {
    return null;
  }

  const pitchIndex = Number(match[1]);
  return Number.isInteger(pitchIndex) && pitchIndex >= 0 && pitchIndex <= 14
    ? pitchIndex
    : null;
}

function getMedian(sortedValues: readonly number[]) {
  if (sortedValues.length === 0) {
    return null;
  }

  const middleIndex = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 1
    ? (sortedValues[middleIndex] ?? null)
    : ((sortedValues[middleIndex - 1] ?? 0) +
        (sortedValues[middleIndex] ?? 0)) /
        2;
}
