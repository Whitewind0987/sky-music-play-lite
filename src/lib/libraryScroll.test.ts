import { describe, expect, it } from "vitest";
import { calculateCenteredScrollTop } from "./libraryScroll";

describe("calculateCenteredScrollTop", () => {
  it("scrolls downward to center a target below the current viewport", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 400,
        containerScrollHeight: 2_000,
        currentScrollTop: 300,
        targetHeight: 40,
        targetTopRelativeToContainer: 500,
      }),
    ).toBe(620);
  });

  it("scrolls upward to center a target above the current viewport", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 400,
        containerScrollHeight: 2_000,
        currentScrollTop: 700,
        targetHeight: 40,
        targetTopRelativeToContainer: -100,
      }),
    ).toBe(420);
  });

  it("clamps the result to the top of the container", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 400,
        containerScrollHeight: 2_000,
        currentScrollTop: 0,
        targetHeight: 40,
        targetTopRelativeToContainer: 20,
      }),
    ).toBe(0);
  });

  it("clamps the result to the bottom of the container", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 400,
        containerScrollHeight: 1_000,
        currentScrollTop: 500,
        targetHeight: 40,
        targetTopRelativeToContainer: 350,
      }),
    ).toBe(600);
  });

  it("includes the existing scroll position when converting viewport coordinates", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 300,
        containerScrollHeight: 1_500,
        currentScrollTop: 450,
        targetHeight: 50,
        targetTopRelativeToContainer: 275,
      }),
    ).toBe(600);
  });

  it("keeps an already centered target at the current stable position", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 120,
        containerScrollHeight: 1_000,
        currentScrollTop: 300,
        targetHeight: 40,
        targetTopRelativeToContainer: 40,
      }),
    ).toBe(300);
  });

  it("returns zero when the content is no taller than the container", () => {
    expect(
      calculateCenteredScrollTop({
        containerClientHeight: 500,
        containerScrollHeight: 400,
        currentScrollTop: 100,
        targetHeight: 40,
        targetTopRelativeToContainer: 300,
      }),
    ).toBe(0);
  });
});
