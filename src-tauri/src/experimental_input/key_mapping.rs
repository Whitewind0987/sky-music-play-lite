use super::to_wide_null;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    LoadKeyboardLayoutW, VkKeyScanW, KLF_ACTIVATE, VK_BACK, VK_DECIMAL, VK_DELETE, VK_DIVIDE,
    VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_INSERT, VK_LEFT, VK_NEXT, VK_OEM_1, VK_OEM_2,
    VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_PRIOR, VK_RETURN, VK_RIGHT,
    VK_SPACE, VK_TAB, VK_UP,
};

const US_KEYBOARD_LAYOUT_ID: &str = "00000409";

pub(crate) fn mapped_key_to_virtual_key(key: &str) -> Option<u16> {
    let normalized_key = key.trim();

    if normalized_key.len() == 1 {
        let character = normalized_key.chars().next()?;

        if character.is_ascii_alphabetic() {
            return Some(character.to_ascii_uppercase() as u16);
        }

        if character.is_ascii_digit() {
            return Some(character as u16);
        }

        return match character {
            ' ' => Some(VK_SPACE),
            ';' => Some(VK_OEM_1),
            ':' => Some(VK_OEM_1),
            '/' => Some(VK_OEM_2),
            '?' => Some(VK_OEM_2),
            ',' => Some(VK_OEM_COMMA),
            '<' => Some(VK_OEM_COMMA),
            '.' => Some(VK_OEM_PERIOD),
            '>' => Some(VK_OEM_PERIOD),
            '-' => Some(VK_OEM_MINUS),
            '_' => Some(VK_OEM_MINUS),
            '=' => Some(VK_OEM_PLUS),
            '+' => Some(VK_OEM_PLUS),
            _ => None,
        };
    }

    match normalized_key {
        "Backspace" => Some(VK_BACK),
        "Decimal" => Some(VK_DECIMAL),
        "Delete" => Some(VK_DELETE),
        "Down" | "ArrowDown" => Some(VK_DOWN),
        "End" => Some(VK_END),
        "Enter" => Some(VK_RETURN),
        "Escape" => Some(VK_ESCAPE),
        "Home" => Some(VK_HOME),
        "Insert" => Some(VK_INSERT),
        "Left" | "ArrowLeft" => Some(VK_LEFT),
        "PageDown" => Some(VK_NEXT),
        "PageUp" => Some(VK_PRIOR),
        "Right" | "ArrowRight" => Some(VK_RIGHT),
        "Space" => Some(VK_SPACE),
        "Tab" => Some(VK_TAB),
        "Up" | "ArrowUp" => Some(VK_UP),
        "/" | "Divide" => Some(VK_DIVIDE),
        "," => Some(VK_OEM_COMMA),
        _ => None,
    }
}

pub(crate) fn legacy_vkscan_to_virtual_key(
    key: &str,
    hwnd_text: &str,
    method: &str,
    compatibility_profile: &str,
) -> Result<u16, String> {
    let normalized_key = key.trim();
    let mut characters = normalized_key.chars();
    let character = characters.next().ok_or_else(|| {
        format!(
            "Unsupported mapped key for legacy VkKeyScan input. hwnd: {hwnd_text}; mapped key: {key}; method: {method}; profile: {compatibility_profile}"
        )
    })?;

    if characters.next().is_some() {
        return mapped_key_to_virtual_key(normalized_key).ok_or_else(|| {
            format!(
                "Unsupported mapped key for legacy VkKeyScan input. hwnd: {hwnd_text}; mapped key: {key}; method: {method}; profile: {compatibility_profile}"
            )
        });
    }

    let keyboard_layout_id = to_wide_null(US_KEYBOARD_LAYOUT_ID);
    let keyboard_layout = unsafe { LoadKeyboardLayoutW(keyboard_layout_id.as_ptr(), KLF_ACTIVATE) };

    if keyboard_layout.is_null() {
        let error = std::io::Error::last_os_error();
        return Err(format!(
            "Failed to load US keyboard layout for legacy VkKeyScan input. hwnd: {hwnd_text}; mapped key: {key}; method: {method}; profile: {compatibility_profile}; last OS error: {error}"
        ));
    }

    let vk_key_scan_result = unsafe { VkKeyScanW(character as u16) };

    if vk_key_scan_result == -1 {
        return Err(format!(
            "VkKeyScanW could not resolve mapped key for target-window message input. hwnd: {hwnd_text}; mapped key: {key}; method: {method}; profile: {compatibility_profile}"
        ));
    }

    Ok((vk_key_scan_result as u16) & 0x00ff)
}
