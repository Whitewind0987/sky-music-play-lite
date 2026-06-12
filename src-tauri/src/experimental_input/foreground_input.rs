use super::key_mapping::mapped_key_to_virtual_key;
use std::mem::size_of;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    MAPVK_VK_TO_VSC,
};

pub fn send_foreground_key_group(keys: Vec<String>) -> Result<String, String> {
    if keys.is_empty() {
        return Err("Foreground input needs at least one key.".to_string());
    }

    for key in keys.iter() {
        send_foreground_key(key)?;
    }

    Ok(format!(
        "Sent {} key(s) to the current foreground window.",
        keys.len()
    ))
}

fn send_foreground_key(key: &str) -> Result<(), String> {
    let virtual_key = mapped_key_to_virtual_key(key)
        .ok_or_else(|| format!("Unsupported mapped key for foreground input: {key}"))?;
    let scan_code = unsafe { MapVirtualKeyW(virtual_key as u32, MAPVK_VK_TO_VSC) };
    let key_down_input = build_keyboard_input(virtual_key, scan_code as u16, 0);
    let key_down_sent = unsafe { SendInput(1, &key_down_input, size_of::<INPUT>() as i32) };

    if key_down_sent != 1 {
        let error = std::io::Error::last_os_error();
        return Err(format!(
            "Failed to send foreground key down for key {key}: {error}"
        ));
    }

    thread::sleep(Duration::from_millis(40));

    let key_up_input = build_keyboard_input(virtual_key, scan_code as u16, KEYEVENTF_KEYUP);
    let key_up_sent = unsafe { SendInput(1, &key_up_input, size_of::<INPUT>() as i32) };

    if key_up_sent != 1 {
        let error = std::io::Error::last_os_error();
        return Err(format!(
            "Failed to send foreground key up for key {key}: {error}"
        ));
    }

    Ok(())
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
