import { promises as fs } from "node:fs";
import path from "node:path";

const sourceName = "SkyMusicPlay-for-Windows";
const sourceUrl = "https://github.com/windhide/SkyMusicPlay-for-Windows";
const projectRoot = process.cwd();
const scoreDirectory = path.join(projectRoot, "public", "builtin-scores", "scores");
const indexPath = path.join(projectRoot, "public", "builtin-scores", "index.json");

function readFlexibleNumber(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const parsedValue = Number(trimmedValue);

    if (trimmedValue.length > 0 && Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function readFlexibleBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return null;
}

function isValidObjectNotes(songNotes) {
  return (
    Array.isArray(songNotes) &&
    songNotes.every((note) => {
      if (typeof note !== "object" || note === null || Array.isArray(note)) {
        return false;
      }

      return (
        readFlexibleNumber(note.time, null) !== null &&
        typeof note.key === "string"
      );
    })
  );
}

function createEntry({ fileName, song, songIndex }) {
  const bpm = readFlexibleNumber(song.bpm, 120);
  const bitsPerPage = readFlexibleNumber(song.bitsPerPage, 16);
  const pitchLevel = readFlexibleNumber(song.pitchLevel, 0);
  const isComposed = readFlexibleBoolean(song.isComposed, false);
  const fileBaseId = path.basename(fileName, path.extname(fileName));

  if (
    typeof song.name !== "string" ||
    bpm === null ||
    bitsPerPage === null ||
    pitchLevel === null ||
    isComposed === null ||
    song.isEncrypted === true ||
    !Array.isArray(song.songNotes) ||
    typeof song.songNotes[0] === "number" ||
    !isValidObjectNotes(song.songNotes)
  ) {
    return null;
  }

  return {
    id: `builtin:${fileBaseId}:${songIndex}`,
    title: song.name,
    fileName,
    songIndex,
    bpm,
    bitsPerPage,
    pitchLevel,
    isComposed,
  };
}

async function main() {
  const fileNames = (await fs.readdir(scoreDirectory))
    .filter((fileName) => /\.(json|txt)$/i.test(fileName))
    .sort((leftName, rightName) => leftName.localeCompare(rightName));
  const entries = [];
  let skippedFileCount = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(scoreDirectory, fileName);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const songs = JSON.parse(raw);

      if (!Array.isArray(songs) || songs.length === 0) {
        skippedFileCount += 1;
        continue;
      }

      const fileEntries = songs
        .map((song, songIndex) => createEntry({ fileName, song, songIndex }))
        .filter(Boolean);

      if (fileEntries.length === 0) {
        skippedFileCount += 1;
        continue;
      }

      entries.push(...fileEntries);
    } catch {
      skippedFileCount += 1;
    }
  }

  const index = {
    sourceName,
    sourceUrl,
    generatedAt: new Date().toISOString(),
    entries,
  };

  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.info("[built-in-scores] generated index", {
    fileCount: fileNames.length,
    skippedFileCount,
    songCount: entries.length,
  });
}

await main();
