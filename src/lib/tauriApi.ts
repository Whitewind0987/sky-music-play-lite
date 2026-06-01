import { invoke } from "@tauri-apps/api/core";
import type { CandidateWindow } from "../types/experimentalInput";
import type { KeyMapping } from "../types/keyMapping";
import type { DryRunResult } from "../types/playbackDryRun";
import type { Note } from "../types/score";

export function testRustCommand(): Promise<string> {
  return invoke<string>("test_rust_command");
}

export function dryRunPlayback(
  notes: Note[],
  keyMapping: KeyMapping,
): Promise<DryRunResult> {
  return invoke<DryRunResult>("dry_run_playback", { keyMapping, notes });
}

export function listCandidateWindows(): Promise<CandidateWindow[]> {
  return invoke<CandidateWindow[]>("list_candidate_windows");
}

export function findSkyWindow(): Promise<CandidateWindow | null> {
  return invoke<CandidateWindow | null>("find_sky_window");
}

export function sendTestKeyToWindow(
  hwnd: string,
  key: string,
): Promise<string> {
  return invoke<string>("send_test_key_to_window", { hwnd, key });
}

export function sendMappedKeyToWindow(
  hwnd: string,
  key: string,
): Promise<string> {
  return sendTestKeyToWindow(hwnd, key);
}

export function sendForegroundKeyGroup(keys: string[]): Promise<string> {
  return invoke<string>("send_foreground_key_group", { keys });
}
