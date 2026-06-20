use super::key_mapping::{legacy_vkscan_to_virtual_key, mapped_key_to_virtual_key};
use super::window::parse_hwnd;
use std::collections::HashMap;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::{HWND, LPARAM};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{MapVirtualKeyW, MAPVK_VK_TO_VSC};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    IsWindow, PostMessageW, SendMessageW, WM_KEYDOWN, WM_KEYUP,
};

const TARGET_MESSAGE_METHOD_POST: &str = "post-message";
const TARGET_MESSAGE_METHOD_SEND: &str = "send-message";
const TARGET_PROFILE_STANDARD: &str = "standard";
const TARGET_PROFILE_LEGACY_ZERO_LPARAM: &str = "legacy-vkscan-zero-lparam";
const TARGET_PROFILE_LEGACY_SCAN_LPARAM: &str = "legacy-vkscan-scan-lparam";
const TARGET_PROFILE_GROUPED_LEGACY: &str = "grouped-legacy";
const TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM: &str = "legacy-activate-scan-lparam";
const WM_ACTIVATE: u32 = 0x0006;
const WA_ACTIVE: usize = 1;
const TARGET_KEY_HOLD_MIN_MS: u64 = 10;
const TARGET_KEY_HOLD_MAX_MS: u64 = 200;

#[derive(Clone)]
pub(crate) struct WindowMessageKeyInput {
    hwnd: HWND,
    hwnd_text: String,
    key: String,
    method: String,
    compatibility_profile: String,
    scan_code: u32,
    virtual_key: u16,
}

#[derive(Clone)]
pub(crate) struct WindowMessageTarget {
    hwnd: HWND,
    hwnd_text: String,
    method: String,
    compatibility_profile: String,
}

#[derive(Clone)]
pub(crate) struct PreparedWindowMessageTarget {
    inputs_by_key: HashMap<String, WindowMessageKeyInput>,
    target: WindowMessageTarget,
}

unsafe impl Send for WindowMessageKeyInput {}
unsafe impl Send for WindowMessageTarget {}
unsafe impl Send for PreparedWindowMessageTarget {}

struct TargetWindowKeyMessageResult {
    down_result: Option<isize>,
    up_result: Option<isize>,
}

pub fn send_key_group_to_window_message(
    hwnd: String,
    keys: Vec<String>,
    method: String,
    compatibility_profile: String,
    key_hold_ms: u64,
) -> Result<String, String> {
    if keys.is_empty() {
        return Err(format!(
            "Target-window message input needs at least one key. hwnd: {hwnd}; method: {method}; profile: {compatibility_profile}; hold: {key_hold_ms}ms"
        ));
    }

    if !(TARGET_KEY_HOLD_MIN_MS..=TARGET_KEY_HOLD_MAX_MS).contains(&key_hold_ms) {
        return Err(format!(
            "Target-window key hold duration is out of range. hwnd: {hwnd}; method: {method}; profile: {compatibility_profile}; hold: {key_hold_ms}ms; allowed range: {TARGET_KEY_HOLD_MIN_MS}-{TARGET_KEY_HOLD_MAX_MS}ms"
        ));
    }

    let target = build_window_message_target(hwnd, method, compatibility_profile)?;
    let grouped = is_grouped_target_compatibility_profile(&target.compatibility_profile);
    let soft_activation =
        target.compatibility_profile == TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM;

    send_target_window_key_down_group(&target, &keys)?;
    thread::sleep(Duration::from_millis(key_hold_ms));
    send_target_window_key_up_group(&target, &keys)?;

    Ok(format!(
        "Target-window key group messages sent. hwnd: {}; key count: {}; method: {}; profile: {}; hold: {}ms; grouped: {}; softActivation: {}; foregroundApi: false; send-message results: {}",
        target.hwnd_text,
        keys.len(),
        target.method,
        target.compatibility_profile,
        key_hold_ms,
        grouped,
        soft_activation,
        format_send_message_results(&[])
    ))
}

