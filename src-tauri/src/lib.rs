use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct Note {
    time: f64,
    key: String,
}

#[derive(Debug, Serialize)]
struct DryRunNoteSummary {
    time: f64,
    key: String,
    mapped_key: String,
}

#[derive(Debug, Serialize)]
struct DryRunResult {
    note_count: usize,
    first_note: Option<DryRunNoteSummary>,
    last_note: Option<DryRunNoteSummary>,
    status: String,
}

#[derive(Debug, Serialize)]
struct CandidateWindow {
    hwnd: String,
    title: String,
    class_name: String,
    process_name: Option<String>,
}

#[tauri::command]
fn test_rust_command() -> String {
    "Rust command is working".to_string()
}

#[tauri::command]
fn dry_run_playback(
    notes: Vec<Note>,
    key_mapping: HashMap<String, String>,
) -> Result<DryRunResult, String> {
    if notes.is_empty() {
        return Err("Dry run needs at least one note.".to_string());
    }

    let first_note = notes
        .first()
        .map(|note| note_to_summary(note, &key_mapping));
    let last_note = notes.last().map(|note| note_to_summary(note, &key_mapping));

    Ok(DryRunResult {
        note_count: notes.len(),
        first_note,
        last_note,
        status: "received_notes_without_sending_keys".to_string(),
    })
}

fn note_to_summary(note: &Note, key_mapping: &HashMap<String, String>) -> DryRunNoteSummary {
    let preview_key = get_preview_key_name(&note.key);
    let mapped_key = key_mapping
        .get(&preview_key)
        .cloned()
        .unwrap_or_else(|| "".to_string());

    DryRunNoteSummary {
        time: note.time,
        key: note.key.clone(),
        mapped_key,
    }
}

fn get_preview_key_name(score_key: &str) -> String {
    if let Some(index) = score_key.rfind("Key") {
        let preview_key = &score_key[index..];
        let key_number = &preview_key[3..];

        if !key_number.is_empty()
            && key_number
                .chars()
                .all(|character| character.is_ascii_digit())
        {
            return preview_key.to_string();
        }
    }

    score_key.to_string()
}

