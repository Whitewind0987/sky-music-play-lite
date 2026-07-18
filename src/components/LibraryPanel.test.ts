import { describe, expect, it, vi } from "vitest";
import type {
  BuiltInLibrarySong,
  LibrarySongListItem,
  LocalLibrarySong,
} from "../types/library";
import {
  getNextUpgradeSourceRequestId,
  getUpgradeToV2ActionState,
  getV1ToV2UpgradePreferenceReadiness,
  getVisibleUpgradeActionCount,
  requestUpgradeSourceWhenReady,
  resolveUpgradeSourceRequest,
  shouldShowUpgradeToV2Action,
} from "./LibraryPanel";
import { uiText } from "../i18n/uiText";

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

  it("shows exactly one upgrade action for V1 and none for V2", () => {
    expect(getVisibleUpgradeActionCount(asItem(createLocal(1)))).toBe(1);
    expect(getVisibleUpgradeActionCount(asItem(createLocal(2)))).toBe(0);
  });

  it("keeps the V1 action visible while preference loading disables request advancement", () => {
    const item = asItem(createLocal(1));

    expect(getVisibleUpgradeActionCount(item)).toBe(1);
    expect(getUpgradeToV2ActionState(item, false)).toEqual({
      disabled: true,
      visible: true,
    });
    expect(getUpgradeToV2ActionState(item, true)).toEqual({
      disabled: false,
      visible: true,
    });
    expect(getNextUpgradeSourceRequestId(7, false)).toBe(7);
    expect(getNextUpgradeSourceRequestId(7, true)).toBe(8);
  });

  it("maps app-data loading readiness directly to the panel prop", () => {
    expect(getV1ToV2UpgradePreferenceReadiness(false)).toBe(false);
    expect(getV1ToV2UpgradePreferenceReadiness(true)).toBe(true);
  });

  it("does not preload, advance, fail, or open before readiness", async () => {
    let latestRequestId = 4;
    const loadSource = vi.fn().mockResolvedValue(createBuiltIn(1).song);
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    const setLatestRequestId = vi.fn((requestId: number) => {
      latestRequestId = requestId;
    });

    await expect(
      requestUpgradeSourceWhenReady({
        getLatestRequestId: () => latestRequestId,
        isV1ToV2UpgradePreferenceReady: false,
        loadSource,
        onFailed,
        onLoaded,
        setLatestRequestId,
      }),
    ).resolves.toBe("not-ready");
    expect(latestRequestId).toBe(4);
    expect(setLatestRequestId).not.toHaveBeenCalled();
    expect(loadSource).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it("preloads and opens normally after readiness", async () => {
    let latestRequestId = 4;
    const sourceSong = createBuiltIn(1).song;
    const loadSource = vi.fn().mockResolvedValue(sourceSong);
    const onLoaded = vi.fn();

    await expect(
      requestUpgradeSourceWhenReady({
        getLatestRequestId: () => latestRequestId,
        isV1ToV2UpgradePreferenceReady: true,
        loadSource,
        onFailed: vi.fn(),
        onLoaded,
        setLatestRequestId: (requestId) => {
          latestRequestId = requestId;
        },
      }),
    ).resolves.toBe("loaded");
    expect(latestRequestId).toBe(5);
    expect(loadSource).toHaveBeenCalledOnce();
    expect(onLoaded).toHaveBeenCalledWith(sourceSong);
  });

  it("readiness never changes format eligibility", () => {
    for (const isReady of [false, true]) {
      expect(
        getUpgradeToV2ActionState(asItem(createLocal(1)), isReady).visible,
      ).toBe(true);
      expect(
        getUpgradeToV2ActionState(asItem(createLocal(2)), isReady).visible,
      ).toBe(false);
      expect(
        getUpgradeToV2ActionState(
          asItem(createLocal(undefined)),
          isReady,
        ).visible,
      ).toBe(false);
    }
  });
});

describe("score upgrade source loading", () => {
  const sourceSong = createBuiltIn(1).song;

  it("opens the dialog after a successful latest load", async () => {
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    await expect(
      resolveUpgradeSourceRequest({
        getLatestRequestId: () => 1,
        loadSource: async () => sourceSong,
        onFailed,
        onLoaded,
        requestId: 1,
      }),
    ).resolves.toBe("loaded");
    expect(onLoaded).toHaveBeenCalledOnce();
    expect(onLoaded).toHaveBeenCalledWith(sourceSong);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("reports a null load as a localized failure path", async () => {
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    await expect(
      resolveUpgradeSourceRequest({
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
      resolveUpgradeSourceRequest({
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
      resolveUpgradeSourceRequest({
        getLatestRequestId: () => 2,
        loadSource: async () => sourceSong,
        onFailed,
        onLoaded,
        requestId: 1,
      }),
    ).resolves.toBe("stale");
    await expect(
      resolveUpgradeSourceRequest({
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

  it("lets the latest overlapping request win", async () => {
    let latestRequestId = 1;
    let resolveFirstLoad: ((song: typeof sourceSong) => void) | undefined;
    const firstSource = { ...sourceSong, name: "First" };
    const latestSource = { ...sourceSong, name: "Latest" };
    const onFailed = vi.fn();
    const onLoaded = vi.fn();
    const firstRequest = resolveUpgradeSourceRequest({
      getLatestRequestId: () => latestRequestId,
      loadSource: () =>
        new Promise((resolve) => {
          resolveFirstLoad = resolve;
        }),
      onFailed,
      onLoaded,
      requestId: 1,
    });

    latestRequestId = 2;
    await expect(
      resolveUpgradeSourceRequest({
        getLatestRequestId: () => latestRequestId,
        loadSource: async () => latestSource,
        onFailed,
        onLoaded,
        requestId: 2,
      }),
    ).resolves.toBe("loaded");
    resolveFirstLoad?.(firstSource);
    await expect(firstRequest).resolves.toBe("stale");

    expect(onLoaded).toHaveBeenCalledOnce();
    expect(onLoaded).toHaveBeenCalledWith(latestSource);
    expect(onFailed).not.toHaveBeenCalled();
  });
});

describe("removed experimental conversion copy", () => {
  it("keeps no removed menu or dialog copy in either locale", () => {
    const text = JSON.stringify(uiText);
    const removedCopy = [
      ["长音乐器", "旋律版"].join(""),
      ["Sustain-Instrument", " Melody"].join(""),
      ["Melody", " Priority"].join(""),
    ];

    for (const copy of removedCopy) {
      expect(text).not.toContain(copy);
    }
  });
});
