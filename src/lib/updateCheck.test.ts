import { fetch } from "@tauri-apps/plugin-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, compareSemverLike } from "./updateCheck";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

const mockedFetch = vi.mocked(fetch);
const allowedReleaseUrlPrefix =
  "https://github.com/Whitewind0987/sky-music-play-lite/releases/";

beforeEach(() => {
  mockedFetch.mockReset();
});

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

describe("checkForUpdate", () => {
  it("returns update info for a newer valid manifest", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: "0.2.0",
        releaseUrl:
          "https://github.com/Whitewind0987/sky-music-play-lite/releases/tag/v0.2.0",
        title: "SkyMusicPlay Lite v0.2.0",
        notes: ["A", "B"],
        updateKind: "recommended",
      }),
    } as Response);

    await expect(
      checkForUpdate({
        currentVersion: "0.1.2",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toEqual({
      latestVersion: "0.2.0",
      releaseUrl:
        "https://github.com/Whitewind0987/sky-music-play-lite/releases/tag/v0.2.0",
      title: "SkyMusicPlay Lite v0.2.0",
      notes: ["A", "B"],
      updateKind: "recommended",
    });
  });

  it("returns null when the response is not ok", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(
      checkForUpdate({
        currentVersion: "0.1.2",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the release URL is not allowed", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: "0.2.0",
        releaseUrl: "https://example.com/test",
      }),
    } as Response);

    await expect(
      checkForUpdate({
        currentVersion: "0.1.2",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the latest version is not newer", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: "0.2.0",
        releaseUrl:
          "https://github.com/Whitewind0987/sky-music-play-lite/releases/tag/v0.2.0",
      }),
    } as Response);

    await expect(
      checkForUpdate({
        currentVersion: "0.2.0",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toBeNull();
  });

  it("normalizes a notes string to an array", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: "0.2.0",
        releaseUrl:
          "https://github.com/Whitewind0987/sky-music-play-lite/releases/tag/v0.2.0",
        notes: "Single note",
      }),
    } as Response);

    const result = await checkForUpdate({
      currentVersion: "0.1.2",
      manifestUrl: "https://example.test/latest.json",
      allowedReleaseUrlPrefix,
    });

    expect(result?.notes).toEqual(["Single note"]);
  });

  it("infers alpha update kind from version when updateKind is missing", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latestVersion: "0.2.0-alpha.1",
        releaseUrl:
          "https://github.com/Whitewind0987/sky-music-play-lite/releases/tag/v0.2.0-alpha.1",
      }),
    } as Response);

    const result = await checkForUpdate({
      currentVersion: "0.1.2",
      manifestUrl: "https://example.test/latest.json",
      allowedReleaseUrlPrefix,
    });

    expect(result?.updateKind).toBe("alpha");
  });

  it("returns null for an invalid manifest shape", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ latestVersion: "", releaseUrl: "" }),
    } as Response);

    await expect(
      checkForUpdate({
        currentVersion: "0.1.2",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedFetch.mockRejectedValue(new Error("network failed"));

    await expect(
      checkForUpdate({
        currentVersion: "0.1.2",
        manifestUrl: "https://example.test/latest.json",
        allowedReleaseUrlPrefix,
      }),
    ).resolves.toBeNull();

    warnSpy.mockRestore();
  });
});
