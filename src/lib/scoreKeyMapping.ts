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

export type MappedPlaybackKey = {
  key: string;
  holdMs?: number;
};

export function prepareMappedKeyboardKeyGroups(
  notes: Note[],
  keyMapping: KeyMapping,
): Map<number, MappedPlaybackKey[]> {
  const mappedGroups = new Map<number, MappedPlaybackKey[]>();

  for (const note of notes) {
    const mappedKey = mapScoreNoteToKeyboardKey(note, keyMapping);
    const currentGroup = mappedGroups.get(note.time) ?? [];
    const existingEntry = currentGroup.find((entry) => entry.key === mappedKey);

    if (existingEntry) {
      if (
        note.duration !== undefined &&
        (existingEntry.holdMs === undefined ||
          note.duration > existingEntry.holdMs)
      ) {
        existingEntry.holdMs = note.duration;
      }
    } else {
      currentGroup.push(
        note.duration === undefined
          ? { key: mappedKey }
          : { key: mappedKey, holdMs: note.duration },
      );
    }

    mappedGroups.set(note.time, currentGroup);
  }

  return mappedGroups;
}

function isSkyKeyName(value: string): value is SkyKeyName {
  return skyKeyNames.some((skyKeyName) => skyKeyName === value);
}
