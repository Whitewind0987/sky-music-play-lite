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
    key: String,
    scan_code: u16,
    virtual_key: u16,
}

pub(crate) struct PreparedForegroundOutput {
    keys: HashMap<String, PreparedForegroundKey>,
}

pub fn send_foreground_key_group(keys: Vec<String>) -> Result<String, String> {
    let output = prepare_foreground_output(&keys)?;
    let keys = unique_keys(&keys);

    output.send_key_down_group(&keys)?;
    thread::sleep(Duration::from_millis(40));
    output.send_key_up_group(&keys)?;

    Ok(format!(
        "Sent {} key(s) to the current foreground window.",
        keys.len()
    ))
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
            key.clone(),
            PreparedForegroundKey {
                key,
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
        self.send_group(keys, 0, "down")
    }

    pub(crate) fn send_key_up_group(&self, keys: &[String]) -> Result<(), String> {
        self.send_group(keys, KEYEVENTF_KEYUP, "up")
    }

    fn send_group(&self, keys: &[String], flags: u32, state: &str) -> Result<(), String> {
        let inputs = keys
            .iter()
            .map(|key| {
                self.keys
                    .get(key)
                    .ok_or_else(|| format!("Prepared foreground key is missing: {key}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut records = inputs
            .iter()
            .map(|key| build_keyboard_input(key.virtual_key, key.scan_code, flags))
            .collect::<Vec<_>>();
        let sent = unsafe {
            SendInput(
                records.len() as u32,
                records.as_mut_ptr(),
                size_of::<INPUT>() as i32,
            )
        };

        if sent != records.len() as u32 {
            let error = std::io::Error::last_os_error();
            return Err(format!(
                "Failed to send foreground key {state} batch. requested: {}; sent: {sent}; keys: {}; error: {error}",
                records.len(),
                inputs
                    .iter()
                    .map(|key| key.key.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
            ));
        }

        Ok(())
    }
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
    use super::unique_keys;

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
}
