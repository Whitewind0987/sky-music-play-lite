// SPDX-FileCopyrightText: 2026 Whitewind0987 and contributors
// SPDX-License-Identifier: GPL-3.0-only

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibrarySongId, LocalLibrarySong } from "../types/library";
import { usePlaybackCoordinator } from "./usePlaybackCoordinator";

function createLocalSong(id: string, index: number): LocalLibrarySong {
  return {
    id,
    importedAt: index,
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

// 轻量 controller 替身：只记录 handleDeleteLocalSongs 需要的协作点调用。
function buildCoordinator(playingSongId: LibrarySongId | null = null) {
  const librarySongs: LocalLibrarySong[] = [
    createLocalSong("a", 0),
    createLocalSong("b", 1),
    createLocalSong("c", 2),
  ];
  const removedQueueSongIndices: number[] = [];
  const removedPlaybackContextSongIds: LibrarySongId[] = [];
  const deleteCalls: Array<{
    songIndex: number;
    songId: LibrarySongId;
    hasOnDeleted: boolean;
    stopPlaybackBeforeDelete: boolean;
  }> = [];

  // handlePlaybackCoordinator 内部直接使用 scoreLibrary.handleDeleteLocalSong 的签名，
  // 这里用一个忠于其行为的最小替身：回调同步触发，近似 onSuccessfulDelete 之后的 onDeleted。
  const scoreLibrary = {
    librarySongsRef: { current: librarySongs },
    librarySongs,
    selectedSongIndex: null,
    currentPlaybackLibrarySong: null,
    playbackSongIdRef: { current: playingSongId },
    isSongLoading: () => false,
    handleDeleteLocalSong: vi.fn(
      async (
        songIndex: number,
        onDeleted?: (
          deletedSongIndex: number,
          deletedSongId: LibrarySongId,
        ) => void,
        options: { stopPlaybackBeforeDelete?: boolean } = {},
      ) => {
        const song = librarySongs[songIndex];
        deleteCalls.push({
          songIndex,
          songId: song.id,
          hasOnDeleted: typeof onDeleted === "function",
          stopPlaybackBeforeDelete: options.stopPlaybackBeforeDelete === true,
        });
        onDeleted?.(songIndex, song.id);
        return true;
      },
    ),
  };
  const playbackQueue = {
    getFirstQueueItem: () => null,
    removeSongIndex: (songIndex: number) => removedQueueSongIndices.push(songIndex),
  };
  const playbackOrder = {
    removeSongFromPlaybackContext: (songId: LibrarySongId) =>
      removedPlaybackContextSongIds.push(songId),
  };

  // The coordinator uses hooks internally, so it has to run inside a React
  // dispatcher. The server renderer provides one without needing a DOM.
  let coordinator: ReturnType<typeof usePlaybackCoordinator> | null = null;

  function mount() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinator = usePlaybackCoordinator({
      appendLog: () => {},
      experimentalInput: {} as never,
      playbackOrder: playbackOrder as never,
      playbackOutput: {} as never,
      playbackQueue: playbackQueue as never,
      scoreLibrary: scoreLibrary as never,
      text: { logs: {} } as never,
    });
    return null;
  }

  renderToStaticMarkup(
    createElement(function Harness() {
      mount();
      return null;
    }),
  );

  return {
    coordinator: coordinator!,
    scoreLibrary,
    removedQueueSongIndices,
    removedPlaybackContextSongIds,
    deleteCalls,
  };
}

describe("handlePlaybackCoordinator.handleDeleteLocalSongs (批量删除播放同步)", () => {
  it("为每条本地歌曲删除都带上队列清理回调并清除播放上下文", async () => {
    const {
      coordinator,
      scoreLibrary,
      removedQueueSongIndices,
      removedPlaybackContextSongIds,
      deleteCalls,
    } = buildCoordinator();

    await coordinator.handleDeleteLocalSongs(["a", "c"]);

    // 两条都被删，且每条删除都带了 onDeleted 回调（触发队列/上下文清理）
    expect(scoreLibrary.handleDeleteLocalSong).toHaveBeenCalledTimes(2);
    expect(deleteCalls.map((call) => call.songId)).toEqual(["a", "c"]);
    expect(deleteCalls.every((call) => call.hasOnDeleted)).toBe(true);
    // 没有正在播放的曲谱被删，因此不打断播放。
    expect(deleteCalls.every((call) => call.stopPlaybackBeforeDelete)).toBe(false);

    // 队列清理按原始 songIndex 收集（0 和 2）
    expect(removedQueueSongIndices).toEqual([0, 2]);
    // 播放上下文按 songId 清除
    expect(removedPlaybackContextSongIds).toEqual(["a", "c"]);
  });

  it("正在播放的曲谱在删除列表里时才停止播放", async () => {
    const { coordinator, deleteCalls } = buildCoordinator("a");

    await coordinator.handleDeleteLocalSongs(["a", "c"]);

    expect(deleteCalls.map((call) => call.stopPlaybackBeforeDelete)).toEqual([
      true,
      true,
    ]);
  });

  it("播放的是其它曲谱时不打断当前播放", async () => {
    const { coordinator, deleteCalls } = buildCoordinator("b");

    await coordinator.handleDeleteLocalSongs(["a", "c"]);

    // 正在播放的 b 不在删除列表里，因此两次删除都不该停播。
    expect(deleteCalls.every((call) => call.stopPlaybackBeforeDelete)).toBe(false);
  });

  it("跳过内置曲谱（非 local-import）,不触发删除与队列清理", async () => {
    const librarySongs: Array<
      | LocalLibrarySong
      | {
          id: string;
          source: "built-in";
          importedAt: number;
          song: {
            name: string;
            bpm: number;
            bitsPerPage: number;
            isComposed: boolean;
            pitchLevel: number;
            songNotes: never[];
          };
        }
    > = [
      createLocalSong("local-1", 0),
      {
        id: "builtin-1",
        importedAt: 0,
        song: {
          name: "builtin-1",
          bpm: 120,
          bitsPerPage: 16,
          isComposed: false,
          pitchLevel: 0,
          songNotes: [],
        },
        source: "built-in",
      },
      createLocalSong("local-2", 2),
    ];
    const removedQueueSongIndices: number[] = [];
    const removedPlaybackContextSongIds: LibrarySongId[] = [];
    const deletes: string[] = [];
    const scoreLibrary = {
      librarySongsRef: { current: librarySongs },
      librarySongs,
      selectedSongIndex: null,
      currentPlaybackLibrarySong: null,
      playbackSongIdRef: { current: null },
      isSongLoading: () => false,
      handleDeleteLocalSong: vi.fn(
        async (
          songIndex: number,
          onDeleted?: (i: number, id: LibrarySongId) => void,
        ) => {
          const song = librarySongs[songIndex];
          deletes.push(song.id);
          onDeleted?.(songIndex, song.id);
          return true;
        },
      ),
    };
    const playbackQueue = {
      getFirstQueueItem: () => null,
      removeSongIndex: (i: number) => removedQueueSongIndices.push(i),
    };
    const playbackOrder = {
      removeSongFromPlaybackContext: (id: LibrarySongId) =>
        removedPlaybackContextSongIds.push(id),
    };

    let coordinator: ReturnType<typeof usePlaybackCoordinator> | null = null;

    function mount() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      coordinator = usePlaybackCoordinator({
        appendLog: () => {},
        experimentalInput: {} as never,
        playbackOrder: playbackOrder as never,
        playbackOutput: {} as never,
        playbackQueue: playbackQueue as never,
        scoreLibrary: scoreLibrary as never,
        text: { logs: {} } as never,
      });
      return null;
    }
    renderToStaticMarkup(
      createElement(function Harness() {
        mount();
        return null;
      }),
    );

    await coordinator!.handleDeleteLocalSongs(["local-1", "builtin-1", "local-2"]);

    expect(deletes).toEqual(["local-1", "local-2"]);
    expect(removedQueueSongIndices).toEqual([0, 2]);
    expect(removedPlaybackContextSongIds).toEqual(["local-1", "local-2"]);
  });
});
