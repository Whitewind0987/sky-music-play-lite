use super::key_mapping::mapped_key_to_virtual_key;
use std::collections::HashMap;
use std::mem::size_of;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    MAPVK_VK_TO_VSC,
};

#[derive(Clone)]
struct PreparedForegroundKey {
    scan_code: u16,
    virtual_key: u16,
}

pub(crate) struct PreparedForegroundOutput {
    keys: HashMap<String, PreparedForegroundKey>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ForegroundInputRecord {
    key: String,
    scan_code: u16,
    virtual_key: u16,
    key_up: bool,
}

trait ForegroundInputSender {
    fn send(&mut self, records: &[ForegroundInputRecord]) -> Result<usize, String>;
}

struct WindowsForegroundInputSender;

impl ForegroundInputSender for WindowsForegroundInputSender {
    fn send(&mut self, records: &[ForegroundInputRecord]) -> Result<usize, String> {
        let mut inputs = records
            .iter()
            .map(|record| {
                build_keyboard_input(
                    record.virtual_key,
                    record.scan_code,
                    if record.key_up { KEYEVENTF_KEYUP } else { 0 },
                )
            })
            .collect::<Vec<_>>();
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                size_of::<INPUT>() as i32,
            )
        };

        if sent as usize != records.len() {
            let error = std::io::Error::last_os_error();
            return Err(format!(
                "SendInput foreground batch was incomplete. requested: {}; sent: {sent}; error: {error}",
                records.len(),
            ));
        }

        Ok(sent as usize)
    }
}

pub fn send_foreground_key_group(keys: Vec<String>) -> Result<String, String> {
    let output = prepare_foreground_output(&keys)?;
    let keys = unique_keys(&keys);
    let mut sender = WindowsForegroundInputSender;

    send_foreground_key_group_with_sender(&output, &keys, &mut sender, || {
        thread::sleep(Duration::from_millis(40));
    })
}

pub(crate) fn prepare_foreground_output(
    keys: &[String],
) -> Result<PreparedForegroundOutput, String> {
    if keys.is_empty() {
        return Err("Foreground input needs at least one key.".to_string());
    }

    let mut prepared_keys = HashMap::new();

    for key in unique_keys(keys) {
        let virtual_key = mapped_key_to_virtual_key(&key)
            .ok_or_else(|| format!("Unsupported mapped key for foreground input: {key}"))?;
        let scan_code = unsafe { MapVirtualKeyW(virtual_key as u32, MAPVK_VK_TO_VSC) };

        if scan_code == 0 {
            let error = std::io::Error::last_os_error();
            return Err(format!(
                "Failed to resolve foreground scan code for key {key}: {error}"
            ));
        }

        prepared_keys.insert(
            key,
            PreparedForegroundKey {
                scan_code: scan_code as u16,
                virtual_key,
            },
        );
    }

    Ok(PreparedForegroundOutput {
        keys: prepared_keys,
    })
}

impl PreparedForegroundOutput {
    pub(crate) fn send_key_down_group(&self, keys: &[String]) -> Result<(), String> {
        let mut sender = WindowsForegroundInputSender;
        self.send_key_down_group_with_sender(keys, &mut sender)
    }

    pub(crate) fn send_key_up_group(&self, keys: &[String]) -> Result<(), String> {
        let mut sender = WindowsForegroundInputSender;
        self.send_key_up_group_with_sender(keys, &mut sender)
    }

    fn send_key_down_group_with_sender<S: ForegroundInputSender>(
        &self,
        keys: &[String],
        sender: &mut S,
    ) -> Result<(), String> {
        self.send_group_with_sender(keys, false, "down", sender)
    }

    fn send_key_up_group_with_sender<S: ForegroundInputSender>(
        &self,
        keys: &[String],
        sender: &mut S,
    ) -> Result<(), String> {
        self.send_group_with_sender(keys, true, "up", sender)
    }

