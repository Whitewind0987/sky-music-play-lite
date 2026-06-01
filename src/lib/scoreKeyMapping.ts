import {
  getPreviewKeyName,
  skyKeyNames,
  type KeyMapping,
  type SkyKeyName,
} from "../types/keyMapping";
import type { Note } from "../types/score";

export function mapScoreNoteToKeyboardKey(note: Note, keyMapping: KeyMapping) {
  const skyKey = getPreviewKeyName(note.key);

  if (!isSkyKeyName(skyKey)) {
    throw new Error(`Unsupported score key for experimental playback: ${note.key}`);
  }

  const mappedKey = keyMapping[skyKey].trim();

  if (mappedKey.length === 0) {
    throw new Error(`No mapped keyboard key for ${skyKey}.`);
  }

  return mappedKey;
}

function isSkyKeyName(value: string): value is SkyKeyName {
  return skyKeyNames.some((skyKeyName) => skyKeyName === value);
}