pub(crate) fn prepare_window_message_target(
    hwnd: &str,
    keys: &[String],
    method: &str,
    compatibility_profile: &str,
) -> Result<PreparedWindowMessageTarget, String> {
    if keys.is_empty() {
        return Err(format!(
            "Target-window message input needs at least one key. hwnd: {hwnd}; method: {method}; profile: {compatibility_profile}"
        ));
    }

    let target = build_window_message_target(
        hwnd.to_string(),
        method.to_string(),
        compatibility_profile.to_string(),
    )?;
    let mut inputs_by_key = HashMap::new();

    for key in keys {
        if inputs_by_key.contains_key(key) {
            continue;
        }

        inputs_by_key.insert(
            key.clone(),
            build_profile_window_message_key_input(&target, key.clone())?,
        );
    }

    Ok(PreparedWindowMessageTarget {
        inputs_by_key,
        target,
    })
}

pub(crate) fn send_prepared_window_message_key_down_group(
    target: &PreparedWindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    send_prepared_target_window_key_down_group(target, keys)
}

pub(crate) fn send_prepared_window_message_key_up_group(
    target: &PreparedWindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    send_prepared_target_window_key_up_group(target, keys)
}

fn send_target_window_key_down_group(
    target: &WindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    let inputs = build_window_message_key_inputs(target, keys)?;
    let grouped = is_grouped_target_compatibility_profile(&target.compatibility_profile);

    if grouped {
        if let Some(first_input) = inputs.first() {
            activate_target_window_for_profile(first_input, "before key group")?;
        }
    }

    for input in inputs.iter() {
        if !grouped {
            activate_target_window_for_profile(input, "before key down")?;
        }

        let key_down_lparam = build_profile_key_down_lparam(input);
        send_target_window_message(input, WM_KEYDOWN, key_down_lparam, "down")?;
    }

    Ok(())
}

fn send_prepared_target_window_key_down_group(
    target: &PreparedWindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    let inputs = collect_prepared_key_inputs(target, keys)?;
    let grouped = is_grouped_target_compatibility_profile(&target.target.compatibility_profile);

    if grouped {
        if let Some(first_input) = inputs.first() {
            activate_target_window_for_profile(first_input, "before key group")?;
        }
    }

    for input in inputs {
        if !grouped {
            activate_target_window_for_profile(input, "before key down")?;
        }

        let key_down_lparam = build_profile_key_down_lparam(input);
        send_target_window_message(input, WM_KEYDOWN, key_down_lparam, "down")?;
    }

    Ok(())
}

fn send_target_window_key_up_group(
    target: &WindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    let inputs = build_window_message_key_inputs(target, keys)?;
    let grouped = is_grouped_target_compatibility_profile(&target.compatibility_profile);

    for input in inputs.iter() {
        if !grouped {
            activate_target_window_for_profile(input, "before key up")?;
        }

        let key_up_lparam = build_profile_key_up_lparam(input);
        send_target_window_message(input, WM_KEYUP, key_up_lparam, "up")?;
    }

    Ok(())
}

fn send_prepared_target_window_key_up_group(
    target: &PreparedWindowMessageTarget,
    keys: &[String],
) -> Result<(), String> {
    let inputs = collect_prepared_key_inputs(target, keys)?;
    let grouped = is_grouped_target_compatibility_profile(&target.target.compatibility_profile);

    for input in inputs {
        if !grouped {
            activate_target_window_for_profile(input, "before key up")?;
        }

        let key_up_lparam = build_profile_key_up_lparam(input);
        send_target_window_message(input, WM_KEYUP, key_up_lparam, "up")?;
    }

    Ok(())
}

fn collect_prepared_key_inputs<'a>(
    target: &'a PreparedWindowMessageTarget,
    keys: &[String],
) -> Result<Vec<&'a WindowMessageKeyInput>, String> {
    keys.iter()
        .map(|key| {
            target.inputs_by_key.get(key).ok_or_else(|| {
                format!(
                    "Prepared target-window key is missing. hwnd: {}; mapped key: {key}; method: {}; profile: {}",
                    target.target.hwnd_text,
                    target.target.method,
                    target.target.compatibility_profile
                )
            })
        })
        .collect::<Result<Vec<_>, _>>()
}

fn build_window_message_key_inputs(
    target: &WindowMessageTarget,
    keys: &[String],
) -> Result<Vec<WindowMessageKeyInput>, String> {
    keys.iter()
        .map(|key| build_profile_window_message_key_input(target, key.clone()))
        .collect::<Result<Vec<_>, _>>()
}

