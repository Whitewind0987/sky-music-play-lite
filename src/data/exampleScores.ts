import type { Song } from "../types/score";

export const exampleScores: Song[] = [
  {
    name: "demo",
    bpm: 200,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [
      { time: 862, key: "1Key5" },
      { time: 1210, key: "1Key6" },
      { time: 1558, key: "1Key7" },
      { time: 1906, key: "2Key1" },
    ],
  },
  {
    name: "simple-scale",
    bpm: 120,
    bitsPerPage: 16,
    pitchLevel: 0,
    isComposed: false,
    songNotes: [
      { time: 0, key: "1Key1" },
      { time: 500, key: "1Key2" },
      { time: 1000, key: "1Key3" },
      { time: 1500, key: "1Key4" },
      { time: 2000, key: "1Key5" },
    ],
  },
];
