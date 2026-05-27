import type { Note } from "../types/score";

const DEFAULT_TIME_STEP_MS = 500;
const SCORE_KEY_PATTERN = /^\d+Key\d+$/;

export function parseTextScore(input: string): Note[] {
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Score input is empty.");
  }

  return tokens.map((token, index) => {
    if (!SCORE_KEY_PATTERN.test(token)) {
      throw new Error(`Unsupported score key: ${token}`);
    }

    return {
      time: index * DEFAULT_TIME_STEP_MS,
      key: token,
    };
  });
}
