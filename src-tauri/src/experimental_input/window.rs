use super::{to_wide_null, CandidateWindow};
use std::ffi::c_void;
use std::path::Path;
use std::ptr::null;

use windows_sys::core::BOOL;
use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowW, GetClassNameW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible,
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

pub(crate) fn parse_hwnd(hwnd: &str) -> Result<HWND, String> {
    let parsed = hwnd
        .parse::<usize>()
        .map_err(|_| "Selected target window handle is invalid.".to_string())?;

    if parsed == 0 {
        return Err("Selected target window handle is invalid.".to_string());
    }

    Ok(parsed as *mut c_void)
}

unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if unsafe { IsWindowVisible(hwnd) } == 0 {
        return 1;
    }

    let title = get_window_title(hwnd);

    if title.trim().is_empty() {
        return 1;
    }

    let windows = unsafe { &mut *(lparam as *mut Vec<CandidateWindow>) };
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

    let process_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };

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

fn hwnd_to_string(hwnd: HWND) -> String {
    (hwnd as usize).to_string()
}
