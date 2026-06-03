const builtInScoreSourceName = "SkyMusicPlay-for-Windows";
const builtInScoreSourceUrl = "https://github.com/windhide/SkyMusicPlay-for-Windows";

const scoreModules = import.meta.glob("./scores/*.{json,txt}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type BuiltInScoreManifestEntry = {
  id: string;
  raw: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
};

// Built-in score attribution: source project is SkyMusicPlay-for-Windows.
export const builtInScoreManifest: BuiltInScoreManifestEntry[] =
  buildBuiltInScoreManifest();

function buildBuiltInScoreManifest(): BuiltInScoreManifestEntry[] {
  const usedIds = new Set<string>();

  return Object.entries(scoreModules)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([filePath, raw]) => {
      const baseId = buildStableScoreId(filePath);
      const id = usedIds.has(baseId)
        ? `${baseId}-${hashFilePath(filePath)}`
        : baseId;

      usedIds.add(id);

      return {
        id,
        raw,
        sourceName: builtInScoreSourceName,
        sourceUrl: builtInScoreSourceUrl,
        title: buildScoreTitle(filePath),
      };
    })
    .sort((leftEntry, rightEntry) => leftEntry.title.localeCompare(rightEntry.title));
}

function buildStableScoreId(filePath: string) {
  const id = stripScorePathAndExtension(filePath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return id || `score-${hashFilePath(filePath)}`;
}

function buildScoreTitle(filePath: string) {
  return (
    stripScorePathAndExtension(filePath)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled Score"
  );
}

function stripScorePathAndExtension(filePath: string) {
  return filePath
    .replace(/^\.\/scores\//, "")
    .replace(/\.(json|txt)$/i, "");
}

function hashFilePath(filePath: string) {
  let hash = 0;

  for (let index = 0; index < filePath.length; index += 1) {
    hash = (hash * 31 + filePath.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
