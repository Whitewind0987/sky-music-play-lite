use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    VK_BACK, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_INSERT,
    VK_LEFT, VK_NEXT, VK_OEM_1, VK_OEM_2, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS,
    VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SPACE, VK_TAB, VK_UP,
};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ResolvedMappedKey {
    pub(crate) virtual_key: u16,
    pub(crate) scan_code: u32,
}

// Canonical US Set 1 make codes, verified against Microsoft's type-4 Txx/Xxx
// definitions and US driver key-name tables (including numpad Decimal at 0x53):
// https://github.com/microsoft/win32metadata/blob/main/generation/WinSDK/RecompiledIdlHeaders/um/kbd.h
// https://github.com/microsoft/Windows-driver-samples/blob/main/input/layout/kbdus/kbdus.c
// Keep only the make-code byte: legacy messages historically do not add the
// E0 prefix or the extended-key lParam bit. Modifier synthesis is also unchanged.
fn resolve_mapped_key(key: &str) -> Option<ResolvedMappedKey> {
    // Reuse the authoritative vocabulary, aliases and trim/case policy.
    let virtual_key = mapped_key_to_virtual_key(key)?;
    let scan_code = match virtual_key {
        0x41..=0x5A => {
            const LETTER_SCAN_CODES: [u32; 26] = [
                0x1E, 0x30, 0x2E, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31,
                0x18, 0x19, 0x10, 0x13, 0x1F, 0x14, 0x16, 0x2F, 0x11, 0x2D, 0x15, 0x2C,
            ];
            LETTER_SCAN_CODES[(virtual_key - 0x41) as usize]
        }
        0x30 => 0x0B,
        0x31..=0x39 => u32::from(virtual_key - 0x31) + 0x02,
        VK_OEM_1 => 0x27,
        VK_OEM_2 | VK_DIVIDE => 0x35,
        VK_OEM_COMMA => 0x33,
        VK_OEM_PERIOD => 0x34,
        VK_OEM_MINUS => 0x0C,
        VK_OEM_PLUS => 0x0D,
        VK_BACK => 0x0E,
        VK_DECIMAL | VK_DELETE => 0x53,
        VK_DOWN => 0x50,
        VK_END => 0x4F,
        VK_RETURN => 0x1C,
        VK_ESCAPE => 0x01,
        VK_HOME => 0x47,
        VK_INSERT => 0x52,
        VK_LEFT => 0x4B,
        VK_NEXT => 0x51,
        VK_PRIOR => 0x49,
        VK_RIGHT => 0x4D,
        VK_SPACE => 0x39,
        VK_TAB => 0x0F,
        VK_UP => 0x48,
        _ => return None,
    };
    Some(ResolvedMappedKey {
        virtual_key,
        scan_code,
    })
}

