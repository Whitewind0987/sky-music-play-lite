import type { Note } from "../types/score";

export type PreviewActiveKeyEntry = {
  expiresAtMs: number | null;
  key: string;
};

export function applyNoteGroupToPreviewActiveKeys(
  currentEntries: PreviewActiveKeyEntry[],
  notes: Note[],
  nowMs: number,
  playbackSpeed: number,
): PreviewActiveKeyEntry[] {
  const groupKeys = new Set(notes.map((note) => note.key));
  const survivingHolds = currentEntries.filter(
    (entry) =>
      entry.expiresAtMs !== null &&
      entry.expiresAtMs > nowMs &&
      !groupKeys.has(entry.key),
  );
  const newEntries = notes.map((note) => ({
    expiresAtMs:
      note.duration === undefined
        ? null
        : nowMs + note.duration / playbackSpeed,
    key: note.key,
  }));

  return [...survivingHolds, ...dedupeByKeyKeepingLatestExpiry(newEntries)];
}

export function prunePreviewActiveKeys(
  currentEntries: PreviewActiveKeyEntry[],
  nowMs: number,
): PreviewActiveKeyEntry[] {
  return currentEntries.filter(
    (entry) => entry.expiresAtMs === null || entry.expiresAtMs > nowMs,
  );
}

export function getNextPreviewExpiryMs(
  currentEntries: PreviewActiveKeyEntry[],
): number | null {
  const expiries = currentEntries
    .map((entry) => entry.expiresAtMs)
    .filter((expiry): expiry is number => expiry !== null);

  return expiries.length === 0 ? null : Math.min(...expiries);
}

function dedupeByKeyKeepingLatestExpiry(
  entries: PreviewActiveKeyEntry[],
): PreviewActiveKeyEntry[] {
  const deduped = new Map<string, PreviewActiveKeyEntry>();

  for (const entry of entries) {
    const existing = deduped.get(entry.key);

    if (
      !existing ||
      existing.expiresAtMs === null ||
      (entry.expiresAtMs !== null && entry.expiresAtMs > existing.expiresAtMs)
    ) {
      deduped.set(entry.key, entry);
    }
  }

  return Array.from(deduped.values());
}
