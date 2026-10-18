import { describe, expect, it } from "vitest";
import {
  getLibraryPageItems,
  getLibrarySongPage,
  isLibraryPageInputOutOfRange,
  parseLibraryPageInput,
} from "./libraryPagination";

describe("getLibraryPageItems", () => {
  it("clamps page boundaries and handles empty data", () => {
    expect(getLibraryPageItems([1, 2, 3], 99, 2)).toEqual([3]);
    expect(getLibraryPageItems([1, 2, 3], -1, 2)).toEqual([1, 2]);
    expect(getLibraryPageItems([], 2, 100)).toEqual([]);
    expect(getLibraryPageItems([1, 2], 1, 0)).toEqual([]);
  });

  it("locates the selected stable ID in the sorted dataset", () => {
    const items = Array.from({ length: 205 }, (_, index) => ({ librarySong: { id: String(204 - index) } }));
    expect(getLibrarySongPage(items, "0", 100)).toBe(3);
    expect(getLibrarySongPage(items, "204", 100)).toBe(1);
    expect(getLibrarySongPage(items, "missing", 100)).toBe(1);
    expect(getLibrarySongPage(items, null, 100)).toBe(1);
  });
});

describe("parseLibraryPageInput", () => {
  it.each([
    ["1", 111, 1],
    ["56", 111, 56],
    ["111", 111, 111],
    [" 56 ", 111, 56],
    ["01", 111, 1],
  ])("parses %j within a %i-page library", (value, pageCount, expected) => {
    expect(parseLibraryPageInput(value, pageCount)).toBe(expected);
  });

  it.each([
    ["", 111],
    ["0", 111],
    ["-1", 111],
    ["1.5", 111],
    ["abc", 111],
    ["112", 111],
    ["1", 0],
    [String(Number.MAX_SAFE_INTEGER + 1), Number.MAX_SAFE_INTEGER],
  ])("rejects %j with pageCount %i", (value, pageCount) => {
    expect(parseLibraryPageInput(value, pageCount)).toBeNull();
  });
});

describe("isLibraryPageInputOutOfRange", () => {
  it.each([
    ["0", 111],
    ["112", 111],
    [String(Number.MAX_SAFE_INTEGER), 111],
  ])(
    "classifies %j as out of range with pageCount %i",
    (value, pageCount) => {
      expect(isLibraryPageInputOutOfRange(value, pageCount)).toBe(true);
    },
  );

  it.each([
    ["1", 111],
    ["56", 111],
    ["111", 111],
    ["", 111],
    ["abc", 111],
    ["1.5", 111],
    ["-1", 111],
    [String(Number.MAX_SAFE_INTEGER + 1), 111],
    ["1", 0],
  ])(
    "does not classify %j as out of range with pageCount %i",
    (value, pageCount) => {
      expect(isLibraryPageInputOutOfRange(value, pageCount)).toBe(false);
    },
  );
});
