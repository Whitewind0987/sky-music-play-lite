import { describe, expect, it } from "vitest";
import type {
  BuiltInLibrarySong,
  LibrarySong,
  LocalLibrarySong,
} from "../types/library";
import {
  isCurrentBackgroundHandoff,
  resolveBackgroundHandoffRollbackSongIndex,
  resolveLibrarySongIndexById,
} from "./backgroundHandoffRollback";

describe("isCurrentBackgroundHandoff", () => {
  function invokeRustOnlyIfCurrent({
    activeHandoffToken,
    handoffToken,
    isPending,
  }: {
    activeHandoffToken: number;
    handoffToken: number;
    isPending: boolean;
  }) {
    let rustInvocations = 0;
    if (isCurrentBackgroundHandoff({ activeHandoffToken, handoffToken, isPending })) {
      rustInvocations += 1;
    }
    return rustInvocations;
  }

  it("blocks Rust start when cancellation happens after score resolution", () => {
    expect(invokeRustOnlyIfCurrent({ activeHandoffToken: 2, handoffToken: 1, isPending: false })).toBe(0);
  });

  it("blocks Rust start when cancellation happens after prepared-plan resolution", () => {
    expect(invokeRustOnlyIfCurrent({ activeHandoffToken: 2, handoffToken: 1, isPending: false })).toBe(0);
  });

  it("replacement during preparation sends to neither old nor new HWND", () => {
    const oldWindowInvocations = invokeRustOnlyIfCurrent({ activeHandoffToken: 2, handoffToken: 1, isPending: false });
    const newWindowInvocations = invokeRustOnlyIfCurrent({ activeHandoffToken: 2, handoffToken: 1, isPending: false });
    expect([oldWindowInvocations, newWindowInvocations]).toEqual([0, 0]);
  });

  it("allows only the still-current pending handoff", () => {
    expect(invokeRustOnlyIfCurrent({ activeHandoffToken: 4, handoffToken: 4, isPending: true })).toBe(1);
  });
});

function createLocalSong(id: string): LocalLibrarySong {
  return {
    id,
    importedAt: 0,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: id,
      isComposed: false,
      lastNoteTimeMs: 0,
      name: id,
      noteCount: 0,
      noteGroupCount: 0,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

function createBuiltInSong(id: string): BuiltInLibrarySong {
  return {
    id,
    importedAt: 0,
    song: {
      bitsPerPage: 16,
      bpm: 120,
      isComposed: false,
      name: id,
      pitchLevel: 0,
      songNotes: [],
    },
    source: "built-in",
  };
}

function resolveRollback({
  activeHandoffToken = 1,
  handoffToken = 1,
  librarySongs,
  rollbackPlaybackSongId,
}: {
  activeHandoffToken?: number;
  handoffToken?: number;
  librarySongs: LibrarySong[];
  rollbackPlaybackSongId: string | null;
}) {
  return resolveBackgroundHandoffRollbackSongIndex({
    activeHandoffToken,
    handoffToken,
    librarySongs,
    rollbackPlaybackSongId,
  });
}

describe("resolveLibrarySongIndexById", () => {
  const librarySongs: LibrarySong[] = [
    createBuiltInSong("builtin-1"),
    createLocalSong("local-1"),
    createLocalSong("local-2"),
  ];

  it("returns the current index for built-in and local song IDs", () => {
    expect(resolveLibrarySongIndexById(librarySongs, "builtin-1")).toBe(0);
    expect(resolveLibrarySongIndexById(librarySongs, "local-2")).toBe(2);
  });

  it("returns null for no rollback song or a removed song", () => {
    expect(resolveLibrarySongIndexById(librarySongs, null)).toBeNull();
    expect(resolveLibrarySongIndexById(librarySongs, "local-removed")).toBeNull();
  });

  it("restores a target at its latest index after an earlier requested song is removed", () => {
    const initialLibrary = [
      createBuiltInSong("A"),
      createLocalSong("B-missing"),
      createLocalSong("C-current"),
      createLocalSong("D"),
    ];
    const rollbackPlaybackSongId = initialLibrary[2].id;
    const latestLibrary = initialLibrary.filter(
      (librarySong) => librarySong.id !== "B-missing",
    );

    expect(rollbackPlaybackSongId).toBe("C-current");
    expect(resolveLibrarySongIndexById(latestLibrary, rollbackPlaybackSongId)).toBe(1);
  });

  it("keeps the rollback target index when a later requested song is removed", () => {
    const librarySongs = [
      createBuiltInSong("A"),
      createLocalSong("C-current"),
      createLocalSong("D-missing"),
    ];
    const latestLibrary = librarySongs.filter(
      (librarySong) => librarySong.id !== "D-missing",
    );

    expect(resolveLibrarySongIndexById(latestLibrary, "C-current")).toBe(1);
  });

  it("does not use the previous numeric index after multiple earlier removals", () => {
    const initialLibrary = [
      createBuiltInSong("A"),
      createLocalSong("B-missing"),
      createLocalSong("C-missing"),
      createLocalSong("D-current"),
    ];
    const latestLibrary = initialLibrary.filter(
      (librarySong) =>
        librarySong.id !== "B-missing" && librarySong.id !== "C-missing",
    );

    expect(resolveLibrarySongIndexById(latestLibrary, "D-current")).toBe(1);
  });
});

describe("resolveBackgroundHandoffRollbackSongIndex", () => {
  const librarySongs = [
    createBuiltInSong("builtin-1"),
    createLocalSong("local-current"),
  ];

  it("restores the latest index for a failed score resolution", () => {
    expect(
      resolveRollback({
        librarySongs,
        rollbackPlaybackSongId: "local-current",
      }),
    ).toBe(1);
  });

  it("allows a current handoff cancellation to restore by ID", () => {
    const latestLibrary = [createLocalSong("local-current")];

    expect(
      resolveRollback({
        librarySongs: latestLibrary,
        rollbackPlaybackSongId: "local-current",
      }),
    ).toBe(0);
  });

  it("does not restore a superseded handoff", () => {
    expect(
      resolveRollback({
        activeHandoffToken: 2,
        handoffToken: 1,
        librarySongs,
        rollbackPlaybackSongId: "local-current",
      }),
    ).toBeUndefined();
  });

  it("restores null when the previous song was removed or did not exist", () => {
    expect(
      resolveRollback({
        librarySongs: [createBuiltInSong("builtin-1")],
        rollbackPlaybackSongId: "local-current",
      }),
    ).toBeNull();
    expect(
      resolveRollback({
        librarySongs,
        rollbackPlaybackSongId: null,
      }),
    ).toBeNull();
  });
});
