import type { LibrarySong, LibrarySongId } from "../types/library";

export type ManualNextCurrentSongResolution =
  | {
      status: "resolved";
      songId: LibrarySongId;
      songIndex: number;
      source:
        | "foreground"
        | "target-window"
        | "playback-context"
        | "playback"
        | "selected";
    }
  | {
      status: "context-unavailable";
      reason: "missing-current-song" | "missing-fallback";
      source:
        | "foreground"
        | "target-window"
        | "playback-context"
        | "playback"
        | "selected"
        | null;
    };

export function resolveManualNextCurrentSong({
  activeForegroundSongId,
  activeTargetWindowSongId,
  contextSongId,
  librarySongs,
  playbackSongIndex,
  selectedSongIndex,
}: {
  activeForegroundSongId: LibrarySongId | null;
  activeTargetWindowSongId: LibrarySongId | null;
  contextSongId: LibrarySongId | null;
  librarySongs: LibrarySong[];
  playbackSongIndex: number | null;
  selectedSongIndex: number | null;
}): ManualNextCurrentSongResolution {
  const stableCandidates = [
    { songId: activeForegroundSongId, source: "foreground" as const },
    { songId: activeTargetWindowSongId, source: "target-window" as const },
    { songId: contextSongId, source: "playback-context" as const },
  ];

  for (const candidate of stableCandidates) {
    if (candidate.songId === null) {
      continue;
    }

    const songIndex = librarySongs.findIndex(
      (librarySong) => librarySong.id === candidate.songId,
    );
    return songIndex === -1
      ? {
          status: "context-unavailable",
          reason: "missing-current-song",
          source: candidate.source,
        }
      : {
          status: "resolved",
          songId: candidate.songId,
          songIndex,
          source: candidate.source,
        };
  }

  const indexedCandidates = [
    { songIndex: playbackSongIndex, source: "playback" as const },
    { songIndex: selectedSongIndex, source: "selected" as const },
  ];
  for (const candidate of indexedCandidates) {
    if (candidate.songIndex === null) {
      continue;
    }

    const songId = librarySongs[candidate.songIndex]?.id;
    return songId
      ? {
          status: "resolved",
          songId,
          songIndex: candidate.songIndex,
          source: candidate.source,
        }
      : {
          status: "context-unavailable",
          reason: "missing-current-song",
          source: candidate.source,
        };
  }

  return {
    status: "context-unavailable",
    reason: "missing-fallback",
    source: null,
  };
}
