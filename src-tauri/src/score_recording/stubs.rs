use super::{ScoreRecordingEndResponse, ScoreRecordingStartRequest};

fn unsupported() -> String {
    "Score recording is only available on Windows.".to_string()
}

pub fn start_score_recording(
    _app: tauri::AppHandle,
    _request: ScoreRecordingStartRequest,
) -> Result<(), String> {
    Err(unsupported())
}

pub fn stop_score_recording(_session_id: u64) -> Result<ScoreRecordingEndResponse, String> {
    Err(unsupported())
}

pub fn cancel_score_recording(_session_id: u64) -> Result<ScoreRecordingEndResponse, String> {
    Err(unsupported())
}

pub fn stop_score_recording_for_shutdown() -> Result<(), String> {
    Ok(())
}
