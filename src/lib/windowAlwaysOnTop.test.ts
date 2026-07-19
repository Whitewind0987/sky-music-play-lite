import { describe, expect, it, vi } from "vitest";
import {
  applyAlwaysOnTopTransition,
  createAlwaysOnTopFailureReport,
} from "./windowAlwaysOnTop";

describe("applyAlwaysOnTopTransition", () => {
  it.each([false, true])(
    "applies startup value %s through the native setter",
    async (desiredValue) => {
      const setNativeAlwaysOnTop = vi.fn().mockResolvedValue(undefined);

      await expect(
        applyAlwaysOnTopTransition({
          currentValue: false,
          desiredValue,
          isUpdating: false,
          setNativeAlwaysOnTop,
        }),
      ).resolves.toEqual({ status: "applied", value: desiredValue });
      expect(setNativeAlwaysOnTop).toHaveBeenCalledWith(desiredValue);
    },
  );

  it.each([
    [false, true],
    [true, false],
  ])(
    "returns the successfully applied transition from %s to %s",
    async (currentValue, desiredValue) => {
      await expect(
        applyAlwaysOnTopTransition({
          currentValue,
          desiredValue,
          isUpdating: false,
          setNativeAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
        }),
      ).resolves.toEqual({ status: "applied", value: desiredValue });
    },
  );

  it("retains the previous value and exposes the original native error", async () => {
    const error = new Error("native failure");

    await expect(
      applyAlwaysOnTopTransition({
        currentValue: false,
        desiredValue: true,
        isUpdating: false,
        setNativeAlwaysOnTop: vi.fn().mockRejectedValue(error),
      }),
    ).resolves.toEqual({
      error,
      status: "failed",
      value: false,
    });
  });

  it("blocks an overlapping request without calling the native setter", async () => {
    const setNativeAlwaysOnTop = vi.fn();

    await expect(
      applyAlwaysOnTopTransition({
        currentValue: true,
        desiredValue: false,
        isUpdating: true,
        setNativeAlwaysOnTop,
      }),
    ).resolves.toEqual({ status: "blocked", value: true });
    expect(setNativeAlwaysOnTop).not.toHaveBeenCalled();
  });

  it("does not expose the new value before the native promise resolves", async () => {
    let finishNativeUpdate: () => void = () => {};
    let result:
      | Awaited<ReturnType<typeof applyAlwaysOnTopTransition>>
      | undefined;
    const transition = applyAlwaysOnTopTransition({
      currentValue: false,
      desiredValue: true,
      isUpdating: false,
      setNativeAlwaysOnTop: () =>
        new Promise<void>((resolve) => {
          finishNativeUpdate = resolve;
        }),
    }).then((nextResult) => {
      result = nextResult;
      return nextResult;
    });

    await Promise.resolve();
    expect(result).toBeUndefined();

    finishNativeUpdate();
    await expect(transition).resolves.toEqual({
      status: "applied",
      value: true,
    });
  });

  it("returns only a successful value for later persistence", async () => {
    const success = await applyAlwaysOnTopTransition({
      currentValue: false,
      desiredValue: true,
      isUpdating: false,
      setNativeAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    });
    const failure = await applyAlwaysOnTopTransition({
      currentValue: false,
      desiredValue: true,
      isUpdating: false,
      setNativeAlwaysOnTop: vi
        .fn()
        .mockRejectedValue(new Error("denied")),
    });

    expect(success.value).toBe(true);
    expect(failure.value).toBe(false);
  });

  it("does not mutate its input object", async () => {
    const options = {
      currentValue: false,
      desiredValue: true,
      isUpdating: false,
      setNativeAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    };
    const snapshot = { ...options };

    await applyAlwaysOnTopTransition(options);

    expect(options).toEqual(snapshot);
  });
});

describe("createAlwaysOnTopFailureReport", () => {
  it.each([
    ["切换窗口置顶失败：{error}", "切换窗口置顶失败：denied"],
    [
      "Failed to change always-on-top state: {error}",
      "Failed to change always-on-top state: denied",
    ],
  ])("formats the localized user-facing failure", (template, expected) => {
    expect(
      createAlwaysOnTopFailureReport({
        desiredAlwaysOnTop: true,
        error: new Error("denied"),
        messageTemplate: template,
      }).message,
    ).toBe(expected);
  });

  it("creates the required detailed window error entry", () => {
    const error = new Error("native failure");

    expect(
      createAlwaysOnTopFailureReport({
        desiredAlwaysOnTop: false,
        error,
        messageTemplate: "{error}",
      }).detailedLog,
    ).toEqual({
      details: {
        desiredAlwaysOnTop: false,
        error: String(error),
      },
      level: "error",
      message: "Failed to change always-on-top state",
      source: "window",
    });
  });
});
