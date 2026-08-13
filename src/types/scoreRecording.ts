import type { SkyKeyName } from "./keyMapping";
import type { Note } from "./score";

export type ScoreRecordingEventType = "keydown" | "keyup";

export type ScoreRecordingInputEvent = {
  sessionId: number;
  type: ScoreRecordingEventType;
  key: string;
  timeMs: number;
};

export type ScoreRecordingKeyLookup = {
  keyToSkyKey: ReadonlyMap<string, SkyKeyName>;
  ambiguousKeys: ReadonlySet<string>;
};

export type ActiveScoreRecordingPress = {
  noteIndex: number;
  startedAtMs: number;
};

export type ScoreRecordingSession = {
  sessionId: number;
  activePresses: ReadonlyMap<string, ActiveScoreRecordingPress>;
  notes: readonly Note[];
  firstAcceptedNoteTimeMs: number | null;
  lastAcceptedEventTimeMs: number | null;
  finished: boolean;
};
