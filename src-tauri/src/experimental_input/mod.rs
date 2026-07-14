use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CandidateWindow {
    pub hwnd: String,
    pub title: String,
    pub class_name: String,
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
}

#[cfg(windows)]
mod background_playback;
#[cfg(windows)]
mod foreground_input;
#[cfg(windows)]
mod key_mapping;
#[cfg(windows)]
mod playback_engine;
#[cfg(windows)]
mod sky_window_monitor;
#[cfg(not(windows))]
mod stubs;
#[cfg(windows)]
mod target_window_message;
#[cfg(windows)]
mod window;

#[cfg(windows)]
pub use background_playback::{
    pause_background_playback, pause_foreground_playback, prepare_background_playback_plan,
    resume_background_playback, resume_foreground_playback, seek_background_playback,
    seek_foreground_playback, start_background_playback, start_prepared_background_playback,
    start_prepared_foreground_playback, stop_background_playback,
    stop_current_background_playback_for_shutdown, stop_foreground_playback,
    update_background_playback_options, update_foreground_playback_options,
    BackgroundPlaybackOptionsRequest, BackgroundPlaybackPreparePlanRequest,
    BackgroundPlaybackPreparePlanResponse, BackgroundPlaybackPreparedStartRequest,
    BackgroundPlaybackStartRequest, BackgroundPlaybackStartResponse,
    ForegroundPlaybackPreparedStartRequest,
};
#[cfg(windows)]
pub use foreground_input::send_foreground_key_group;
#[cfg(windows)]
pub use sky_window_monitor::{
    get_sky_window_monitor_state, start_sky_window_monitor, stop_sky_window_monitor,
    SkyWindowMonitorSnapshot,
};
#[cfg(not(windows))]
pub use stubs::{
    find_sky_window, list_candidate_windows, pause_background_playback, pause_foreground_playback,
    prepare_background_playback_plan, resume_background_playback, resume_foreground_playback,
    seek_background_playback, seek_foreground_playback, send_foreground_key_group,
    send_key_group_to_window_message, start_background_playback,
    start_prepared_background_playback, start_prepared_foreground_playback,
    stop_background_playback, stop_current_background_playback_for_shutdown,
    stop_foreground_playback, update_background_playback_options,
    update_foreground_playback_options, BackgroundPlaybackOptionsRequest,
    BackgroundPlaybackPreparePlanRequest, BackgroundPlaybackPreparePlanResponse,
    BackgroundPlaybackPreparedStartRequest, BackgroundPlaybackStartRequest,
    BackgroundPlaybackStartResponse, ForegroundPlaybackPreparedStartRequest,
};
#[cfg(not(windows))]
pub use stubs::{
    get_sky_window_monitor_state, start_sky_window_monitor, stop_sky_window_monitor,
    SkyWindowMonitorSnapshot,
};
#[cfg(windows)]
pub use target_window_message::send_key_group_to_window_message;
#[cfg(windows)]
pub use window::{find_sky_window, list_candidate_windows};

#[cfg(windows)]
pub(crate) fn to_wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
