use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CandidateWindow {
    hwnd: String,
    title: String,
    class_name: String,
    process_name: Option<String>,
}

#[cfg(windows)]
mod background_playback;
#[cfg(windows)]
mod foreground_input;
#[cfg(windows)]
mod key_mapping;
#[cfg(windows)]
mod playback_engine;
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
#[cfg(windows)]
pub use target_window_message::send_key_group_to_window_message;
#[cfg(windows)]
pub use window::{find_sky_window, list_candidate_windows};

#[cfg(windows)]
pub(crate) fn to_wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
