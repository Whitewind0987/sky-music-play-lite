import type { SkyKeyName } from "./keyMapping";

export type ScoreVisualNote = {
  skyKey: SkyKeyName;
  sourceKey: string;
  sourceTimeMs: number;
  adjustedStartMs: number;
  visualEndMs: number;
  explicitDurationMs: number | null;
};

export type ScoreVisualGroup = {
  notes: readonly ScoreVisualNote[];
  skyKeys: readonly SkyKeyName[];
  sourceStartMs: number;
  sourceEndMs: number;
  adjustedStartMs: number;
  adjustedLastStartMs: number;
  visualEndMs: number;
};

export type ScoreVisualizationModel = {
  groups: readonly ScoreVisualGroup[];
  totalMs: number;
  finishMs: number;
};

export type ScoreVisualizationOptions = {
  visualChordWindowMs?: number;
};

export type ScoreVisualRenderWindow = {
  startIndex: number;
  endIndexExclusive: number;
  groups: readonly ScoreVisualGroup[];
};
