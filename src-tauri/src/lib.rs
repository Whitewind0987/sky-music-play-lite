mod app_data;
mod app_log;
mod app_window;
mod experimental_input;
mod imported_scores;
mod window_state;
use experimental_input::{
    BackgroundPlaybackOptionsRequest, BackgroundPlaybackPreparePlanRequest,
    BackgroundPlaybackPreparePlanResponse, BackgroundPlaybackPreparedStartRequest,
    BackgroundPlaybackStartRequest, BackgroundPlaybackStartResponse, CandidateWindow,
    ForegroundPlaybackPreparedStartRequest,
};

#[tauri::command]
fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
    experimental_input::list_candidate_windows()
}

#[tauri::command]
fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
    experimental_input::find_sky_window()
}

#[tauri::command]
fn get_sky_window_monitor_state() -> Result<experimental_input::SkyWindowMonitorSnapshot, String> {
    experimental_input::get_sky_window_monitor_state()
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

#[tauri::command]
fn start_background_playback(
    app: tauri::AppHandle,
    request: BackgroundPlaybackStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    experimental_input::start_background_playback(app, request)
}

#[tauri::command]
fn prepare_background_playback_plan(
    request: BackgroundPlaybackPreparePlanRequest,
) -> Result<BackgroundPlaybackPreparePlanResponse, String> {
    experimental_input::prepare_background_playback_plan(request)
}

#[tauri::command]
fn start_prepared_background_playback(
    app: tauri::AppHandle,
    request: BackgroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    experimental_input::start_prepared_background_playback(app, request)
}

#[tauri::command]
fn start_prepared_foreground_playback(
    app: tauri::AppHandle,
    request: ForegroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    experimental_input::start_prepared_foreground_playback(app, request)
}

#[tauri::command]
fn pause_background_playback(session_id: u64) -> Result<(), String> {
    experimental_input::pause_background_playback(session_id)
}

#[tauri::command]
fn pause_foreground_playback(session_id: u64) -> Result<(), String> {
    experimental_input::pause_foreground_playback(session_id)
}

#[tauri::command]
fn resume_background_playback(session_id: u64) -> Result<(), String> {
    experimental_input::resume_background_playback(session_id)
}

#[tauri::command]
fn resume_foreground_playback(session_id: u64) -> Result<(), String> {
    experimental_input::resume_foreground_playback(session_id)
}

#[tauri::command]
fn stop_background_playback(session_id: u64) -> Result<(), String> {
    experimental_input::stop_background_playback(session_id)
}

#[tauri::command]
fn stop_foreground_playback(session_id: u64) -> Result<(), String> {
    experimental_input::stop_foreground_playback(session_id)
}

#[tauri::command]
fn seek_background_playback(session_id: u64, time_ms: f64) -> Result<(), String> {
    experimental_input::seek_background_playback(session_id, time_ms)
}

#[tauri::command]
fn seek_foreground_playback(session_id: u64, time_ms: f64) -> Result<(), String> {
    experimental_input::seek_foreground_playback(session_id, time_ms)
}

#[tauri::command]
fn update_background_playback_options(
    request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    experimental_input::update_background_playback_options(request)
}

#[tauri::command]
fn update_foreground_playback_options(
    request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    experimental_input::update_foreground_playback_options(request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            window_state::initialize(app.handle())
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            if let Err(error) = experimental_input::start_sky_window_monitor(app.handle().clone()) {
                let _ = app_log::append_internal_log(
                    app.handle(),
                    "warn",
                    "sky-window-monitor",
                    "Sky window lifecycle monitor failed to start",
                    Some(serde_json::json!({ "error": error })),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            find_sky_window,
            get_sky_window_monitor_state,
            app_data::load_app_data,
            app_log::append_app_log,
            app_log::get_app_runtime_info,
            app_log::open_log_directory,
            app_window::force_close_app,
            imported_scores::clear_imported_score_files,
            imported_scores::delete_imported_score_file,
            imported_scores::ensure_imported_scores_directory,
            imported_scores::imported_score_file_exists,
            imported_scores::list_imported_score_files,
            imported_scores::migrate_imported_score_storage,
            imported_scores::open_imported_scores_directory,
            imported_scores::read_imported_score_song,
            imported_scores::reconcile_imported_score_files,
            imported_scores::resolve_imported_scores_directory,
            imported_scores::save_imported_score_song,
            list_candidate_windows,
            pause_background_playback,
            pause_foreground_playback,
            prepare_background_playback_plan,
            resume_background_playback,
            resume_foreground_playback,
            app_data::save_app_data,
            seek_background_playback,
            seek_foreground_playback,
            send_foreground_key_group,
            send_key_group_to_window_message,
            start_background_playback,
            start_prepared_background_playback,
            start_prepared_foreground_playback,
            stop_background_playback,
            stop_foreground_playback,
            update_background_playback_options,
            update_foreground_playback_options
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