    fn send_group_with_sender<S: ForegroundInputSender>(
        &self,
        keys: &[String],
        key_up: bool,
        state: &str,
        sender: &mut S,
    ) -> Result<(), String> {
        let records = self.build_records(keys, key_up)?;

        if records.is_empty() {
            return Err(format!(
                "Cannot send an empty foreground key {state} batch."
            ));
        }

        let sent = sender.send(&records)?;

        if sent != records.len() {
            return Err(format!(
                "Failed to send foreground key {state} batch. requested: {}; sent: {sent}; keys: {}",
                records.len(),
                records
                    .iter()
                    .map(|record| record.key.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
            ));
        }

        Ok(())
    }

    fn build_records(
        &self,
        keys: &[String],
        key_up: bool,
    ) -> Result<Vec<ForegroundInputRecord>, String> {
        unique_keys(keys)
            .into_iter()
            .map(|key| {
                let prepared_key = self
                    .keys
                    .get(&key)
                    .ok_or_else(|| format!("Prepared foreground key is missing: {key}"))?;

                Ok(ForegroundInputRecord {
                    key,
                    scan_code: prepared_key.scan_code,
                    virtual_key: prepared_key.virtual_key,
                    key_up,
                })
            })
            .collect()
    }
}

fn send_foreground_key_group_with_sender<S, F>(
    output: &PreparedForegroundOutput,
    keys: &[String],
    sender: &mut S,
    hold: F,
) -> Result<String, String>
where
    S: ForegroundInputSender,
    F: FnOnce(),
{
    if let Err(error) = output.send_key_down_group_with_sender(keys, sender) {
        let _ = output.send_key_up_group_with_sender(keys, sender);
        return Err(error);
    }

    hold();

    if let Err(error) = output.send_key_up_group_with_sender(keys, sender) {
        let _ = output.send_key_up_group_with_sender(keys, sender);
        return Err(error);
    }

    Ok(format!(
        "Sent {} key(s) to the current foreground window.",
        keys.len()
    ))
}

fn unique_keys(keys: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();

    keys.iter()
        .filter(|key| seen.insert((*key).clone()))
        .cloned()
        .collect()
}

fn build_keyboard_input(virtual_key: u16, scan_code: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: virtual_key,
                wScan: scan_code,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[derive(Default)]
    struct FakeForegroundInputSender {
        batches: Vec<Vec<ForegroundInputRecord>>,
        results: VecDeque<Result<usize, String>>,
    }

    impl FakeForegroundInputSender {
        fn with_results(results: impl IntoIterator<Item = Result<usize, String>>) -> Self {
            Self {
                batches: Vec::new(),
                results: results.into_iter().collect(),
            }
        }
    }

    impl ForegroundInputSender for FakeForegroundInputSender {
        fn send(&mut self, records: &[ForegroundInputRecord]) -> Result<usize, String> {
            self.batches.push(records.to_vec());
            self.results.pop_front().unwrap_or(Ok(records.len()))
        }
    }

    fn output() -> PreparedForegroundOutput {
        PreparedForegroundOutput {
            keys: HashMap::from([
                (
                    "Key1".to_string(),
                    PreparedForegroundKey {
                        scan_code: 2,
                        virtual_key: 0x31,
                    },
                ),
                (
                    "Key2".to_string(),
                    PreparedForegroundKey {
                        scan_code: 3,
                        virtual_key: 0x32,
                    },
                ),
                (
                    "Key3".to_string(),
                    PreparedForegroundKey {
                        scan_code: 4,
                        virtual_key: 0x33,
                    },
                ),
            ]),
        }
    }

    fn chord() -> Vec<String> {
        vec!["Key3".to_string(), "Key1".to_string(), "Key2".to_string()]
    }

    #[test]
    fn key_groups_are_deduplicated_without_reordering() {
        assert_eq!(
            unique_keys(&[
                "Key2".to_string(),
                "Key1".to_string(),
                "Key2".to_string(),
                "Key3".to_string(),
            ]),
            vec!["Key2", "Key1", "Key3"],
        );
    }

    #[test]
    fn chord_uses_one_ordered_three_key_down_and_up_batch() {
        let output = output();
        let keys = chord();
        let mut sender = FakeForegroundInputSender::default();

        output
            .send_key_down_group_with_sender(&keys, &mut sender)
            .unwrap();
        output
            .send_key_up_group_with_sender(&keys, &mut sender)
            .unwrap();

        assert_eq!(sender.batches.len(), 2);
        assert_eq!(
            sender.batches[0]
                .iter()
                .map(|record| record.key.as_str())
                .collect::<Vec<_>>(),
            ["Key3", "Key1", "Key2"],
        );
        assert!(sender.batches[0].iter().all(|record| !record.key_up));
        assert!(sender.batches[1].iter().all(|record| record.key_up));
        assert_eq!(sender.batches[1].len(), 3);
    }

    #[test]
    fn repeated_keys_are_removed_before_batching() {
        let output = output();
        let mut sender = FakeForegroundInputSender::default();
        let keys = vec!["Key1".to_string(), "Key2".to_string(), "Key1".to_string()];

        output
            .send_key_down_group_with_sender(&keys, &mut sender)
            .unwrap();

        assert_eq!(sender.batches[0].len(), 2);
        assert_eq!(
            sender.batches[0]
                .iter()
                .map(|record| record.key.as_str())
                .collect::<Vec<_>>(),
            ["Key1", "Key2"],
        );
    }

    #[test]
    fn full_send_succeeds_and_zero_count_fails_without_dispatch() {
        let output = output();
        let mut sender = FakeForegroundInputSender::default();

        output
            .send_key_down_group_with_sender(&chord(), &mut sender)
            .unwrap();
        let error = output
            .send_key_down_group_with_sender(&[], &mut sender)
            .unwrap_err();

        assert_eq!(sender.batches.len(), 1);
        assert!(error.contains("empty foreground key down batch"));
    }

    #[test]
    fn partial_send_reports_requested_and_sent_counts() {
        let output = output();
        let mut sender = FakeForegroundInputSender::with_results([Ok(2)]);

        let error = output
            .send_key_down_group_with_sender(&chord(), &mut sender)
            .unwrap_err();

        assert!(error.contains("requested: 3; sent: 2"));
    }

    #[test]
    fn compatibility_down_failure_attempts_one_grouped_release() {
        let output = output();
        let keys = chord();
        let mut sender = FakeForegroundInputSender::with_results([Ok(2), Ok(3)]);

        let error =
            send_foreground_key_group_with_sender(&output, &keys, &mut sender, || {}).unwrap_err();

        assert!(error.contains("requested: 3; sent: 2"));
        assert_eq!(sender.batches.len(), 2);
        assert!(sender.batches[1].iter().all(|record| record.key_up));
    }

    #[test]
    fn compatibility_success_uses_one_down_batch_and_one_up_batch() {
        let output = output();
        let keys = chord();
        let mut sender = FakeForegroundInputSender::with_results([Ok(3), Ok(3)]);
        let mut held = false;

        let result = send_foreground_key_group_with_sender(&output, &keys, &mut sender, || {
            held = true;
        });

        assert!(result.is_ok());
        assert!(held);
        assert_eq!(sender.batches.len(), 2);
        assert!(sender.batches[0].iter().all(|record| !record.key_up));
        assert!(sender.batches[1].iter().all(|record| record.key_up));
    }

    #[test]
    fn compatibility_up_failure_attempts_one_final_grouped_release() {
        let output = output();
        let keys = chord();
        let mut sender = FakeForegroundInputSender::with_results([Ok(3), Ok(2), Ok(3)]);

        let error =
            send_foreground_key_group_with_sender(&output, &keys, &mut sender, || {}).unwrap_err();

        assert!(error.contains("requested: 3; sent: 2"));
        assert_eq!(sender.batches.len(), 3);
        assert!(sender.batches[1].iter().all(|record| record.key_up));
        assert!(sender.batches[2].iter().all(|record| record.key_up));
    }
}
