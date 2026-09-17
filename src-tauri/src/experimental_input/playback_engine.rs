use super::foreground_input::{prepare_foreground_output, PreparedForegroundOutput};
use super::target_window_message::{
    prepare_window_message_target, send_prepared_window_message_key_down_group,
    send_prepared_window_message_key_up_group, PreparedWindowMessageTarget,
};
#[cfg(test)]
use std::sync::{Arc, Mutex};

#[cfg(test)]
#[derive(Default)]
pub(crate) struct TestPlaybackOutputState {
    pub(crate) key_down_groups: Vec<Vec<String>>,
    pub(crate) key_up_groups: Vec<Vec<String>>,
    pub(crate) next_key_down_error: Option<String>,
    pub(crate) next_key_up_error: Option<String>,
}

pub(crate) enum PlaybackOutput {
    Foreground(PreparedForegroundOutput),
    TargetWindow(PreparedWindowMessageTarget),
    #[cfg(test)]
    Test(Arc<Mutex<TestPlaybackOutputState>>),
}

impl PlaybackOutput {
    pub(crate) fn prepare_foreground(keys: &[String]) -> Result<Self, String> {
        Ok(Self::Foreground(prepare_foreground_output(keys)?))
    }

    pub(crate) fn prepare_target_window(
        hwnd: &str,
        keys: &[String],
        compatibility_profile: &str,
    ) -> Result<Self, String> {
        Ok(Self::TargetWindow(prepare_window_message_target(
            hwnd,
            keys,
            "post-message",
            compatibility_profile,
        )?))
    }

    pub(crate) fn send_key_down_group(&self, keys: &[String]) -> Result<(), String> {
        match self {
            Self::Foreground(output) => output.send_key_down_group(keys),
            Self::TargetWindow(output) => send_prepared_window_message_key_down_group(output, keys),
            #[cfg(test)]
            Self::Test(state) => {
                let mut state = state.lock().expect("test playback output poisoned");
                state.key_down_groups.push(keys.to_vec());
                match state.next_key_down_error.take() {
                    Some(error) => Err(error),
                    None => Ok(()),
                }
            }
        }
    }

    pub(crate) fn send_key_up_group(&self, keys: &[String]) -> Result<(), String> {
        match self {
            Self::Foreground(output) => output.send_key_up_group(keys),
            Self::TargetWindow(output) => send_prepared_window_message_key_up_group(output, keys),
            #[cfg(test)]
            Self::Test(state) => {
                let mut state = state.lock().expect("test playback output poisoned");
                state.key_up_groups.push(keys.to_vec());
                match state.next_key_up_error.take() {
                    Some(error) => Err(error),
                    None => Ok(()),
                }
            }
        }
    }
}
