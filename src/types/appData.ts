import type { LibraryCategoryId } from "../components/AppShell";
import type { LanguageCode } from "../i18n/uiText";
import type {
  ExperimentalInputMode,
  TargetWindowCompatibilityProfile,
  TargetWindowMessageMethod,
} from "./experimentalInput";
import type { KeyMapping } from "./keyMapping";
import type {
  NoteIntervalDelayMs,
  PlaybackMode,
  PlaybackSpeed,
} from "./playbackOptions";
import type { PlaybackShortcuts } from "./playbackShortcuts";
import type { LibrarySong, LikedSongEntry, UserPlaylist } from "./library";

export const appDataVersion = 2;

export type ExperimentalInputPreferences = {
  experimentalInputEnabled: boolean;
  experimentalInputMode: ExperimentalInputMode;
  selectedWindowHwnd: string | null;
  selectedWindowSnapshot?: {
    className: string;
    hwnd: string;
    processName?: string;
    title: string;
  };
  targetWindowCompatibilityProfile: TargetWindowCompatibilityProfile;
  targetWindowKeyHoldMs: number;
  targetWindowMessageMethod: TargetWindowMessageMethod;
};

export type PersistedAppData = {
  appDataVersion: typeof appDataVersion;
  experimentalInputPreferences?: ExperimentalInputPreferences;
  keyMapping: KeyMapping;
  language: LanguageCode;
  library: {
    librarySongs: LibrarySong[];
    likedSongs: LikedSongEntry[];
    playlists: UserPlaylist[];
    selectedLibraryCategory: LibraryCategoryId;
    selectedPlaylistId: string | null;
    selectedSongIndex: number | null;
  };
  playbackShortcuts: PlaybackShortcuts;
  playbackSettings: {
    isShuffleEnabled: boolean;
    noteIntervalDelayMs: NoteIntervalDelayMs;
    playbackMode: PlaybackMode;
    playbackSpeed: PlaybackSpeed;
  };
};