#[cfg(windows)]
mod windows_input {
    use super::CandidateWindow;
    use std::ffi::c_void;
    use std::path::Path;
    use std::ptr::null;
    use std::thread;
    use std::time::Duration;

    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        MapVirtualKeyW, MAPVK_VK_TO_VSC, VK_BACK, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN,
        VK_END, VK_ESCAPE, VK_HOME, VK_INSERT, VK_LEFT, VK_NEXT, VK_OEM_1, VK_OEM_2, VK_OEM_COMMA,
        VK_OEM_MINUS, VK_OEM_PERIOD, VK_OEM_PLUS, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SPACE, VK_TAB,
        VK_UP,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowW, GetClassNameW, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsWindow, IsWindowVisible, PostMessageW, WM_KEYDOWN, WM_KEYUP,
    };

    const SKY_WINDOW_CLASS_NAME: &str = "TgcMainWindow";
    const MAX_CLASS_NAME_LENGTH: usize = 256;
    const MAX_PROCESS_PATH_LENGTH: usize = 1024;

    pub fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
        let mut windows = Vec::<CandidateWindow>::new();
        let state_ptr = &mut windows as *mut Vec<CandidateWindow>;

        let result = unsafe { EnumWindows(Some(enum_window), state_ptr as LPARAM) };

        if result == 0 {
            return Err("Failed to enumerate windows.".to_string());
        }

        Ok(windows)
    }

    pub fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
        let class_name = to_wide_null(SKY_WINDOW_CLASS_NAME);
        let hwnd = unsafe { FindWindowW(class_name.as_ptr(), null()) };

        if hwnd.is_null() {
            return Ok(None);
        }

        Ok(Some(build_candidate_window(hwnd)))
    }

    pub fn send_test_key_to_window(hwnd: String, key: String) -> Result<String, String> {
        let hwnd = parse_hwnd(&hwnd)?;

        if unsafe { IsWindow(hwnd) } == 0 {
            return Err("Selected target window is no longer available.".to_string());
        }

        let virtual_key = mapped_key_to_virtual_key(&key)
            .ok_or_else(|| format!("Unsupported mapped key for test input: {key}"))?;
        let scan_code = unsafe { MapVirtualKeyW(virtual_key as u32, MAPVK_VK_TO_VSC) };
        let key_down_lparam = 1 | ((scan_code as isize) << 16);
        let key_up_lparam = key_down_lparam | (1 << 30) | (1 << 31);

        let key_down_sent =
            unsafe { PostMessageW(hwnd, WM_KEYDOWN, virtual_key as usize, key_down_lparam) };

        if key_down_sent == 0 {
            return Err("Failed to send key down message.".to_string());
        }

        thread::sleep(Duration::from_millis(40));

        let key_up_sent =
            unsafe { PostMessageW(hwnd, WM_KEYUP, virtual_key as usize, key_up_lparam) };

        if key_up_sent == 0 {
            return Err("Failed to send key up message.".to_string());
        }

        Ok(format!("Sent one test key: {key}"))
    }

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let title = get_window_title(hwnd);

        if title.trim().is_empty() {
            return 1;
        }

        let windows = &mut *(lparam as *mut Vec<CandidateWindow>);
        windows.push(build_candidate_window(hwnd));

        1
    }

    fn build_candidate_window(hwnd: HWND) -> CandidateWindow {
        CandidateWindow {
            hwnd: hwnd_to_string(hwnd),
            title: get_window_title(hwnd),
            class_name: get_window_class_name(hwnd),
            process_name: get_process_name(hwnd),
        }
    }

    fn get_window_title(hwnd: HWND) -> String {
        let title_length = unsafe { GetWindowTextLengthW(hwnd) };

        if title_length <= 0 {
            return String::new();
        }

        let mut buffer = vec![0u16; title_length as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };

        if copied <= 0 {
            return String::new();
        }

        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn get_window_class_name(hwnd: HWND) -> String {
        let mut buffer = vec![0u16; MAX_CLASS_NAME_LENGTH];
        let copied = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };

        if copied <= 0 {
            return String::new();
        }

        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn get_process_name(hwnd: HWND) -> Option<String> {
        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }

        if process_id == 0 {
            return None;
        }

        let process_handle =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };

        if process_handle.is_null() {
            return None;
        }

        let mut buffer = vec![0u16; MAX_PROCESS_PATH_LENGTH];
        let mut buffer_length = buffer.len() as u32;
        let result = unsafe {
            QueryFullProcessImageNameW(process_handle, 0, buffer.as_mut_ptr(), &mut buffer_length)
        };

        unsafe {
            CloseHandle(process_handle);
        }

        if result == 0 || buffer_length == 0 {
            return None;
        }

        let path = String::from_utf16_lossy(&buffer[..buffer_length as usize]);

        Path::new(&path)
            .file_name()
            .map(|file_name| file_name.to_string_lossy().to_string())
    }

    fn mapped_key_to_virtual_key(key: &str) -> Option<u16> {
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

    fn parse_hwnd(hwnd: &str) -> Result<HWND, String> {
        let parsed = hwnd
            .parse::<usize>()
            .map_err(|_| "Selected target window handle is invalid.".to_string())?;

        if parsed == 0 {
            return Err("Selected target window handle is invalid.".to_string());
        }

        Ok(parsed as *mut c_void)
    }

    fn hwnd_to_string(hwnd: HWND) -> String {
        (hwnd as usize).to_string()
    }

    fn to_wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(windows))]
mod windows_input {
    use super::CandidateWindow;

    pub fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
        Err("Experimental window detection is only available on Windows.".to_string())
    }

    pub fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
        Err("Experimental window detection is only available on Windows.".to_string())
    }

    pub fn send_test_key_to_window(_hwnd: String, _key: String) -> Result<String, String> {
        Err("Experimental input is only available on Windows.".to_string())
    }
}

#[tauri::command]
fn list_candidate_windows() -> Result<Vec<CandidateWindow>, String> {
    windows_input::list_candidate_windows()
}

#[tauri::command]
fn find_sky_window() -> Result<Option<CandidateWindow>, String> {
    windows_input::find_sky_window()
}

#[tauri::command]
fn send_test_key_to_window(hwnd: String, key: String) -> Result<String, String> {
    windows_input::send_test_key_to_window(hwnd, key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dry_run_playback,
            find_sky_window,
            list_candidate_windows,
            send_test_key_to_window,
            test_rust_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
