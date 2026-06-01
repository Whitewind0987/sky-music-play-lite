use std::{fs, path::PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};

const APP_DATA_FILE_NAME: &str = "sky_music_play_lite_app_data.json";

#[tauri::command]
pub fn load_app_data(app: AppHandle) -> Result<Option<Value>, String> {
    let file_path = app_data_file_path(&app)?;

    if !file_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&file_path).map_err(|error| {
        format!(
            "Failed to read app data file at {}: {}",
            file_path.display(),
            error
        )
    })?;

    serde_json::from_str(&content).map(Some).map_err(|error| {
        format!(
            "App data file at {} is not valid JSON: {}",
            file_path.display(),
            error
        )
    })
}

#[tauri::command]
pub fn save_app_data(app: AppHandle, app_data: Value) -> Result<String, String> {
    let file_path = app_data_file_path(&app)?;
    let parent_dir = file_path
        .parent()
        .ok_or_else(|| "App data file path has no parent directory.".to_string())?;

    fs::create_dir_all(parent_dir).map_err(|error| {
        format!(
            "Failed to create app data directory at {}: {}",
            parent_dir.display(),
            error
        )
    })?;

    let content = serde_json::to_string_pretty(&app_data)
        .map_err(|error| format!("Failed to serialize app data: {}", error))?;

    fs::write(&file_path, content).map_err(|error| {
        format!(
            "Failed to write app data file at {}: {}",
            file_path.display(),
            error
        )
    })?;

    Ok(file_path.display().to_string())
}

fn app_data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

    Ok(app_data_dir.join(APP_DATA_FILE_NAME))
}
