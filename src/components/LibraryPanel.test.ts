import { describe, expect, it } from "vitest";
import type {
  BuiltInLibrarySong,
  LibrarySongListItem,
  LocalLibrarySong,
} from "../types/library";
import { shouldShowUpgradeToV2Action } from "./LibraryPanel";

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
});
