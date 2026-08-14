import { describe, expect, it } from "vitest";
import { parseLibraryPageInput } from "./libraryPagination";

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
