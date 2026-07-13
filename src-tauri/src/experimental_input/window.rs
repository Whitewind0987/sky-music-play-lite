use super::CandidateWindow;
use std::ffi::c_void;
use std::path::Path;

use windows_sys::core::BOOL;
use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HWND, LPARAM};
use windows_sys::Win32::System::Threading::{
    GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsWindow, IsWindowVisible,
};

const SKY_WINDOW_CLASS_NAME: &str = "TgcMainWindow";
const SKY_PROCESS_NAME: &str = "Sky.exe";
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
    Ok(scan_sky_windows()?
        .into_iter()
        .next()
        .map(|item| item.candidate))
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SkyWindowIdentity {
    pub hwnd: String,
    pub process_id: u32,
    pub process_creation_time: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct VerifiedSkyWindow {
    pub candidate: CandidateWindow,
    pub identity: SkyWindowIdentity,
}

pub(crate) fn scan_sky_windows() -> Result<Vec<VerifiedSkyWindow>, String> {
    let mut state = SkyScanState {
        windows: Vec::new(),
        metadata_error: false,
    };
    let result = unsafe { EnumWindows(Some(enum_sky_window), &mut state as *mut _ as LPARAM) };
    if result == 0 {
        return Err("Failed to enumerate Sky windows.".to_string());
    }
    if state.windows.is_empty() && state.metadata_error {
        return Err("Sky window process metadata could not be queried.".to_string());
    }
    state.windows.sort_by(|a, b| {
        a.identity
            .process_id
            .cmp(&b.identity.process_id)
            .then_with(|| a.identity.hwnd.cmp(&b.identity.hwnd))
    });
    Ok(state.windows)
}

struct SkyScanState {
    windows: Vec<VerifiedSkyWindow>,
    metadata_error: bool,
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

unsafe extern "system" fn enum_sky_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if unsafe { IsWindow(hwnd) } == 0 || unsafe { IsWindowVisible(hwnd) } == 0 {
        return 1;
    }
    let class_name = get_window_class_name(hwnd);
    if !is_sky_class_name(&class_name) {
        return 1;
    }
    let (process_id, process_name, process_creation_time) = get_process_metadata(hwnd);
    let state = unsafe { &mut *(lparam as *mut SkyScanState) };
    if process_id.is_none() || process_name.is_none() {
        state.metadata_error = true;
        return 1;
    }
    if !is_verified_sky_window(&class_name, process_name.as_deref()) {
        return 1;
    }
    let Some(process_id) = process_id else {
        return 1;
    };
    let candidate = CandidateWindow {
        hwnd: hwnd_to_string(hwnd),
        title: get_window_title(hwnd),
        class_name,
        process_name,
        process_id: Some(process_id),
    };
    state.windows.push(VerifiedSkyWindow {
        identity: SkyWindowIdentity {
            hwnd: candidate.hwnd.clone(),
            process_id,
            process_creation_time,
        },
        candidate,
    });
    1
}

fn build_candidate_window(hwnd: HWND) -> CandidateWindow {
    let (process_id, process_name, _) = get_process_metadata(hwnd);
    CandidateWindow {
        hwnd: hwnd_to_string(hwnd),
        title: get_window_title(hwnd),
        class_name: get_window_class_name(hwnd),
        process_name,
        process_id,
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

fn get_process_metadata(hwnd: HWND) -> (Option<u32>, Option<String>, Option<u64>) {
    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut process_id);
    }

    if process_id == 0 {
        return (None, None, None);
    }

    let process_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };

    if process_handle.is_null() {
        return (Some(process_id), None, None);
    }

    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = creation;
    let mut kernel = creation;
    let mut user = creation;
    let creation_time = (unsafe {
        GetProcessTimes(
            process_handle,
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    } != 0)
        .then_some(((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64);

    let mut buffer = vec![0u16; MAX_PROCESS_PATH_LENGTH];
    let mut buffer_length = buffer.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(process_handle, 0, buffer.as_mut_ptr(), &mut buffer_length)
    };

    unsafe {
        CloseHandle(process_handle);
    }

    if result == 0 || buffer_length == 0 {
        return (Some(process_id), None, creation_time);
    }

    let path = String::from_utf16_lossy(&buffer[..buffer_length as usize]);

    let process_name = Path::new(&path)
        .file_name()
        .map(|file_name| file_name.to_string_lossy().to_string());
    (Some(process_id), process_name, creation_time)
}

pub(crate) fn is_sky_process_name(value: &str) -> bool {
    value.eq_ignore_ascii_case(SKY_PROCESS_NAME)
}
pub(crate) fn is_sky_class_name(value: &str) -> bool {
    value == SKY_WINDOW_CLASS_NAME
}
fn is_verified_sky_window(class_name: &str, process_name: Option<&str>) -> bool {
    is_sky_class_name(class_name) && process_name.is_some_and(is_sky_process_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn executable_comparison_is_case_insensitive() {
        assert!(is_sky_process_name("SKY.EXE"));
    }
    #[test]
    fn class_name_must_match_exactly() {
        assert!(is_sky_class_name("TgcMainWindow"));
        assert!(!is_sky_class_name("Other"));
    }
    #[test]
    fn class_only_false_positive_is_rejected() {
        assert!(!is_verified_sky_window("TgcMainWindow", Some("Other.exe")));
    }
    #[test]
    fn sky_with_wrong_class_is_rejected() {
        assert!(!is_verified_sky_window("Other", Some("Sky.exe")));
    }
}

fn hwnd_to_string(hwnd: HWND) -> String {
    (hwnd as usize).to_string()
}
