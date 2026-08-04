export type QueueWheelInput = {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
};

export type QueueWheelRoutingDecision = {
  blockBackground: boolean;
  scrollTopDelta: number;
};

const wheelDeltaLineHeight = 16;

export function getQueueWheelRoutingDecision(
  input: QueueWheelInput,
  viewportHeight: number,
): QueueWheelRoutingDecision {
  if (
    input.deltaY === 0 ||
    Math.abs(input.deltaY) <= Math.abs(input.deltaX)
  ) {
    return { blockBackground: false, scrollTopDelta: 0 };
  }

  const multiplier =
    input.deltaMode === 1
      ? wheelDeltaLineHeight
      : input.deltaMode === 2
        ? Math.max(1, viewportHeight)
        : 1;

  return {
    blockBackground: true,
    scrollTopDelta: input.deltaY * multiplier,
  };
}
