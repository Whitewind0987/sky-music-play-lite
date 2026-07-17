import type {
  LibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { Song } from "../types/score";
import {
  createLibrarySong as createDefaultLibrarySong,
  getLibrarySongFingerprint,
  getSongFingerprint,
  hasReliableDuplicateFingerprint,
} from "./libraryCollections";
import {
  convertV1SongToV2,
  type V1ToV2ConversionOptions,
} from "./v1ToV2Conversion";
import type { SustainMelodyGenerationPlan } from "./sustainMelodyGeneration";

type CreateLibrarySong = (song: Song) => LocalLibrarySong;

export type CreateV2LibraryCopyResult =
  | {
      status: "created";
      librarySong: LocalLibrarySong;
      song: Song;
    }
  | { status: "duplicate" }
  | {
      status: "failed";
      reason: "blocked" | "source-load" | "conversion" | "storage";
      error?: unknown;
    };

type CreateTransformedLibraryCopyOptions = {
  createLibrarySong?: CreateLibrarySong;
  getExistingLibrarySongs: () => LibrarySong[];
  loadSourceSong: () => Promise<Song | null>;
  isMutationBlocked?: () => boolean;
  saveImportedScoreSong: (
    songId: LocalLibrarySong["id"],
    song: Song,
  ) => Promise<unknown>;
  seedImportedScoreSong: (
    songId: LocalLibrarySong["id"],
    song: Song,
  ) => void;
  sourceSongId: LibrarySong["id"];
  transform: (sourceSong: Song) => Song;
};

type CreateV2LibraryCopyOptions = Omit<
  CreateTransformedLibraryCopyOptions,
  "transform"
> & {
  conversionOptions: V1ToV2ConversionOptions;
};

type CreateSustainMelodyLibraryCopyOptions = Omit<
  CreateTransformedLibraryCopyOptions,
  "transform"
> & {
  generationPlan: SustainMelodyGenerationPlan;
};

export function getCreatedV2LibraryCopyState(
  currentLocalSongs: LocalLibrarySong[],
  createdLibrarySong: LocalLibrarySong,
) {
  return {
    localLibrarySongs: [...currentLocalSongs, createdLibrarySong],
    locateSongId: createdLibrarySong.id,
    searchQuery: "",
    selectedCategory: "local-imports" as const,
    selectedSongId: createdLibrarySong.id,
  };
}

export async function createV2LocalLibraryCopy({
  conversionOptions,
  ...options
}: CreateV2LibraryCopyOptions): Promise<CreateV2LibraryCopyResult> {
  return createTransformedLocalLibraryCopy({
    ...options,
    transform: (sourceSong) =>
      convertV1SongToV2(sourceSong, conversionOptions),
  });
}

export async function createSustainMelodyLocalLibraryCopy({
  generationPlan,
  ...options
}: CreateSustainMelodyLibraryCopyOptions): Promise<CreateV2LibraryCopyResult> {
  return createTransformedLocalLibraryCopy({
    ...options,
    transform: () => generationPlan.generatedSong,
  });
}

export async function createTransformedLocalLibraryCopy({
  createLibrarySong = createDefaultLibrarySong,
  getExistingLibrarySongs,
  isMutationBlocked,
  loadSourceSong,
  saveImportedScoreSong,
  seedImportedScoreSong,
  sourceSongId,
  transform,
}: CreateTransformedLibraryCopyOptions): Promise<CreateV2LibraryCopyResult> {
  if (isMutationBlocked?.()) {
    return { reason: "blocked", status: "failed" };
  }

  let sourceSong: Song | null;

  try {
    sourceSong = await loadSourceSong();
  } catch (error) {
    return { error, reason: "source-load", status: "failed" };
  }

  if (sourceSong === null) {
    return { reason: "source-load", status: "failed" };
  }

  let convertedSong: Song;

  try {
    convertedSong = transform(sourceSong);
  } catch (error) {
    return { error, reason: "conversion", status: "failed" };
  }

  const convertedFingerprint = getSongFingerprint(convertedSong);
  const isDuplicate = getExistingLibrarySongs()
    .filter((librarySong) => librarySong.id !== sourceSongId)
    .filter(hasReliableDuplicateFingerprint)
    .some(
      (librarySong) =>
        getLibrarySongFingerprint(librarySong) === convertedFingerprint,
    );

  if (isDuplicate) {
    return { status: "duplicate" };
  }

  const librarySong = createLibrarySong(convertedSong);

  if (isMutationBlocked?.()) {
    return { reason: "blocked", status: "failed" };
  }

  try {
    await saveImportedScoreSong(librarySong.id, convertedSong);
  } catch (error) {
    return { error, reason: "storage", status: "failed" };
  }

  seedImportedScoreSong(librarySong.id, convertedSong);

  return { librarySong, song: convertedSong, status: "created" };
}
