import { invoke } from "@tauri-apps/api/core";
import type { DryRunResult } from "../types/playbackDryRun";
import type { Note } from "../types/score";

export function testRustCommand(): Promise<string> {
  return invoke<string>("test_rust_command");
}

export function dryRunPlayback(notes: Note[]): Promise<DryRunResult> {
  return invoke<DryRunResult>("dry_run_playback", { notes });
}
