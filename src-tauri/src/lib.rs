mod app_data;
mod app_log;
mod experimental_input;
use experimental_input::CandidateWindow;

#[tauri::command]
fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
    experimental_input::list_candidate_windows()
}

#[tauri::command]
fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
    experimental_input::find_sky_window()
}

#[tauri::command]
fn send_key_group_to_window_message(
    hwnd: String,
    keys: Vec<String>,
    method: String,
    compatibility_profile: String,
    key_hold_ms: u64,
) -> Result<String, String> {
    experimental_input::send_key_group_to_window_message(
        hwnd,
        keys,
        method,
        compatibility_profile,
        key_hold_ms,
    )
}

#[tauri::command]
fn send_foreground_key_group(keys: Vec<String>) -> Result<String, String> {
    experimental_input::send_foreground_key_group(keys)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            find_sky_window,
            app_data::load_app_data,
            app_log::append_app_log,
            app_log::get_app_runtime_info,
            app_log::open_log_directory,
            list_candidate_windows,
            app_data::save_app_data,
            send_foreground_key_group,
            send_key_group_to_window_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
