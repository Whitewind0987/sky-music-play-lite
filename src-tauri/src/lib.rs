use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct Note {
    time: f64,
    key: String,
}

#[derive(Debug, Serialize)]
struct DryRunNoteSummary {
    time: f64,
    key: String,
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
fn dry_run_playback(notes: Vec<Note>) -> Result<DryRunResult, String> {
    if notes.is_empty() {
        return Err("Dry run needs at least one note.".to_string());
    }

    let first_note = notes.first().map(note_to_summary);
    let last_note = notes.last().map(note_to_summary);

    Ok(DryRunResult {
        note_count: notes.len(),
        first_note,
        last_note,
        status: "Rust dry run received notes without sending keys.".to_string(),
    })
}

fn note_to_summary(note: &Note) -> DryRunNoteSummary {
    DryRunNoteSummary {
        time: note.time,
        key: note.key.clone(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dry_run_playback,
            test_rust_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
