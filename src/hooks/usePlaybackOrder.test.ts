import { describe, expect, it } from "vitest";
import type { LibrarySongListItem } from "../types/library";
import { buildPlaybackOrderFromVisibleItems } from "./usePlaybackOrder";

function createLibraryItem(id: string): LibrarySongListItem {
  return {
    isLiked: false,
    librarySong: {
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
      source: "local-import",
    },
    songIndex: 0,
  };
}

describe("buildPlaybackOrderFromVisibleItems", () => {
  const items = ["A", "B", "C"].map(createLibraryItem);

  it("keeps every current search result in the playback context", () => {
    expect(
      buildPlaybackOrderFromVisibleItems(items, "B", { usesSearch: true }),
    ).toEqual(["A", "B", "C"]);
  });

  it("keeps the existing sliced order for non-search lists", () => {
    expect(
      buildPlaybackOrderFromVisibleItems(items, "B", { usesSearch: false }),
    ).toEqual(["B", "C"]);
  });

  it("falls back to the full visible order when the clicked song is missing", () => {
    expect(
      buildPlaybackOrderFromVisibleItems(items, "X", { usesSearch: false }),
    ).toEqual(["A", "B", "C"]);
  });
});