fn build_window_message_target(
    hwnd: String,
    method: String,
    compatibility_profile: String,
) -> Result<WindowMessageTarget, String> {
    let method = method.trim().to_string();

    if method != TARGET_MESSAGE_METHOD_POST && method != TARGET_MESSAGE_METHOD_SEND {
        return Err(format!(
            "Unsupported target window message method: {method}. Supported methods: {TARGET_MESSAGE_METHOD_POST}, {TARGET_MESSAGE_METHOD_SEND}."
        ));
    }

    let compatibility_profile = compatibility_profile.trim().to_string();

    if !is_supported_target_compatibility_profile(&compatibility_profile) {
        return Err(format!(
            "Unsupported target-window compatibility profile: {compatibility_profile}. Supported profiles: {TARGET_PROFILE_STANDARD}, {TARGET_PROFILE_LEGACY_ZERO_LPARAM}, {TARGET_PROFILE_LEGACY_SCAN_LPARAM}, {TARGET_PROFILE_GROUPED_LEGACY}, {TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM}."
        ));
    }

    let hwnd_text = hwnd.clone();
    let hwnd = parse_hwnd(&hwnd_text)?;

    if unsafe { IsWindow(hwnd) } == 0 {
        return Err(format!(
            "Selected target window is no longer available. hwnd: {hwnd_text}; method: {method}; profile: {compatibility_profile}"
        ));
    }

    Ok(WindowMessageTarget {
        hwnd,
        hwnd_text,
        method,
        compatibility_profile,
    })
}

fn build_profile_window_message_key_input(
    target: &WindowMessageTarget,
    key: String,
) -> Result<WindowMessageKeyInput, String> {
    let virtual_key = match target.compatibility_profile.as_str() {
        TARGET_PROFILE_STANDARD => mapped_key_to_virtual_key(&key).ok_or_else(|| {
            format!(
                "Unsupported mapped key for target-window message input. hwnd: {}; mapped key: {key}; method: {}; profile: {}",
                target.hwnd_text, target.method, target.compatibility_profile
            )
        })?,
        TARGET_PROFILE_LEGACY_ZERO_LPARAM
        | TARGET_PROFILE_LEGACY_SCAN_LPARAM
        | TARGET_PROFILE_GROUPED_LEGACY
        | TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM => legacy_vkscan_to_virtual_key(
            &key,
            &target.hwnd_text,
            &target.method,
            &target.compatibility_profile,
        )?,
        _ => {
            return Err(format!(
                "Unsupported target-window compatibility profile: {}.",
                target.compatibility_profile
            ))
        }
    };
    let needs_scan_code = target.compatibility_profile != TARGET_PROFILE_LEGACY_ZERO_LPARAM;
    let scan_code = if needs_scan_code {
        let scan_code = unsafe { MapVirtualKeyW(virtual_key as u32, MAPVK_VK_TO_VSC) };

        if scan_code == 0 {
            let error = std::io::Error::last_os_error();
            return Err(format!(
                "Failed to resolve scan code for target-window message input. hwnd: {}; mapped key: {key}; virtual key: {virtual_key}; scan code: {scan_code}; method: {}; profile: {}; last OS error: {error}",
                target.hwnd_text, target.method, target.compatibility_profile
            ));
        }

        scan_code
    } else {
        0
    };

    Ok(WindowMessageKeyInput {
        hwnd: target.hwnd,
        hwnd_text: target.hwnd_text.clone(),
        key,
        method: target.method.clone(),
        compatibility_profile: target.compatibility_profile.clone(),
        scan_code,
        virtual_key,
    })
}

fn is_supported_target_compatibility_profile(profile: &str) -> bool {
    matches!(
        profile,
        TARGET_PROFILE_STANDARD
            | TARGET_PROFILE_LEGACY_ZERO_LPARAM
            | TARGET_PROFILE_LEGACY_SCAN_LPARAM
            | TARGET_PROFILE_GROUPED_LEGACY
            | TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM
    )
}

fn is_grouped_target_compatibility_profile(profile: &str) -> bool {
    matches!(
        profile,
        TARGET_PROFILE_GROUPED_LEGACY | TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM
    )
}

fn build_profile_key_down_lparam(input: &WindowMessageKeyInput) -> LPARAM {
    if input.scan_code == 0 {
        0
    } else {
        build_key_down_lparam(input.scan_code)
    }
}

