import { useCallback, useEffect, useRef, useState } from "react";
import type { LibrarySongId } from "../types/library";
import type { Song } from "../types/score";

type UsePlayerScoreVisualizationOptions = {
  currentSongId: LibrarySongId | null;
  currentSongIndex: number | null;
  preloadSong: (songIndex: number) => Promise<Song | null>;
};

export function usePlayerScoreVisualization({
  currentSongId,
  currentSongIndex,
  preloadSong,
}: UsePlayerScoreVisualizationOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadFailed, setHasLoadFailed] = useState(false);
  const [resolvedSong, setResolvedSong] = useState<Song | null>(null);
  const requestGenerationRef = useRef(0);
  const preloadSongRef = useRef(preloadSong);
  preloadSongRef.current = preloadSong;
  const canOpen = currentSongId !== null && currentSongIndex !== null;

  const close = useCallback(() => {
    requestGenerationRef.current += 1;
    setIsOpen(false);
    setIsLoading(false);
    setHasLoadFailed(false);
    setResolvedSong(null);
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
    if (!isOpen || currentSongId === null || currentSongIndex === null) {
      return;
    }

    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
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
  }, [currentSongId, currentSongIndex, isOpen]);

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

  return {
    canOpen,
    close,
    hasLoadFailed,
    isLoading,
    isOpen,
    open,
    resolvedSong,
  };
}
