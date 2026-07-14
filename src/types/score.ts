export type Note = {
  time: number;
  key: string;
  duration?: number;
};

export type Song = {
  formatVersion?: 1 | 2;
  name: string;
  bpm: number;
  bitsPerPage: number;
  pitchLevel: number;
  isComposed: boolean;
  songNotes: Note[];
};
