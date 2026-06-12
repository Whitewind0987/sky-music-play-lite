use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const LOG_DIR_NAME: &str = "logs";
const LOG_FILE_NAME: &str = "sky-music-play-lite.log";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRuntimeInfo {
    product_name: String,
    version: String,
    log_directory: String,
    log_file: String,
    log_directory_fallback_used: bool,
}

#[derive(Deserialize, Serialize)]
pub struct AppLogEntry {
    level: AppLogLevel,
    source: String,
    message: String,
    details: Option<Value>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppLogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Serialize)]
struct PersistedAppLogEntry {
    timestamp_ms: u128,
    level: AppLogLevel,
    source: String,
    message: String,
    details: Option<Value>,
}

#[tauri::command]
pub fn get_app_runtime_info(app: AppHandle) -> Result<AppRuntimeInfo, String> {
    let log_paths = resolve_log_paths(&app)?;
    let product_name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| app.package_info().name.clone());

    Ok(AppRuntimeInfo {
        product_name,
        version: app.package_info().version.to_string(),
        log_directory: log_paths.directory.display().to_string(),
        log_file: log_paths.file.display().to_string(),
        log_directory_fallback_used: log_paths.fallback_used,
    })
}

#[tauri::command]
pub fn append_app_log(app: AppHandle, entry: AppLogEntry) -> Result<(), String> {
    let log_paths = resolve_log_paths(&app)?;
    let persisted_entry = PersistedAppLogEntry {
        timestamp_ms: timestamp_ms(),
        level: entry.level,
        source: entry.source,
        message: entry.message,
        details: entry.details,
    };
    let line = serde_json::to_string(&persisted_entry)
        .map_err(|error| format!("Failed to serialize app log entry: {}", error))?;

    append_log_line(&log_paths.file, &line)
}

#[tauri::command]
pub fn open_log_directory(app: AppHandle) -> Result<(), String> {
    let log_paths = resolve_log_paths(&app)?;
    open_directory(&log_paths.directory)
}

struct LogPaths {
    directory: PathBuf,
    file: PathBuf,
    fallback_used: bool,
}

fn resolve_log_paths(app: &AppHandle) -> Result<LogPaths, String> {
    if let Some(exe_log_dir) = executable_log_directory() {
        if ensure_writable_log_directory(&exe_log_dir).is_ok() {
            return Ok(LogPaths {
                file: exe_log_dir.join(LOG_FILE_NAME),
                directory: exe_log_dir,
                fallback_used: false,
            });
        }
    }

    let app_data_log_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?
        .join(LOG_DIR_NAME);

    ensure_writable_log_directory(&app_data_log_dir)?;

    Ok(LogPaths {
        file: app_data_log_dir.join(LOG_FILE_NAME),
        directory: app_data_log_dir,
        fallback_used: true,
    })
}

fn executable_log_directory() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(LOG_DIR_NAME)))
}

fn ensure_writable_log_directory(log_dir: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(log_dir).map_err(|error| {
        format!(
            "Failed to create log directory at {}: {}",
            log_dir.display(),
            error
        )
    })?;

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join(LOG_FILE_NAME))
        .map(|_| ())
        .map_err(|error| {
            format!(
                "Failed to open log file at {}: {}",
                log_dir.join(LOG_FILE_NAME).display(),
                error
            )
        })
}

fn append_log_line(log_file: &PathBuf, line: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file)
        .map_err(|error| {
            format!(
                "Failed to open log file at {}: {}",
                log_file.display(),
                error
            )
        })?;

    writeln!(file, "{}", line).map_err(|error| {
        format!(
            "Failed to append log file at {}: {}",
            log_file.display(),
            error
        )
    })
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn open_directory(directory: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(directory);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(directory);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(directory);
        command
    };

    command.spawn().map(|_| ()).map_err(|error| {
        format!(
            "Failed to open log directory at {}: {}",
            directory.display(),
            error
        )
    })
}
