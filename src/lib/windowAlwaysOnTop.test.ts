import { describe, expect, it, vi } from "vitest";
import {
  applyAlwaysOnTopTransition,
  createAlwaysOnTopController,
  createAlwaysOnTopFailureReport,
} from "./windowAlwaysOnTop";

function createDeferredPromise() {
  let rejectPromise: (error: unknown) => void = () => {};
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

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

describe("createAlwaysOnTopController", () => {
  it.each([true, false])(
    "keeps runtime and persisted startup value %s after native success",
    async (savedValue) => {
      const setNativeAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
      const controller = createAlwaysOnTopController({
        setNativeAlwaysOnTop,
      });

      controller.applyPersistedPreference(savedValue);
      await controller.initializeNativeState();

      expect(setNativeAlwaysOnTop).toHaveBeenCalledOnce();
      expect(setNativeAlwaysOnTop).toHaveBeenCalledWith(savedValue);
      expect(controller.getState()).toEqual({
        isAlwaysOnTop: savedValue,
        isReady: true,
        isUpdating: false,
        persistedAlwaysOnTop: savedValue,
      });
    },
  );

  it("falls back at runtime without erasing persisted true after startup failure", async () => {
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop: vi
        .fn()
        .mockRejectedValue(new Error("denied")),
    });

    controller.applyPersistedPreference(true);
    await controller.initializeNativeState();

    expect(controller.getState()).toEqual({
      isAlwaysOnTop: false,
      isReady: true,
      isUpdating: false,
      persistedAlwaysOnTop: true,
    });
  });

  it("routes startup failure through the localized and detailed failure report", async () => {
    const normalLogs: string[] = [];
    const detailedLogs: unknown[] = [];
    const controller = createAlwaysOnTopController({
      onFailure: (desiredAlwaysOnTop, error) => {
        const report = createAlwaysOnTopFailureReport({
          desiredAlwaysOnTop,
          error,
          messageTemplate: "切换窗口置顶失败：{error}",
        });
        normalLogs.push(report.message);
        detailedLogs.push(report.detailedLog);
      },
      setNativeAlwaysOnTop: vi
        .fn()
        .mockRejectedValue(new Error("denied")),
    });

    controller.applyPersistedPreference(true);
    await controller.initializeNativeState();

    expect(normalLogs).toEqual(["切换窗口置顶失败：denied"]);
    expect(detailedLogs).toEqual([
      {
        details: {
          desiredAlwaysOnTop: true,
          error: "Error: denied",
        },
        level: "error",
        message: "Failed to change always-on-top state",
        source: "window",
      },
    ]);
  });

  it("can become ready with false after app-data loading falls back", async () => {
    const setNativeAlwaysOnTop = vi.fn().mockResolvedValue(undefined);
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop,
    });

    controller.applyPersistedPreference(false);
    await controller.initializeNativeState();

    expect(setNativeAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(controller.getState()).toEqual({
      isAlwaysOnTop: false,
      isReady: true,
      isUpdating: false,
      persistedAlwaysOnTop: false,
    });
  });

  it("changes both values only after a user toggle succeeds", async () => {
    const pendingToggle = createDeferredPromise();
    const setNativeAlwaysOnTop = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => pendingToggle.promise);
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop,
    });
    controller.applyPersistedPreference(false);
    await controller.initializeNativeState();

    const toggle = controller.toggle();

    expect(controller.getState()).toEqual({
      isAlwaysOnTop: false,
      isReady: true,
      isUpdating: true,
      persistedAlwaysOnTop: false,
    });

    pendingToggle.resolve();
    await toggle;

    expect(controller.getState()).toEqual({
      isAlwaysOnTop: true,
      isReady: true,
      isUpdating: false,
      persistedAlwaysOnTop: true,
    });
  });

  it("keeps both values unchanged after a user toggle fails", async () => {
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("denied")),
    });
    controller.applyPersistedPreference(true);
    await controller.initializeNativeState();

    await controller.toggle();

    expect(controller.getState()).toEqual({
      isAlwaysOnTop: true,
      isReady: true,
      isUpdating: false,
      persistedAlwaysOnTop: true,
    });
  });

  it("blocks overlapping user toggles in the controller used by the hook", async () => {
    const pendingToggle = createDeferredPromise();
    const setNativeAlwaysOnTop = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => pendingToggle.promise);
    const controller = createAlwaysOnTopController({
      setNativeAlwaysOnTop,
    });
    controller.applyPersistedPreference(false);
    await controller.initializeNativeState();

    const firstToggle = controller.toggle();
    await expect(controller.toggle()).resolves.toEqual({
      status: "blocked",
      value: false,
    });

    expect(setNativeAlwaysOnTop).toHaveBeenCalledTimes(2);
    expect(setNativeAlwaysOnTop.mock.calls).toEqual([[false], [true]]);
    expect(controller.getState().persistedAlwaysOnTop).toBe(false);

    pendingToggle.resolve();
    await firstToggle;
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
