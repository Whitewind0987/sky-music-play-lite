import { useEffect, type RefObject } from "react";

// Reports whether the element is visible inside its `.app-layout` scroll root.
// The library scrolls inside `.app-layout`, not the window, so the observer
// must use that container as its root.
export function useLibraryToolbarVisibility(
  targetRef: RefObject<HTMLElement | null>,
  onVisibilityChange: ((isVisible: boolean) => void) | undefined,
) {
  useEffect(() => {
    const target = targetRef.current;

    if (!target || !onVisibilityChange) {
      return;
    }

    const root = target.closest(".app-layout");

    if (!(root instanceof HTMLElement) || !("IntersectionObserver" in window)) {
      onVisibilityChange(true);
      return;
    }

    // Hysteresis: the toolbar counts as gone only when fully hidden, and
    // returns as soon as any part of it is visible again. This avoids
    // flicker at the boundary without a hardcoded scroll offset.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onVisibilityChange(entry.isIntersecting);
      },
      { root, threshold: 0 },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
      onVisibilityChange(true);
    };
  }, [onVisibilityChange, targetRef]);
}
