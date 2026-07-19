import { describe, expect, it, vi } from "vitest";
import { buildPersistedAppData } from "../lib/appData";
import { createAlwaysOnTopController } from "../lib/windowAlwaysOnTop";
import { defaultKeyMapping } from "../types/keyMapping";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
} from "../types/playbackOptions";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import {
  applyLoadedAlwaysOnTopPreference,
  applyLoadedV1ToV2UpgradePreferences,
  buildAppDataForPersistence,
  canScheduleNormalAppDataPersistence,
  finishFailedAppDataLoad,
  normalAppDataSaveDebounceMs,
} from "./useAppPersistence";

const preferences = {
  selectedStyle: "balanced" as const,
  customValues: {
    minimumSustainGapMs: 333,
    releaseLeadMs: 22,
    restGapThresholdMs: 1444,
    maxDurationMs: 1333,
    finalGroupDurationMs: 444,
  },
};

function createAppData(alwaysOnTop = false) {
  return buildPersistedAppData({
    alwaysOnTop,
    isShuffleEnabled: false,
    keyMapping: defaultKeyMapping,
    language: "zh-CN",
    librarySongs: [],
    likedSongs: [],
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    playbackMode: defaultPlaybackMode,
    playbackShortcuts: defaultPlaybackShortcuts,
    playbackSpeed: defaultPlaybackSpeed,
    playlists: [],
    selectedLibraryCategory: "local-imports",
    selectedPlaylistId: null,
    selectedSongIndex: null,
    v1ToV2UpgradePreferences: preferences,
  });
}

describe("V1 to V2 preference persistence wiring", () => {
  it("applies the loaded preference to runtime state", () => {
    const applyPreferences = vi.fn();

    applyLoadedV1ToV2UpgradePreferences(
      createAppData(),
      applyPreferences,
    );

    expect(applyPreferences).toHaveBeenCalledOnce();
    expect(applyPreferences).toHaveBeenCalledWith(preferences);
  });

  it("does not schedule normal saves before initial loading completes", () => {
    expect(
      canScheduleNormalAppDataPersistence({
        canSaveAppData: true,
        hasLoadedAppData: false,
        isNormalPersistenceEnabled: true,
      }),
    ).toBe(false);
  });

  it("requires loaded data, save readiness, and enabled persistence", () => {
    expect(
      canScheduleNormalAppDataPersistence({
        canSaveAppData: true,
        hasLoadedAppData: true,
        isNormalPersistenceEnabled: true,
      }),
    ).toBe(true);
    expect(
      canScheduleNormalAppDataPersistence({
        canSaveAppData: false,
        hasLoadedAppData: true,
        isNormalPersistenceEnabled: true,
      }),
    ).toBe(false);
    expect(
      canScheduleNormalAppDataPersistence({
        canSaveAppData: true,
        hasLoadedAppData: true,
        isNormalPersistenceEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("always-on-top persistence wiring", () => {
  it("applies the loaded preference before readiness is reported", () => {
    const order: string[] = [];

    applyLoadedAlwaysOnTopPreference(createAppData(true), (value) => {
      order.push(`apply:${value}`);
    });
    order.push("ready");

    expect(order).toEqual(["apply:true", "ready"]);
  });

  it("applies false after app-data load failure", () => {
    const order: string[] = [];

    finishFailedAppDataLoad({
      applyAlwaysOnTop: (value) => order.push(`apply:${value}`),
      reportLoaded: () => order.push("loaded"),
    });

    expect(order).toEqual(["apply:false", "loaded"]);
  });

  it("includes the current value in normal persisted app data", () => {
    const appData = buildAppDataForPersistence({
      alwaysOnTop: true,
      isShuffleEnabled: false,
      keyMapping: defaultKeyMapping,
      language: "zh-CN",
      librarySongs: [],
      likedSongs: [],
      noteIntervalDelayMs: defaultNoteIntervalDelayMs,
      playbackMode: defaultPlaybackMode,
      playbackShortcuts: defaultPlaybackShortcuts,
      playbackSpeed: defaultPlaybackSpeed,
      playlists: [],
      selectedLibraryCategory: "local-imports",
      selectedPlaylistId: null,
      selectedSongIndex: null,
    });

    expect(appData.alwaysOnTop).toBe(true);
  });

  it("persists the saved preference instead of a startup runtime fallback", async () => {
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop: vi
        .fn()
        .mockRejectedValue(new Error("temporarily unavailable")),
    });
    controller.applyPersistedPreference(true);
    await controller.initializeNativeState();
    const state = controller.getState();

    const appData = buildAppDataForPersistence({
      alwaysOnTop: state.persistedAlwaysOnTop,
      isShuffleEnabled: false,
      keyMapping: defaultKeyMapping,
      language: "zh-CN",
      librarySongs: [],
      likedSongs: [],
      noteIntervalDelayMs: defaultNoteIntervalDelayMs,
      playbackMode: defaultPlaybackMode,
      playbackShortcuts: defaultPlaybackShortcuts,
      playbackSpeed: defaultPlaybackSpeed,
      playlists: [],
      selectedLibraryCategory: "local-imports",
      selectedPlaylistId: null,
      selectedSongIndex: null,
    });

    expect(state.isAlwaysOnTop).toBe(false);
    expect(appData.alwaysOnTop).toBe(true);
  });

  it("reuses the existing normal 500ms debounce", () => {
    expect(normalAppDataSaveDebounceMs).toBe(500);
  });
});
