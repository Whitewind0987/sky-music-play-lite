import { useCallback, useRef } from "react";
import {
  PreparedPlaybackPlanCache,
  serializePreparedPlanCacheKey,
  type PreparedPlaybackPlanCacheKey,
} from "../lib/backgroundPlaybackPlanCache";
import {
  PlaybackPreparationScheduler,
  type PlaybackPreparationPriority,
} from "../lib/playbackPreparationScheduler";
import { prepareMappedKeyboardKeyGroups } from "../lib/scoreKeyMapping";
import {
  prepareBackgroundPlaybackPlan,
  type BackgroundPlaybackPlanEvent,
} from "../lib/tauriApi";
import type { KeyMapping } from "../types/keyMapping";
import type { Song } from "../types/score";

export type PreparedPlaybackPlan = {
  cacheKey: PreparedPlaybackPlanCacheKey;
  preparedPlanId: number;
  song: Song;
};

type UsePlaybackPlanPreparationOptions = {
  getSongIdentityForPlayback: (songIndex: number) => string | null;
  keyMapping: KeyMapping;
  resolveSongForPlayback: (songIndex: number) => Promise<Song | null>;
};

export function usePlaybackPlanPreparation({
  getSongIdentityForPlayback,
  keyMapping,
  resolveSongForPlayback,
}: UsePlaybackPlanPreparationOptions) {
  const cacheRef = useRef(new PreparedPlaybackPlanCache());
  const schedulerRef = useRef(new PlaybackPreparationScheduler());

  const getOrPreparePlaybackPlan = useCallback(
    async ({
      priority,
      resolvedSong,
      songIndex,
    }: {
      priority: PlaybackPreparationPriority;
      resolvedSong?: Song | null;
      songIndex: number;
    }): Promise<PreparedPlaybackPlan> => {
      const songIdentity = getSongIdentityForPlayback(songIndex);

      if (songIdentity === null) {
        throw new Error("Score identity is unavailable for playback preparation.");
      }

      const cacheKey = {
        keyMappingSignature: getKeyMappingSignature(keyMapping),
        songIdentity,
      };
      const schedulerKey = serializePreparedPlanCacheKey(cacheKey);
      const song =
        resolvedSong ??
        (priority === "warm"
          ? null
          : await resolveSongForPlayback(songIndex));

      if (!song || song.songNotes.length === 0) {
        throw new Error("Score could not be prepared for real playback.");
      }

      const preparedPlanId = await schedulerRef.current.schedule(
        schedulerKey,
        priority,
        async () => {
          const cachedPreparedPlanId = cacheRef.current.get(cacheKey);

          if (cachedPreparedPlanId !== null) {
            return cachedPreparedPlanId;
          }

          const prepared = await cacheRef.current.getOrPrepare(cacheKey, async () => {
            const response = await prepareBackgroundPlaybackPlan({
              plan: buildPlaybackPlan(song.songNotes, keyMapping),
            });

            return response.preparedPlanId;
          });

          return prepared.preparedPlanId;
        },
      );

      return { cacheKey, preparedPlanId, song };
    },
    [getSongIdentityForPlayback, keyMapping, resolveSongForPlayback],
  );

  const invalidatePlaybackPlan = useCallback(
    (cacheKey: PreparedPlaybackPlanCacheKey) => {
      cacheRef.current.invalidate(cacheKey);
    },
    [],
  );

  return { getOrPreparePlaybackPlan, invalidatePlaybackPlan };
}

function buildPlaybackPlan(
  notes: Song["songNotes"],
  keyMapping: KeyMapping,
): BackgroundPlaybackPlanEvent[] {
  return Array.from(
    prepareMappedKeyboardKeyGroups(notes, keyMapping),
    ([timeMs, keys]) => ({ keys, timeMs }),
  );
}

function getKeyMappingSignature(keyMapping: KeyMapping) {
  return Object.entries(keyMapping)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${value.trim()}`)
    .join("|");
}
