import alwaysWithMeRaw from "./scores/always-with-me.json?raw";
import canonRaw from "./scores/canon.json?raw";
import exampleScoreRaw from "./scores/example-score.json?raw";

export type BuiltInScoreManifestEntry = {
  id: string;
  raw: string;
  sourceName: string;
  sourceUrl?: string;
  title?: string;
};

// Built-in score attribution: source project is SkyMusicPlay-for-Windows.
export const builtInScoreManifest: BuiltInScoreManifestEntry[] = [
  {
    id: "canon",
    raw: canonRaw,
    sourceName: "SkyMusicPlay-for-Windows",
    sourceUrl: "https://github.com/windhide/SkyMusicPlay-for-Windows",
    title: "Canon",
  },
  {
    id: "always-with-me",
    raw: alwaysWithMeRaw,
    sourceName: "SkyMusicPlay-for-Windows",
    sourceUrl: "https://github.com/windhide/SkyMusicPlay-for-Windows",
    title: "Always With Me",
  },
  {
    id: "example-score",
    raw: exampleScoreRaw,
    sourceName: "SkyMusicPlay Lite",
    title: "Example Score",
  },
];
