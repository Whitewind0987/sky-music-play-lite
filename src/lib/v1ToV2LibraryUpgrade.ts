import type {
  LibrarySong,
  LocalLibrarySong,
} from "../types/library";
import type { Song } from "../types/score";
import {
  createLocalSongMetadata,
  createLibrarySong as createDefaultLibrarySong,
  getLibrarySongName,
  getLibrarySongFormatVersion,
  getSongContentFingerprint,
} from "./libraryCollections";
import { formatText } from "./formatText";
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
  | {
      status: "duplicate";
      existingLibrarySong: LibrarySong;
    }
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
  loadExistingSong?: (
    songId: LibrarySong["id"],
  ) => Promise<Song | null>;
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

export function getV2UpgradeDuplicateNotice(
  existingLibrarySong: LibrarySong,
  template: string,
) {
  return formatText(template, {
    songName: getLibrarySongName(existingLibrarySong),
  });
}

export async function createV2LocalLibraryCopy({
  conversionOptions,
  createLibrarySong = createDefaultLibrarySong,
  getExistingLibrarySongs,
  isMutationBlocked,
  loadExistingSong,
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

  const convertedMetadata = createLocalSongMetadata(convertedSong);
  const convertedContentFingerprint =
    getSongContentFingerprint(convertedSong);

  for (const existingLibrarySong of getExistingLibrarySongs()) {
    if (
      existingLibrarySong.id === sourceSongId ||
      getLibrarySongFormatVersion(existingLibrarySong) !== 2
    ) {
      continue;
    }

    if (existingLibrarySong.source === "built-in") {
      if (
        existingLibrarySong.isBuiltInLoaded === true &&
        getSongContentFingerprint(existingLibrarySong.song) ===
          convertedContentFingerprint
      ) {
        return { existingLibrarySong, status: "duplicate" };
      }

      continue;
    }

    if (
      existingLibrarySong.metadata.contentFingerprint !== undefined
    ) {
      if (
        existingLibrarySong.metadata.contentFingerprint ===
        convertedContentFingerprint
      ) {
        return { existingLibrarySong, status: "duplicate" };
      }

      continue;
    }

    if (
      loadExistingSong === undefined ||
      !couldMatchV2ContentByMetadata(
        existingLibrarySong,
        convertedMetadata,
      )
    ) {
      continue;
    }

    try {
      const existingSong = await loadExistingSong(
        existingLibrarySong.id,
      );

      if (
        existingSong !== null &&
        getSongContentFingerprint(existingSong) ===
          convertedContentFingerprint
      ) {
        return { existingLibrarySong, status: "duplicate" };
      }
    } catch {
      // A stale or unreadable candidate must not block creation.
    }
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

function couldMatchV2ContentByMetadata(
  existingLibrarySong: LocalLibrarySong,
  convertedMetadata: LocalLibrarySong["metadata"],
) {
  const existingMetadata = existingLibrarySong.metadata;

  if (
    existingMetadata.bpm !== convertedMetadata.bpm ||
    existingMetadata.bitsPerPage !== convertedMetadata.bitsPerPage ||
    existingMetadata.pitchLevel !== convertedMetadata.pitchLevel ||
    existingMetadata.isComposed !== convertedMetadata.isComposed ||
    existingMetadata.noteCount !== convertedMetadata.noteCount ||
    existingMetadata.noteGroupCount !== convertedMetadata.noteGroupCount ||
    existingMetadata.lastNoteTimeMs !== convertedMetadata.lastNoteTimeMs
  ) {
    return false;
  }

  return (
    optionalNumberMatches(
      existingMetadata.sustainTailMs,
      convertedMetadata.sustainTailMs,
    ) &&
    optionalNumberArrayMatches(
      existingMetadata.noteGroupDelaysMs,
      convertedMetadata.noteGroupDelaysMs,
    ) &&
    optionalNumberArrayMatches(
      existingMetadata.noteGroupMaxHoldMs,
      convertedMetadata.noteGroupMaxHoldMs,
    )
  );
}

function optionalNumberMatches(
  existingValue: number | undefined,
  convertedValue: number | undefined,
) {
  return existingValue === undefined || existingValue === convertedValue;
}

function optionalNumberArrayMatches(
  existingValues: number[] | undefined,
  convertedValues: number[] | undefined,
) {
  return (
    existingValues === undefined ||
    (convertedValues !== undefined &&
      existingValues.length === convertedValues.length &&
      existingValues.every(
        (value, index) => value === convertedValues[index],
      ))
  );
}
