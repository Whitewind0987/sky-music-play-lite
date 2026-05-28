export type DryRunNoteSummary = {
  time: number;
  key: string;
};

export type DryRunResult = {
  note_count: number;
  first_note: DryRunNoteSummary | null;
  last_note: DryRunNoteSummary | null;
  status: string;
};
