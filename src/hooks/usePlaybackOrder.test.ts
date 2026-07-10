import { describe, expect, it } from "vitest";
import type { LibrarySongListItem } from "../types/library";
import { createLocalSongMetadata } from "../lib/libraryCollections";
import {
  buildPlaybackOrderFromVisibleItems,
  getOrderedNextSongId,
  removeSongFromActivePlaybackContext,
} from "./usePlaybackOrder";

function createLibraryItem(id: string): LibrarySongListItem {
  return {
    isLiked: false,
    librarySong: {
      id,
      importedAt: 0,
      metadata: createLocalSongMetadata({
        bitsPerPage: 16,
        bpm: 120,
        isComposed: false,
        name: id,
        pitchLevel: 0,
        songNotes: [],
      }),
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

  it("keeps every current non-search item in the playback context", () => {
    expect(
      buildPlaybackOrderFromVisibleItems(items, "B", { usesSearch: false }),
    ).toEqual(["A", "B", "C"]);
  });

  it("falls back to the full visible order when the clicked song is missing", () => {
    expect(
      buildPlaybackOrderFromVisibleItems(items, "X", { usesSearch: false }),
    ).toEqual(["A", "B", "C"]);
  });
});

describe("getOrderedNextSongId", () => {
  it("wraps the last song to the first song in repeat-all mode", () => {
    expect(getOrderedNextSongId(["A", "B", "C"], 2, "repeat-all")).toBe("A");
  });

  it("continues to the next song after starting from the middle", () => {
    expect(getOrderedNextSongId(["A", "B", "C"], 1, "sequence")).toBe("C");
  });

  it("finishes at the last song in sequence mode", () => {
    expect(getOrderedNextSongId(["A", "B", "C"], 2, "sequence")).toBeNull();
  });

  it("allows a one-song repeat-all context to repeat itself", () => {
    expect(getOrderedNextSongId(["A"], 0, "repeat-all")).toBe("A");
  });
});

describe("removeSongFromActivePlaybackContext", () => {
  const context = {
    currentSongId: "B",
    songIds: ["A", "B", "C", "D"],
    source: "search" as const,
  };

  it("removes a missing ID while preserving unrelated IDs in order", () => {
    expect(removeSongFromActivePlaybackContext(context, "C")).toEqual({
      ...context,
      songIds: ["A", "B", "D"],
    });
  });

  it("clears the context when its current song is removed", () => {
    expect(removeSongFromActivePlaybackContext(context, "B")).toBeNull();
  });

  it("is safe to apply multiple removals repeatedly", () => {
    const afterFirstRemoval = removeSongFromActivePlaybackContext(context, "C");
    const afterSecondRemoval = removeSongFromActivePlaybackContext(
      afterFirstRemoval,
      "D",
    );

    expect(afterSecondRemoval).toEqual({
      ...context,
      songIds: ["A", "B"],
    });
    expect(
      removeSongFromActivePlaybackContext(afterSecondRemoval, "D"),
    ).toBe(afterSecondRemoval);
  });
});
