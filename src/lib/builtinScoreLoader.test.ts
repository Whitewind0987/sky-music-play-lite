import { afterEach, describe, expect, it, vi } from "vitest";
import { findBuiltInScoreIndexEntry } from "./builtinScoreIndex";
import { loadBuiltInScoreById } from "./builtinScoreLoader";

vi.mock("./builtinScoreIndex", () => ({
  findBuiltInScoreIndexEntry: vi.fn(),
}));

describe("loadBuiltInScoreById", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries after a transient built-in score load failure", async () => {
    vi.mocked(findBuiltInScoreIndexEntry).mockResolvedValue({
      bpm: 120,
      bitsPerPage: 2,
      durationMs: 500,
      fileName: "retry-score.json",
      id: "builtin:retry-score:0",
      isComposed: true,
      noteCount: 1,
      pitchLevel: 0,
      songIndex: 0,
      title: "Retry score",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              name: "Retry score",
              author: "Tester",
              bpm: 120,
              pitchLevel: 0,
              isComposed: true,
              bitsPerPage: 2,
              songNotes: [{ key: "Key0", time: 0 }],
            },
          ]),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      loadBuiltInScoreById("builtin:retry-score:0"),
    ).resolves.toBeNull();

    await expect(
      loadBuiltInScoreById("builtin:retry-score:0"),
    ).resolves.toMatchObject({
      name: "Retry score",
      songNotes: [{ key: "Key0", time: 0 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
