export type ForegroundPlaybackHandoffResult<T> =
  | { status: "stale" }
  | { status: "unavailable" }
  | { song: T; status: "ready" };

export async function resolveForegroundPlaybackBeforeHandoff<T>({
  isRequestCurrent,
  replaceActiveSession,
  resolveRequestedSong,
}: {
  isRequestCurrent: () => boolean;
  replaceActiveSession: () => void;
  resolveRequestedSong: () => Promise<T | null>;
}): Promise<ForegroundPlaybackHandoffResult<T>> {
  const song = await resolveRequestedSong();

  if (!isRequestCurrent()) {
    return { status: "stale" };
  }

  if (song === null) {
    return { status: "unavailable" };
  }

  replaceActiveSession();

  return { song, status: "ready" };
}
