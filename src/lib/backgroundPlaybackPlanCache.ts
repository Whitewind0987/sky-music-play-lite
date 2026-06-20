export type PreparedPlaybackPlanCacheKey = {
  keyMappingSignature: string;
  songIdentity: string;
};

export type PreparedPlaybackPlanCacheResult = {
  preparedPlanId: number;
  source: "cache" | "prepared";
};

type CacheEntry = {
  key: string;
  preparedPlanId: number;
};

export class PreparedPlaybackPlanCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlightPreparations = new Map<string, Promise<number>>();
  private readonly maxEntries: number;

  constructor({ maxEntries = 32 }: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get size() {
    return this.entries.size;
  }

  clearSong(songIdentity: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${songIdentity}\u0000`)) {
        this.entries.delete(key);
      }
    }
  }

  async getOrPrepare(
    cacheKey: PreparedPlaybackPlanCacheKey,
    prepare: () => Promise<number>,
  ): Promise<PreparedPlaybackPlanCacheResult> {
    const key = serializePreparedPlanCacheKey(cacheKey);
    const cached = this.entries.get(key);

    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { preparedPlanId: cached.preparedPlanId, source: "cache" };
    }

    const existingPreparation = this.inFlightPreparations.get(key);

    if (existingPreparation) {
      return {
        preparedPlanId: await existingPreparation,
        source: "prepared",
      };
    }

    const preparation = prepare();
    this.inFlightPreparations.set(key, preparation);

    try {
      const preparedPlanId = await preparation;

      this.entries.set(key, { key, preparedPlanId });
      this.trim();

      return { preparedPlanId, source: "prepared" };
    } finally {
      this.inFlightPreparations.delete(key);
    }
  }

  private trim() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;

      if (oldestKey === undefined) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }
}

export function serializePreparedPlanCacheKey({
  keyMappingSignature,
  songIdentity,
}: PreparedPlaybackPlanCacheKey) {
  return `${songIdentity}\u0000${keyMappingSignature}`;
}
