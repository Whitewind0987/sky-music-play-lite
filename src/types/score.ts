export type Note = {
  time: number;
  key: string;
};

export type Song = {
  name: string;
  bpm: number;
  bitsPerPage: number;
  pitchLevel: number;
  isComposed: boolean;
  songNotes: Note[];
};
