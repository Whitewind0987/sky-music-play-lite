import type { LibrarySong, LibrarySongId } from "../types/library";
import { resolveActivePlaybackSongIndex } from "./activePlaybackSong";

export function isCurrentBackgroundHandoff({
  activeHandoffToken,
  handoffToken,
  isPending,
}: {
  activeHandoffToken: number;
  handoffToken: number;
  isPending: boolean;
}): boolean {
  return isPending && activeHandoffToken === handoffToken;
}

export function resolveLibrarySongIndexById(
  librarySongs: LibrarySong[],
  songId: LibrarySongId | null,
): number | null {
  return resolveActivePlaybackSongIndex({ librarySongs, songId });
}

export function resolveBackgroundHandoffRollbackSongIndex({
  activeHandoffToken,
  handoffToken,
  librarySongs,
  rollbackPlaybackSongId,
}: {
  activeHandoffToken: number;
  handoffToken: number;
  librarySongs: LibrarySong[];
  rollbackPlaybackSongId: LibrarySongId | null;
}): number | null | undefined {
  if (activeHandoffToken !== handoffToken) {
    return undefined;
  }

  return resolveLibrarySongIndexById(librarySongs, rollbackPlaybackSongId);
}
