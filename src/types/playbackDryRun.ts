export type DryRunNoteSummary = {
  time: number;
  key: string;
  mapped_key: string;
};

export type DryRunResult = {
  note_count: number;
  first_note: DryRunNoteSummary | null;
  last_note: DryRunNoteSummary | null;
  status: "received_notes_without_sending_keys";
};