fn build_profile_key_up_lparam(input: &WindowMessageKeyInput) -> LPARAM {
    if input.scan_code == 0 {
        0
    } else if input.compatibility_profile == TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM {
        ((input.scan_code as isize) << 16) | 0xC0000001u32 as isize
    } else {
        build_key_up_lparam(input.scan_code)
    }
}

fn activate_target_window_for_profile(
    input: &WindowMessageKeyInput,
    activation_stage: &str,
) -> Result<Option<isize>, String> {
    if input.compatibility_profile != TARGET_PROFILE_LEGACY_ACTIVATE_SCAN_LPARAM {
        return Ok(None);
    }

    send_target_window_activate(input, activation_stage)
}

fn send_target_window_activate(
    input: &WindowMessageKeyInput,
    activation_stage: &str,
) -> Result<Option<isize>, String> {
    match input.method.as_str() {
        TARGET_MESSAGE_METHOD_POST => {
            let sent = unsafe { PostMessageW(input.hwnd, WM_ACTIVATE, WA_ACTIVE, 0) };

            if sent == 0 {
                let error = std::io::Error::last_os_error();
                return Err(format!(
                    "Failed to post target-window activation message. hwnd: {}; mapped key: {}; stage: {activation_stage}; method: {}; profile: {}; last OS error: {error}",
                    input.hwnd_text, input.key, input.method, input.compatibility_profile
                ));
            }

            Ok(None)
        }
        TARGET_MESSAGE_METHOD_SEND => {
            let result = unsafe { SendMessageW(input.hwnd, WM_ACTIVATE, WA_ACTIVE, 0) };
            Ok(Some(result))
        }
        _ => Err(format!(
            "Unsupported target window message method: {}. Supported methods: {}, {}.",
            input.method, TARGET_MESSAGE_METHOD_POST, TARGET_MESSAGE_METHOD_SEND
        )),
    }
}

fn build_key_down_lparam(scan_code: u32) -> LPARAM {
    1 | ((scan_code as isize) << 16)
}

fn build_key_up_lparam(scan_code: u32) -> LPARAM {
    build_key_down_lparam(scan_code) | (1 << 30) | (1 << 31)
}

fn post_window_key_message(
    input: &WindowMessageKeyInput,
    message: u32,
    lparam: LPARAM,
    key_state: &str,
) -> Result<(), String> {
    let sent = unsafe { PostMessageW(input.hwnd, message, input.virtual_key as usize, lparam) };

    if sent == 0 {
        let error = std::io::Error::last_os_error();
        return Err(format!(
            "Failed to post target-window key {key_state} message. hwnd: {}; mapped key: {}; virtual key: {}; scan code: {}; method: {}; profile: {}; last OS error: {error}",
            input.hwnd_text,
            input.key,
            input.virtual_key,
            input.scan_code,
            input.method,
            input.compatibility_profile
        ));
    }

    Ok(())
}

fn send_target_window_message(
    input: &WindowMessageKeyInput,
    message: u32,
    lparam: LPARAM,
    key_state: &str,
) -> Result<Option<isize>, String> {
    match input.method.as_str() {
        TARGET_MESSAGE_METHOD_POST => {
            post_window_key_message(input, message, lparam, key_state)?;
            Ok(None)
        }
        TARGET_MESSAGE_METHOD_SEND => {
            let result =
                unsafe { SendMessageW(input.hwnd, message, input.virtual_key as usize, lparam) };

            Ok(Some(result))
        }
        _ => Err(format!(
            "Unsupported target window message method: {}. Supported methods: {}, {}.",
            input.method, TARGET_MESSAGE_METHOD_POST, TARGET_MESSAGE_METHOD_SEND
        )),
    }
}

fn format_send_message_results(results: &[TargetWindowKeyMessageResult]) -> String {
    let result_text = results
        .iter()
        .enumerate()
        .map(|(index, result)| {
            format!(
                "#{} down={}; up={}",
                index + 1,
                format_optional_message_result(result.down_result),
                format_optional_message_result(result.up_result)
            )
        })
        .collect::<Vec<_>>();

    if result_text.is_empty() {
        "none".to_string()
    } else {
        result_text.join(", ")
    }
}

fn format_optional_message_result(result: Option<isize>) -> String {
    result
        .map(|value| value.to_string())
        .unwrap_or_else(|| "n/a".to_string())
}
