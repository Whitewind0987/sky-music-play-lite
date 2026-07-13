import type { LibrarySongId } from "../types/library";

export function shouldStopPlaybackForRemovedSong({
  activePlaybackSongIds,
  removedPlaybackSongId,
}: {
  activePlaybackSongIds: Array<LibrarySongId | null>;
  removedPlaybackSongId: LibrarySongId;
}) {
  return activePlaybackSongIds.includes(removedPlaybackSongId);
}
