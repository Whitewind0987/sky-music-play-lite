type ManualStepPointerGestureOptions = {
  onBegin: (pointerId: number) => void;
  onEnd: (pointerId: number) => void;
  onHeldChange: (held: boolean) => void;
  onKeyboardStep: () => void;
};

export function createManualStepPointerGesture({
  onBegin,
  onEnd,
  onHeldChange,
  onKeyboardStep,
}: ManualStepPointerGestureOptions) {
  let pointerId: number | null = null;
  let suppressPointerClick = false;

  function finish({ preserveClickSuppression }: {
    preserveClickSuppression: boolean;
  }) {
    const finishedPointerId = pointerId;
    if (finishedPointerId === null) return false;
    pointerId = null;
    onHeldChange(false);
    onEnd(finishedPointerId);
    if (!preserveClickSuppression) suppressPointerClick = false;
    return true;
  }

  return {
    begin(nextPointerId: number) {
      if (pointerId !== null) return false;
      pointerId = nextPointerId;
      suppressPointerClick = true;
      onHeldChange(true);
      onBegin(nextPointerId);
      return true;
    },

    cancel(nextPointerId: number) {
      if (pointerId !== nextPointerId) return false;
      return finish({ preserveClickSuppression: false });
    },

    consumeClick(isPointerClick: boolean) {
      if (isPointerClick && suppressPointerClick) {
        suppressPointerClick = false;
        return false;
      }
      onKeyboardStep();
      return true;
    },

    dispose() {
      finish({ preserveClickSuppression: false });
    },

    end(nextPointerId: number) {
      if (pointerId !== nextPointerId) return false;
      return finish({ preserveClickSuppression: true });
    },

    terminate() {
      return finish({ preserveClickSuppression: true });
    },
  };
}