pub(crate) fn resolve_legacy_mapped_key(
    key: &str,
    hwnd_text: &str,
    method: &str,
    compatibility_profile: &str,
) -> Result<ResolvedMappedKey, String> {
    // Historical public profile names remain compatibility identifiers.
    resolve_mapped_key(key).ok_or_else(|| {
        format!(
            "Unsupported mapped key for legacy target-window input. hwnd: {hwnd_text}; mapped key: {key}; method: {method}; profile: {compatibility_profile}"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_mapping(key: &str, virtual_key: u16, scan_code: u32) {
        let expected = ResolvedMappedKey {
            virtual_key,
            scan_code,
        };
        assert_eq!(resolve_mapped_key(key), Some(expected), "{key}");
        assert_eq!(mapped_key_to_virtual_key(key), Some(virtual_key), "{key}");
        assert_eq!(
            resolve_legacy_mapped_key(key, "123", "post-message", "grouped-legacy"),
            Ok(expected),
            "{key}"
        );
    }

    #[test]
    fn default_fifteen_keys_preserve_virtual_keys_and_scan_codes() {
        for (key, vk, scan) in [
            ("Y", 0x59, 0x15),
            ("U", 0x55, 0x16),
            ("I", 0x49, 0x17),
            ("O", 0x4F, 0x18),
            ("P", 0x50, 0x19),
            ("H", 0x48, 0x23),
            ("J", 0x4A, 0x24),
            ("K", 0x4B, 0x25),
            ("L", 0x4C, 0x26),
            (";", 0xBA, 0x27),
            ("N", 0x4E, 0x31),
            ("M", 0x4D, 0x32),
            (",", 0xBC, 0x33),
            (".", 0xBE, 0x34),
            ("/", 0xBF, 0x35),
        ] {
            assert_mapping(key, vk, scan);
        }
    }

    #[test]
    fn all_letters_preserve_case_equivalence_and_physical_rows() {
        for (row, first_scan) in [("QWERTYUIOP", 0x10), ("ASDFGHJKL", 0x1E), ("ZXCVBNM", 0x2C)] {
            for (offset, letter) in row.chars().enumerate() {
                let scan = first_scan + offset as u32;
                assert_mapping(&letter.to_string(), letter as u16, scan);
                assert_mapping(
                    &letter.to_ascii_lowercase().to_string(),
                    letter as u16,
                    scan,
                );
            }
        }
    }

    #[test]
    fn all_digits_use_top_row_scan_codes() {
        for (offset, digit) in "1234567890".chars().enumerate() {
            assert_mapping(&digit.to_string(), digit as u16, 0x02 + offset as u32);
        }
    }

    #[test]
    fn punctuation_aliases_share_virtual_key_and_scan_without_modifiers() {
        for (aliases, vk, scan) in [
            (";:", 0xBA, 0x27),
            ("/?", 0xBF, 0x35),
            (",<", 0xBC, 0x33),
            (".>", 0xBE, 0x34),
            ("-_", 0xBD, 0x0C),
            ("=+", 0xBB, 0x0D),
        ] {
            for alias in aliases.chars() {
                assert_mapping(&alias.to_string(), vk, scan);
            }
        }
    }

    #[test]
    fn named_controls_navigation_and_aliases_preserve_make_code_bytes() {
        for (key, vk, scan) in [
            ("Backspace", 0x08, 0x0E),
            ("Decimal", 0x6E, 0x53),
            ("Delete", 0x2E, 0x53),
            ("Down", 0x28, 0x50),
            ("ArrowDown", 0x28, 0x50),
            ("End", 0x23, 0x4F),
            ("Enter", 0x0D, 0x1C),
            ("Escape", 0x1B, 0x01),
            ("Home", 0x24, 0x47),
            ("Insert", 0x2D, 0x52),
            ("Left", 0x25, 0x4B),
            ("ArrowLeft", 0x25, 0x4B),
            ("PageDown", 0x22, 0x51),
            ("PageUp", 0x21, 0x49),
            ("Right", 0x27, 0x4D),
            ("ArrowRight", 0x27, 0x4D),
            ("Space", 0x20, 0x39),
            ("Tab", 0x09, 0x0F),
            ("Up", 0x26, 0x48),
            ("ArrowUp", 0x26, 0x48),
            ("Divide", 0x6F, 0x35),
        ] {
            assert_mapping(key, vk, scan);
        }
    }

    #[test]
    fn normalization_and_unsupported_vocabulary_stay_unchanged() {
        assert_mapping("  y  ", 0x59, 0x15);
        assert_mapping("  ArrowLeft  ", 0x25, 0x4B);
        // Literal whitespace was trimmed to empty by the existing VK resolver.
        for key in [
            "", " ", "\t", "space", "enter", "F1", "!", "[", "中", "Unknown",
        ] {
            assert_eq!(mapped_key_to_virtual_key(key), None, "{key}");
            assert_eq!(resolve_mapped_key(key), None, "{key}");
        }
    }

    #[test]
    fn unsupported_legacy_key_keeps_diagnostic_context() {
        let error = resolve_legacy_mapped_key("Unknown", "123", "post-message", "grouped-legacy")
            .unwrap_err();
        for context in [
            "hwnd: 123",
            "mapped key: Unknown",
            "method: post-message",
            "profile: grouped-legacy",
        ] {
            assert!(error.contains(context), "{error}");
        }
    }
}
