use serde::{Deserialize, Serialize};

pub const SCORE_RECORDING_EVENT: &str = "score-recording-event";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreRecordingStartRequest {
    pub session_id: u64,
    pub target_hwnd: String,
    pub keys: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScoreRecordingEventPayload {
    pub session_id: u64,
    #[serde(rename = "type")]
    pub event_type: ScoreRecordingEventType,
    pub key: String,
    pub time_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreRecordingEventType {
    Keydown,
    Keyup,
}

#[cfg(not(windows))]
mod stubs;
#[cfg(windows)]
mod windows;

#[cfg(not(windows))]
pub use stubs::{
    cancel_score_recording, start_score_recording, stop_score_recording,
    stop_score_recording_for_shutdown,
};
#[cfg(windows)]
pub use windows::{
    cancel_score_recording, start_score_recording, stop_score_recording,
    stop_score_recording_for_shutdown,
};
