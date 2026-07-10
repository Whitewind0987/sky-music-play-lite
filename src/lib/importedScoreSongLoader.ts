import type { LibrarySongId } from "../types/library";
import type { Song } from "../types/score";
import { InFlightByKey } from "./inFlightByKey";

type LoadImportedScoreSong = (songId: LibrarySongId) => Promise<Song>;

export class ImportedScoreSongLoader {
  private readonly cachedSongs = new Map<LibrarySongId, Song>();
  private readonly generations = new Map<LibrarySongId, number>();
  private readonly inFlightLoads = new InFlightByKey<Song | null>();
  private clearGeneration = 0;

  load(
    songId: LibrarySongId,
    loadImportedScoreSong: LoadImportedScoreSong,
  ): Promise<Song | null> {
    const cachedSong = this.cachedSongs.get(songId);

    if (cachedSong) {
      return Promise.resolve(cachedSong);
    }

    const generation = this.getGeneration(songId);
    const loadKey = this.buildLoadKey(songId, generation);
    const { promise } = this.inFlightLoads.getOrStart(loadKey, async () => {
      const song = await loadImportedScoreSong(songId);

      if (!this.isGenerationCurrent(songId, generation)) {
        return null;
      }

      this.cachedSongs.set(songId, song);
      return song;
    });

    return promise;
  }

  seed(songId: LibrarySongId, song: Song) {
    this.bumpSongGeneration(songId);
    this.cachedSongs.set(songId, song);
  }

  invalidate(songId: LibrarySongId) {
    this.bumpSongGeneration(songId);
    this.cachedSongs.delete(songId);
  }

  clear() {
    this.clearGeneration += 1;
    this.cachedSongs.clear();
  }

  getCachedSong(songId: LibrarySongId) {
    return this.cachedSongs.get(songId) ?? null;
  }

  private getGeneration(songId: LibrarySongId) {
    return {
      all: this.clearGeneration,
      song: this.generations.get(songId) ?? 0,
    };
  }

  private isGenerationCurrent(
    songId: LibrarySongId,
    generation: { all: number; song: number },
  ) {
    const currentGeneration = this.getGeneration(songId);

    return (
      currentGeneration.all === generation.all &&
      currentGeneration.song === generation.song
    );
  }

  private bumpSongGeneration(songId: LibrarySongId) {
    this.generations.set(songId, (this.generations.get(songId) ?? 0) + 1);
  }

  private buildLoadKey(
    songId: LibrarySongId,
    generation: { all: number; song: number },
  ) {
    return `${generation.all}:${generation.song}:${songId}`;
  }
}
