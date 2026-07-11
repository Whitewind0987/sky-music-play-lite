import { describe, expect, it } from "vitest";
import { resolveForegroundPlaybackBeforeHandoff } from "./foregroundPlaybackHandoff";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("resolveForegroundPlaybackBeforeHandoff", () => {
  it("does not replace the active session before resolution completes", async () => {
    const deferredSong = createDeferred<string | null>();
    const events: string[] = [];
    const handoff = resolveForegroundPlaybackBeforeHandoff({
      isRequestCurrent: () => true,
      replaceActiveSession: () => events.push("replace-active"),
      resolveRequestedSong: () => deferredSong.promise,
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    deferredSong.resolve("C");
    await expect(handoff).resolves.toEqual({ song: "C", status: "ready" });
    expect(events).toEqual(["replace-active"]);
  });

  it("keeps the active session when score resolution returns null", async () => {
    const events: string[] = [];

    await expect(
      resolveForegroundPlaybackBeforeHandoff({
        isRequestCurrent: () => true,
        replaceActiveSession: () => events.push("replace-active"),
        resolveRequestedSong: async () => null,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(events).toEqual([]);
  });

  it("replaces the old session only after a successful resolution", async () => {
    const events: string[] = [];

    await expect(
      resolveForegroundPlaybackBeforeHandoff({
        isRequestCurrent: () => true,
        replaceActiveSession: () => events.push("stop-B"),
        resolveRequestedSong: async () => {
          events.push("resolve-C");
          return "C";
        },
      }),
    ).resolves.toEqual({ song: "C", status: "ready" });
    expect(events).toEqual(["resolve-C", "stop-B"]);
  });

  it("does not replace the active session for a superseded request", async () => {
    const activeRequestTokenRef = { current: 2 };
    const requestToken = 1;
    const events: string[] = [];

    await expect(
      resolveForegroundPlaybackBeforeHandoff({
        isRequestCurrent: () => activeRequestTokenRef.current === requestToken,
        replaceActiveSession: () => events.push("replace-active"),
        resolveRequestedSong: async () => "C",
      }),
    ).resolves.toEqual({ status: "stale" });
    expect(events).toEqual([]);
  });

  it("rejects a request that becomes stale while resolution is pending", async () => {
    const deferredSong = createDeferred<string | null>();
    let activeRequestToken = 1;
    const events: string[] = [];
    const handoff = resolveForegroundPlaybackBeforeHandoff({
      isRequestCurrent: () => activeRequestToken === 1,
      replaceActiveSession: () => events.push("replace-active"),
      resolveRequestedSong: () => deferredSong.promise,
    });

    activeRequestToken = 2;
    deferredSong.resolve("C");

    await expect(handoff).resolves.toEqual({ status: "stale" });
    expect(events).toEqual([]);
  });
});
