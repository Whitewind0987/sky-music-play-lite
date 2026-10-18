import { describe, expect, it } from "vitest";
import { getHeaderSearchMode } from "./headerSearchMode";

describe("getHeaderSearchMode", () => {
  it("stays hidden outside the library", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: true,
        isLibrary: false,
        isOpen: true,
        isToolbarVisible: false,
      }),
    ).toBe("hidden");
  });

  it("stays hidden while the toolbar search is visible", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: false,
        isLibrary: true,
        isOpen: false,
        isToolbarVisible: true,
      }),
    ).toBe("hidden");
  });

  it("shows the button once the toolbar search scrolls away", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: false,
        isLibrary: true,
        isOpen: false,
        isToolbarVisible: false,
      }),
    ).toBe("button");
  });

  it("shows the field when opened while the toolbar is hidden", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: false,
        isLibrary: true,
        isOpen: true,
        isToolbarVisible: false,
      }),
    ).toBe("field");
  });

  it("keeps a focused field open when the toolbar comes back into view", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: true,
        isLibrary: true,
        isOpen: true,
        isToolbarVisible: true,
      }),
    ).toBe("field");
  });

  it("drops an unfocused open field once the toolbar is visible again", () => {
    expect(
      getHeaderSearchMode({
        hasFocus: false,
        isLibrary: true,
        isOpen: true,
        isToolbarVisible: true,
      }),
    ).toBe("hidden");
  });
});
