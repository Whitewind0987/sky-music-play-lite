use super::CandidateWindow;

pub fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
    Err("Experimental window detection is only available on Windows.".to_string())
}

pub fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
    Err("Experimental window detection is only available on Windows.".to_string())
}

pub fn send_key_group_to_window_message(
    _hwnd: String,
    _keys: Vec<String>,
    _method: String,
    _compatibility_profile: String,
    _key_hold_ms: u64,
) -> Result<String, String> {
    Err("Experimental target-window input is only available on Windows.".to_string())
}

pub fn send_foreground_key_group(_keys: Vec<String>) -> Result<String, String> {
    Err("Experimental foreground input is only available on Windows.".to_string())
}
