import { useCallback, useEffect, useRef, useState } from "react";
import type { LibrarySongId } from "../types/library";
import type { Song } from "../types/score";

type UsePlayerScoreVisualizationOptions = {
  currentSongId: LibrarySongId | null;
  currentSongIndex: number | null;
  isInlinePreviewActive: boolean;
  preloadSong: (songIndex: number) => Promise<Song | null>;
};

export function usePlayerScoreVisualization({
  currentSongId,
  currentSongIndex,
  isInlinePreviewActive,
  preloadSong,
}: UsePlayerScoreVisualizationOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [resolvedSong, setResolvedSong] = useState<Song | null>(null);
  const [loadTargetSongId, setLoadTargetSongId] =
    useState<LibrarySongId | null>(null);
  const requestGenerationRef = useRef(0);
  const preloadSongRef = useRef(preloadSong);
  preloadSongRef.current = preloadSong;
  const canOpen = currentSongId !== null && currentSongIndex !== null;
  const shouldResolveSong = isOpen || isInlinePreviewActive;

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    if (currentSongId !== null && currentSongIndex !== null) {
      setIsOpen(true);
    }
  }, [currentSongId, currentSongIndex]);

  useEffect(() => {
    if (currentSongId === null || currentSongIndex === null) {
      close();
    }
  }, [close, currentSongId, currentSongIndex]);

  useEffect(() => {
    if (
      !shouldResolveSong ||
      currentSongId === null ||
      currentSongIndex === null
    ) {
      requestGenerationRef.current += 1;
      setIsLoading(false);
      setHasLoadFailed(false);
      setResolvedSong(null);
      setLoadTargetSongId(null);
      return;
    }

    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    setLoadTargetSongId(currentSongId);
    setIsLoading(true);
    setHasLoadFailed(false);
    setResolvedSong(null);

    void preloadSongRef.current(currentSongIndex)
      .then((song) => {
        if (requestGenerationRef.current !== requestGeneration) {
          return;
        }

        setResolvedSong(song);
        setHasLoadFailed(song === null);
      })
      .catch(() => {
        if (requestGenerationRef.current !== requestGeneration) {
          return;
        }

        setResolvedSong(null);
        setHasLoadFailed(true);
      })
      .finally(() => {
        if (requestGenerationRef.current === requestGeneration) {
          setIsLoading(false);
        }
      });

    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [currentSongId, currentSongIndex, shouldResolveSong]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"], .queue-panel') !== null
      ) {
        return;
      }

      close();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [close, isOpen]);

  const isCurrentSongLoad = loadTargetSongId === currentSongId;
  const hasCurrentSongToResolve =
    shouldResolveSong && currentSongId !== null && currentSongIndex !== null;

  return {
    canOpen,
    close,
    hasLoadFailed: isCurrentSongLoad && hasLoadFailed,
    isLoading:
      hasCurrentSongToResolve && (!isCurrentSongLoad || isLoading),
    isOpen,
    open,
    resolvedSong:
      isCurrentSongLoad && shouldResolveSong ? resolvedSong : null,
  };
}
