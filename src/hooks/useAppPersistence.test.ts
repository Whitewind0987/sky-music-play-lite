import { describe, expect, it, vi } from "vitest";
import { buildPersistedAppData } from "../lib/appData";
import { defaultKeyMapping } from "../types/keyMapping";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
} from "../types/playbackOptions";
import { defaultPlaybackShortcuts } from "../types/playbackShortcuts";
import {
  applyLoadedV1ToV2UpgradePreferences,
  canScheduleNormalAppDataPersistence,
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

function createAppData() {
  return buildPersistedAppData({
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
