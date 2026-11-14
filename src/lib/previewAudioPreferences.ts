export const defaultPreviewVolume = 70;

export type PreviewAudioPreferences = { volume: number; muted: boolean; instrumentId?: string };

export function normalizePreviewVolume(volume: unknown): number {
  return typeof volume === "number" && Number.isFinite(volume)
    ? Math.min(100, Math.max(0, Math.round(volume)))
    : defaultPreviewVolume;
}
