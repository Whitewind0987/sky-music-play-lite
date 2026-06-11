import { describe, expect, it } from "vitest";
import { compareSemverLike } from "./updateCheck";

describe("compareSemverLike", () => {
  it("detects newer patch, minor, and major versions", () => {
    expect(compareSemverLike("0.1.2", "0.1.3")).toBe(-1);
    expect(compareSemverLike("0.1.2", "0.2.0")).toBe(-1);
    expect(compareSemverLike("0.1.2", "1.0.0")).toBe(-1);
  });

  it("detects equal versions", () => {
    expect(compareSemverLike("0.1.2", "0.1.2")).toBe(0);
  });

  it("detects when the current version is newer", () => {
    expect(compareSemverLike("0.2.0", "0.1.9")).toBe(1);
  });

  it("supports v-prefixed versions", () => {
    expect(compareSemverLike("v0.1.2", "0.1.3")).toBe(-1);
  });

  it("orders prerelease versions before stable releases", () => {
    expect(compareSemverLike("0.2.0-alpha.1", "0.2.0-alpha.2")).toBe(-1);
    expect(compareSemverLike("0.2.0-alpha.1", "0.2.0")).toBe(-1);
    expect(compareSemverLike("0.2.0", "0.2.0-alpha.1")).toBe(1);
  });

  it("returns null for invalid versions", () => {
    expect(compareSemverLike("bad", "0.2.0")).toBeNull();
    expect(compareSemverLike("0.1", "0.2.0")).toBeNull();
  });
});
