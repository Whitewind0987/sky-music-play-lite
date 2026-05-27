import { invoke } from "@tauri-apps/api/core";

export function testRustCommand(): Promise<string> {
  return invoke<string>("test_rust_command");
}
