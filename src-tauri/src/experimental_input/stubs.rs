use super::CandidateWindow;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPlanEvent {
    pub time_ms: f64,
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackStartRequest {
    pub hwnd: String,
    pub compatibility_profile: String,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
    pub plan: Vec<BackgroundPlaybackPlanEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparePlanRequest {
    pub plan: Vec<BackgroundPlaybackPlanEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub hwnd: String,
    pub compatibility_profile: String,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackOptionsRequest {
    pub session_id: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackStartResponse {
    pub session_id: u64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparePlanResponse {
    pub prepared_plan_id: u64,
}

fn unsupported() -> String {
    "Experimental playback is only available on Windows.".to_string()
}

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

pub fn start_background_playback(
    _app_handle: tauri::AppHandle,
    _request: BackgroundPlaybackStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    Err(unsupported())
}

pub fn prepare_background_playback_plan(
    _request: BackgroundPlaybackPreparePlanRequest,
) -> Result<BackgroundPlaybackPreparePlanResponse, String> {
    Err(unsupported())
}

pub fn start_prepared_background_playback(
    _app_handle: tauri::AppHandle,
    _request: BackgroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    Err(unsupported())
}

pub fn start_prepared_foreground_playback(
    _app_handle: tauri::AppHandle,
    _request: ForegroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    Err(unsupported())
}

pub fn pause_background_playback(_session_id: u64) -> Result<(), String> {
    Err(unsupported())
}

pub fn resume_background_playback(_session_id: u64) -> Result<(), String> {
    Err(unsupported())
}

pub fn seek_background_playback(_session_id: u64, _time_ms: f64) -> Result<(), String> {
    Err(unsupported())
}

pub fn stop_background_playback(_session_id: u64) -> Result<(), String> {
    Err(unsupported())
}

pub fn update_background_playback_options(
    _request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    Err(unsupported())
}

pub fn pause_foreground_playback(session_id: u64) -> Result<(), String> {
    pause_background_playback(session_id)
}

pub fn resume_foreground_playback(session_id: u64) -> Result<(), String> {
    resume_background_playback(session_id)
}

pub fn seek_foreground_playback(session_id: u64, time_ms: f64) -> Result<(), String> {
    seek_background_playback(session_id, time_ms)
}

pub fn stop_foreground_playback(session_id: u64) -> Result<(), String> {
    stop_background_playback(session_id)
}

pub fn update_foreground_playback_options(
    request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    update_background_playback_options(request)
}

pub fn stop_current_background_playback_for_shutdown() {}
