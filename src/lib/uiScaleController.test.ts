import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUiScaleController, uiScaleResizeDelayMs } from "./uiScaleController";
import { uiScalePresets } from "./uiScale";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function setup() {
  let size = { width: 1100, height: 720 };
  const readWindowSize = vi.fn(async () => size);
  const applyZoom = vi.fn(async (_scale: number) => {});
  const controller = createUiScaleController({ readWindowSize, applyZoom });
  return {
    controller,
    readWindowSize,
    applyZoom,
    resize(width: number, height: number) {
      size = { width, height };
      controller.handleResize();
    },
  };
}

describe("UI scale resize coordination", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(uiScalePresets)("does no native work during continuous resizing at %s", async (scale) => {
    const { controller, readWindowSize, applyZoom, resize } = setup();
    controller.setPreferredScale(scale);
    await flush();
    readWindowSize.mockClear();
    applyZoom.mockClear();

    // Right edge, bottom edge, corner, 980/720 breakpoints and minimum size.
    for (const [width, height] of [[1000, 720], [979, 720], [721, 650], [719, 650], [480, 320]]) {
      resize(width, height);
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(readWindowSize).not.toHaveBeenCalled();
    expect(applyZoom).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(readWindowSize).toHaveBeenCalledTimes(1);
    if (scale === 1) {
      expect(applyZoom).not.toHaveBeenCalled();
    } else {
      expect(applyZoom).toHaveBeenCalledExactlyOnceWith(1);
    }

    // A minimum-size clamp must not replace the persisted preference.
    resize(1100, 720);
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    if (scale !== 1) expect(applyZoom).toHaveBeenLastCalledWith(scale);
  });

  it("uses the native size to clamp a narrow window and restores the preset", async () => {
    const { controller, applyZoom, resize } = setup();
    controller.setPreferredScale(1.2);
    await flush();
    resize(540, 600);
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(applyZoom).toHaveBeenLastCalledWith(540 / 480);
    resize(900, 336);
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(applyZoom).toHaveBeenLastCalledWith(336 / 320);
    resize(1100, 720);
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(applyZoom).toHaveBeenLastCalledWith(1.2);
  });

  it("does not reapply zoom when zoom itself emits a resize", async () => {
    const { controller, applyZoom } = setup();
    applyZoom.mockImplementation(async () => controller.handleResize());
    controller.setPreferredScale(1.1);
    await flush();
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs * 3);
    expect(applyZoom).toHaveBeenCalledExactlyOnceWith(1.1);
  });

  it("discards a size read superseded by a preference change", async () => {
    const { controller, readWindowSize, applyZoom } = setup();
    const size = deferred<{ width: number; height: number }>();
    readWindowSize.mockReturnValueOnce(size.promise);
    controller.setPreferredScale(1.2);
    await flush();
    controller.setPreferredScale(1);
    size.resolve({ width: 480, height: 320 });
    await flush();
    expect(applyZoom).not.toHaveBeenCalled();
  });

  it("serializes in-flight zoom and restores the latest preference", async () => {
    const { controller, applyZoom } = setup();
    const zoom = deferred<void>();
    applyZoom.mockReturnValueOnce(zoom.promise);
    controller.setPreferredScale(1.2);
    await flush();
    controller.setPreferredScale(1.1);
    controller.setPreferredScale(1);
    await flush();
    expect(applyZoom).toHaveBeenCalledExactlyOnceWith(1.2);
    zoom.resolve();
    await flush();
    expect(applyZoom.mock.calls).toEqual([[1.2], [1]]);
  });

  it("invalidates an in-flight size read when a new resize begins", async () => {
    const { controller, readWindowSize, applyZoom, resize } = setup();
    const size = deferred<{ width: number; height: number }>();
    readWindowSize.mockReturnValueOnce(size.promise);
    controller.setPreferredScale(1.2);
    await flush();
    resize(480, 320);
    size.resolve({ width: 1100, height: 720 });
    await flush();
    expect(applyZoom).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(applyZoom).not.toHaveBeenCalled();
  });

  it.each(["read", "zoom"])("retries after a native %s failure", async (operation) => {
    const { controller, readWindowSize, applyZoom } = setup();
    if (operation === "read") readWindowSize.mockRejectedValueOnce(new Error("unavailable"));
    else applyZoom.mockRejectedValueOnce(new Error("unavailable"));
    controller.setPreferredScale(1.1);
    await flush();
    controller.handleResize();
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(applyZoom).toHaveBeenLastCalledWith(1.1);
    expect(applyZoom).toHaveBeenCalledTimes(operation === "read" ? 1 : 2);
  });

  it("cancels pending work on cleanup and supports StrictMode effect replay", async () => {
    const { controller, readWindowSize, applyZoom } = setup();
    controller.setPreferredScale(1.2);
    controller.handleResize();
    controller.cancel();
    await vi.advanceTimersByTimeAsync(uiScaleResizeDelayMs);
    expect(readWindowSize).not.toHaveBeenCalled();
    controller.setPreferredScale(1.1);
    await flush();
    expect(applyZoom).toHaveBeenCalledExactlyOnceWith(1.1);
  });

  it("ignores a size read resolved after cleanup", async () => {
    const { controller, readWindowSize, applyZoom } = setup();
    const size = deferred<{ width: number; height: number }>();
    readWindowSize.mockReturnValueOnce(size.promise);
    controller.setPreferredScale(1.2);
    await flush();
    controller.cancel();
    size.resolve({ width: 1100, height: 720 });
    await flush();
    expect(applyZoom).not.toHaveBeenCalled();
  });
});
