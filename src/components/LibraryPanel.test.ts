import { describe, expect, it, vi } from "vitest";
import type {
  BuiltInLibrarySong,
  LibrarySongListItem,
  LocalLibrarySong,
} from "../types/library";
import {
  getVisibleScoreTransformActions,
  resolveScoreTransformSourceRequest,
  shouldShowUpgradeToV2Action,
} from "./LibraryPanel";

function asItem(
  librarySong: BuiltInLibrarySong | LocalLibrarySong,
): LibrarySongListItem {
  return { isLiked: false, librarySong, songIndex: 0 };
}

function createLocal(
  formatVersion: 1 | 2 | undefined,
): LocalLibrarySong {
  return {
    id: "local",
    importedAt: 1,
    metadata: {
      bitsPerPage: 16,
      bpm: 120,
      fingerprint: "fingerprint",
      ...(formatVersion === undefined ? {} : { formatVersion }),
      isComposed: false,
      lastNoteTimeMs: 0,
      name: "Local",
      noteCount: 1,
      noteGroupCount: 1,
      pitchLevel: 0,
    },
    source: "local-import",
  };
}

function createBuiltIn(
  formatVersion: 1 | 2 | undefined,
): BuiltInLibrarySong {
  return {
    ...(formatVersion === undefined
      ? {}
      : { builtInFormatVersion: formatVersion }),
    id: "built-in",
    importedAt: 0,
    song: {
      name: "Built-in",
      bpm: 120,
      bitsPerPage: 16,
      pitchLevel: 0,
      isComposed: false,
      songNotes: [],
    },
    source: "built-in",
  };
}

describe("LibraryPanel V2 upgrade menu visibility", () => {
  it.each([
    ["local V1", createLocal(1)],
    ["built-in V1", createBuiltIn(1)],
  ])("shows the action for %s", (_, librarySong) => {
    expect(shouldShowUpgradeToV2Action(asItem(librarySong))).toBe(true);
  });

  it.each([
    ["local V2", createLocal(2)],
    ["built-in V2", createBuiltIn(2)],
    ["local unknown", createLocal(undefined)],
    ["built-in unknown", createBuiltIn(undefined)],
  ])("hides the action for %s", (_, librarySong) => {
    expect(shouldShowUpgradeToV2Action(asItem(librarySong))).toBe(false);
  });

  it("shows two separate transform actions for V1 only", () => {
    expect(getVisibleScoreTransformActions(asItem(createLocal(1)))).toEqual([
      "upgrade-v2",
      "generate-sustain-melody",
    ]);
    expect(getVisibleScoreTransformActions(asItem(createLocal(2)))).toEqual(
      [],
    );
  });
});

describe("score transform source loading", () => {
  const sourceSong = createBuiltIn(1).song;

  it("reports a null load as a localized failure path", async () => {
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    await expect(
      resolveScoreTransformSourceRequest({
        getLatestRequestId: () => 1,
        loadSource: async () => null,
        onFailed,
        onLoaded,
        requestId: 1,
      }),
    ).resolves.toBe("failed");
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it("catches rejected loads without an unhandled rejection", async () => {
    const onFailed = vi.fn();
    await expect(
      resolveScoreTransformSourceRequest({
        getLatestRequestId: () => 1,
        loadSource: async () => {
          throw new Error("load failed");
        },
        onFailed,
        onLoaded: vi.fn(),
        requestId: 1,
      }),
    ).resolves.toBe("failed");
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it("ignores stale success and stale rejection after a newer request", async () => {
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    await expect(
      resolveScoreTransformSourceRequest({
        getLatestRequestId: () => 2,
        loadSource: async () => sourceSong,
        onFailed,
        onLoaded,
        requestId: 1,
      }),
    ).resolves.toBe("stale");
    await expect(
      resolveScoreTransformSourceRequest({
        getLatestRequestId: () => 2,
        loadSource: async () => {
          throw new Error("stale");
        },
        onFailed,
        onLoaded,
        requestId: 1,
      }),
    ).resolves.toBe("stale");
    expect(onFailed).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
