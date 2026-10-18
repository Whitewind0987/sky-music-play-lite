import { PhysicalSize } from "@tauri-apps/api/dpi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readNativeWindowSize } from "./tauriApi";

const nativeWindow = vi.hoisted(() => ({
  innerSize: vi.fn(),
  scaleFactor: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => nativeWindow,
}));

describe("native UI scale viewport", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([1, 1.25, 1.5, 2])("removes only OS DPI scaling at %s", async (dpi) => {
    nativeWindow.innerSize.mockResolvedValue(new PhysicalSize(1100 * dpi, 720 * dpi));
    nativeWindow.scaleFactor.mockResolvedValue(dpi);

    await expect(readNativeWindowSize()).resolves.toMatchObject({
      width: 1100,
      height: 720,
    });
    expect(nativeWindow.innerSize).toHaveBeenCalledOnce();
    expect(nativeWindow.scaleFactor).toHaveBeenCalledOnce();
  });

  it("propagates native read failures so the controller can retry", async () => {
    nativeWindow.innerSize.mockRejectedValue(new Error("window unavailable"));
    nativeWindow.scaleFactor.mockResolvedValue(1.5);
    await expect(readNativeWindowSize()).rejects.toThrow("window unavailable");
  });
});
