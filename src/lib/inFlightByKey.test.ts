import { describe, expect, it } from "vitest";
import { InFlightByKey } from "./inFlightByKey";

describe("InFlightByKey", () => {
  it("shares one underlying load for preload and playback callers", async () => {
    const loader = new InFlightByKey<string | null>();
    let loadCount = 0;
    let resolveLoad: (value: string | null) => void = () => {};
    const gate = new Promise<string | null>((resolve) => {
      resolveLoad = resolve;
    });
    const first = loader.getOrStart("builtin:a", async () => {
      loadCount += 1;
      return gate;
    });
    const second = loader.getOrStart("builtin:a", async () => {
      loadCount += 1;
      return "duplicate";
    });

    resolveLoad("loaded");

    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
      "loaded",
      "loaded",
    ]);
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(loadCount).toBe(1);
  });

  it("removes failed work so a later playback attempt can retry", async () => {
    const loader = new InFlightByKey<string | null>();
    let loadCount = 0;

    const failed = loader.getOrStart("builtin:a", async () => {
      loadCount += 1;
      return null;
    });
    await expect(failed.promise).resolves.toBeNull();

    const retry = loader.getOrStart("builtin:a", async () => {
      loadCount += 1;
      return "loaded";
    });
    await expect(retry.promise).resolves.toBe("loaded");
    expect(retry.isNew).toBe(true);
    expect(loadCount).toBe(2);
  });

  it("keeps different built-in song ids independent", async () => {
    const loader = new InFlightByKey<string>();
    let loadCount = 0;

    const first = loader.getOrStart("builtin:a", async () => {
      loadCount += 1;
      return "a";
    });
    const second = loader.getOrStart("builtin:b", async () => {
      loadCount += 1;
      return "b";
    });

    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
      "a",
      "b",
    ]);
    expect(loadCount).toBe(2);
  });
});
