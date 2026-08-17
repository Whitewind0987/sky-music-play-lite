type CenteredScrollTopOptions = {
  containerClientHeight: number;
  containerScrollHeight: number;
  currentScrollTop: number;
  targetHeight: number;
  targetTopRelativeToContainer: number;
};

export function calculateCenteredScrollTop({
  containerClientHeight,
  containerScrollHeight,
  currentScrollTop,
  targetHeight,
  targetTopRelativeToContainer,
}: CenteredScrollTopOptions): number {
  const targetContentTop = currentScrollTop + targetTopRelativeToContainer;
  const centeredScrollTop =
    targetContentTop + targetHeight / 2 - containerClientHeight / 2;
  const maximumScrollTop = Math.max(
    0,
    containerScrollHeight - containerClientHeight,
  );

  return Math.min(maximumScrollTop, Math.max(0, centeredScrollTop));
}
