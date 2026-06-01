use std::collections::HashMap;

use serde::{Deserialize, Serialize};

mod experimental_input;
use experimental_input::CandidateWindow;

#[derive(Debug, Deserialize)]
struct Note {
    time: f64,
    key: String,
}

#[derive(Debug, Serialize)]
struct DryRunNoteSummary {
    time: f64,
    key: String,
    mapped_key: String,
}

#[derive(Debug, Serialize)]
struct DryRunResult {
    note_count: usize,
    first_note: Option<DryRunNoteSummary>,
    last_note: Option<DryRunNoteSummary>,
    status: String,
}

#[tauri::command]
fn test_rust_command() -> String {
    "Rust command is working".to_string()
}

#[tauri::command]
fn dry_run_playback(
    notes: Vec<Note>,
    key_mapping: HashMap<String, String>,
) -> Result<DryRunResult, String> {
    if notes.is_empty() {
        return Err("Dry run needs at least one note.".to_string());
    }

    let first_note = notes
        .first()
        .map(|note| note_to_summary(note, &key_mapping));
    let last_note = notes.last().map(|note| note_to_summary(note, &key_mapping));

    Ok(DryRunResult {
        note_count: notes.len(),
        first_note,
        last_note,
        status: "received_notes_without_sending_keys".to_string(),
    })
}

fn note_to_summary(note: &Note, key_mapping: &HashMap<String, String>) -> DryRunNoteSummary {
    let preview_key = get_preview_key_name(&note.key);
    let mapped_key = key_mapping
        .get(&preview_key)
        .cloned()
        .unwrap_or_else(|| "".to_string());

    DryRunNoteSummary {
        time: note.time,
        key: note.key.clone(),
        mapped_key,
    }
}

fn get_preview_key_name(score_key: &str) -> String {
    if let Some(index) = score_key.rfind("Key") {
        let preview_key = &score_key[index..];
        let key_number = &preview_key[3..];

        if !key_number.is_empty()
            && key_number
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            return preview_key.to_string();
        }
    }

    score_key.to_string()
}

#[tauri::command]
fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
    experimental_input::list_candidate_windows()
}

#[tauri::command]
fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
    experimental_input::find_sky_window()
}

#[tauri::command]
fn send_test_key_to_window(hwnd: String, key: String) -> Result<String, String> {
    experimental_input::send_test_key_to_window(hwnd, key)
}

#[tauri::command]
fn send_foreground_key_group(keys: Vec<String>) -> Result<String, String> {
    experimental_input::send_foreground_key_group(keys)
}

#[tauri::command]
fn send_foreground_test_key(key: String) -> Result<String, String> {
    experimental_input::send_foreground_test_key(key)
}

#[tauri::command]
fn send_foreground_test_key_scancode(key: String) -> Result<String, String> {
    experimental_input::send_foreground_test_key_scancode(key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dry_run_playback,
            find_sky_window,
            list_candidate_windows,
            send_foreground_key_group,
            send_foreground_test_key,
            send_foreground_test_key_scancode,
            send_test_key_to_window,
            test_rust_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
