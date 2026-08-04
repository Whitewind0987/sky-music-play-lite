import { describe, expect, it } from "vitest";
import { getQueueWheelRoutingDecision } from "./queueWheel";

describe("queue wheel routing", () => {
  it("routes vertical pixel input to the queue and blocks the background", () => {
    expect(
      getQueueWheelRoutingDecision(
        { deltaMode: 0, deltaX: 0, deltaY: 24 },
        300,
      ),
    ).toEqual({ blockBackground: true, scrollTopDelta: 24 });
  });

  it("normalizes mouse-wheel line and page input", () => {
    expect(
      getQueueWheelRoutingDecision(
        { deltaMode: 1, deltaX: 0, deltaY: -3 },
        300,
      ).scrollTopDelta,
    ).toBe(-48);
    expect(
      getQueueWheelRoutingDecision(
        { deltaMode: 2, deltaX: 0, deltaY: 1 },
        280,
      ).scrollTopDelta,
    ).toBe(280);
  });

  it("does not hijack horizontal-only or primarily horizontal gestures", () => {
    expect(
      getQueueWheelRoutingDecision(
        { deltaMode: 0, deltaX: 30, deltaY: 0 },
        300,
      ),
    ).toEqual({ blockBackground: false, scrollTopDelta: 0 });
    expect(
      getQueueWheelRoutingDecision(
        { deltaMode: 0, deltaX: 30, deltaY: 10 },
        300,
      ),
    ).toEqual({ blockBackground: false, scrollTopDelta: 0 });
  });

  it("keeps vertical input contained even at a queue boundary", () => {
    const decision = getQueueWheelRoutingDecision(
      { deltaMode: 0, deltaX: 2, deltaY: 40 },
      300,
    );

    expect(decision.blockBackground).toBe(true);
    expect(decision.scrollTopDelta).toBe(40);
  });
});
