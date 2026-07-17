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

type CreateV2LibraryCopyOptions = {
  conversionOptions: V1ToV2ConversionOptions;
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
  createLibrarySong = createDefaultLibrarySong,
  getExistingLibrarySongs,
  isMutationBlocked,
  loadSourceSong,
  saveImportedScoreSong,
  seedImportedScoreSong,
  sourceSongId,
}: CreateV2LibraryCopyOptions): Promise<CreateV2LibraryCopyResult> {
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
    convertedSong = convertV1SongToV2(sourceSong, conversionOptions);
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
