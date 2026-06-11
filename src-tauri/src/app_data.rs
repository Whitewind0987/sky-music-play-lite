use std::{fs, fs::File, io::Write, path::PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};

const APP_DATA_FILE_NAME: &str = "sky_music_play_lite_app_data.json";
const APP_DATA_TEMP_FILE_NAME: &str = "sky_music_play_lite_app_data.json.tmp";
const APP_DATA_BACKUP_FILE_NAME: &str = "sky_music_play_lite_app_data.json.bak";

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

    write_app_data_file_safely(&file_path, &content)?;

    Ok(file_path.display().to_string())
}

fn app_data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {}", error))?;

    Ok(app_data_dir.join(APP_DATA_FILE_NAME))
}

fn write_app_data_file_safely(file_path: &PathBuf, content: &str) -> Result<(), String> {
    let parent_dir = file_path
        .parent()
        .ok_or_else(|| "App data file path has no parent directory.".to_string())?;
    let temp_file_path = parent_dir.join(APP_DATA_TEMP_FILE_NAME);
    let backup_file_path = parent_dir.join(APP_DATA_BACKUP_FILE_NAME);

    remove_file_if_exists(&temp_file_path, "stale temporary app data file")?;

    {
        let mut temp_file = File::create(&temp_file_path).map_err(|error| {
            format!(
                "Failed to create temporary app data file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;

        temp_file.write_all(content.as_bytes()).map_err(|error| {
            let _ = fs::remove_file(&temp_file_path);
            format!(
                "Failed to write temporary app data file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;

        temp_file.sync_all().map_err(|error| {
            let _ = fs::remove_file(&temp_file_path);
            format!(
                "Failed to sync temporary app data file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;
    }

    match fs::rename(&temp_file_path, file_path) {
        Ok(()) => Ok(()),
        Err(rename_error) if file_path.exists() => replace_existing_app_data_file(
            file_path,
            &temp_file_path,
            &backup_file_path,
            rename_error,
        ),
        Err(rename_error) => {
            let _ = fs::remove_file(&temp_file_path);
            Err(format!(
                "Failed to replace app data file at {} with temporary file {}: {}",
                file_path.display(),
                temp_file_path.display(),
                rename_error
            ))
        }
    }
}

fn replace_existing_app_data_file(
    file_path: &PathBuf,
    temp_file_path: &PathBuf,
    backup_file_path: &PathBuf,
    original_rename_error: std::io::Error,
) -> Result<(), String> {
    remove_file_if_exists(backup_file_path, "stale backup app data file")?;

    fs::rename(file_path, backup_file_path).map_err(|backup_error| {
        let _ = fs::remove_file(temp_file_path);
        format!(
            "Failed to back up existing app data file at {} to {} after direct replace failed ({}): {}",
            file_path.display(),
            backup_file_path.display(),
            original_rename_error,
            backup_error
        )
    })?;

    match fs::rename(temp_file_path, file_path) {
        Ok(()) => {
            remove_file_if_exists(backup_file_path, "backup app data file after replacement")?;
            Ok(())
        }
        Err(final_rename_error) => {
            let restore_result = fs::rename(backup_file_path, file_path);
            let _ = fs::remove_file(temp_file_path);

            match restore_result {
                Ok(()) => Err(format!(
                    "Failed to replace app data file at {} with temporary file {} after backup: {}. Restored backup from {}.",
                    file_path.display(),
                    temp_file_path.display(),
                    final_rename_error,
                    backup_file_path.display()
                )),
                Err(restore_error) => Err(format!(
                    "Failed to replace app data file at {} with temporary file {} after backup: {}. Also failed to restore backup from {}: {}",
                    file_path.display(),
                    temp_file_path.display(),
                    final_rename_error,
                    backup_file_path.display(),
                    restore_error
                )),
            }
        }
    }
}

fn remove_file_if_exists(file_path: &PathBuf, label: &str) -> Result<(), String> {
    match fs::remove_file(file_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to remove {} at {}: {}",
            label,
            file_path.display(),
            error
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env, process,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_test_dir(test_name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after Unix epoch")
            .as_nanos();

        env::temp_dir().join(format!(
            "sky_music_play_lite_app_data_test_{}_{}_{}",
            test_name,
            process::id(),
            timestamp
        ))
    }

    fn create_test_file_path(test_name: &str) -> PathBuf {
        let test_dir = unique_test_dir(test_name);
        fs::create_dir_all(&test_dir).expect("test directory should be created");
        test_dir.join(APP_DATA_FILE_NAME)
    }

    fn cleanup_test_path(file_path: &PathBuf) {
        if let Some(parent_dir) = file_path.parent() {
            let _ = fs::remove_dir_all(parent_dir);
        }
    }

    #[test]
    fn safe_write_creates_new_file() {
        let file_path = create_test_file_path("creates_new_file");

        write_app_data_file_safely(&file_path, r#"{"value":1}"#)
            .expect("safe write should create a new file");

        assert_eq!(fs::read_to_string(&file_path).unwrap(), r#"{"value":1}"#);
        assert!(!file_path.with_file_name(APP_DATA_TEMP_FILE_NAME).exists());

        cleanup_test_path(&file_path);
    }

    #[test]
    fn safe_write_replaces_existing_file() {
        let file_path = create_test_file_path("replaces_existing_file");
        fs::write(&file_path, r#"{"value":"old"}"#).expect("old file should be written");

        write_app_data_file_safely(&file_path, r#"{"value":"new"}"#)
            .expect("safe write should replace the old file");

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            r#"{"value":"new"}"#
        );
        assert!(!file_path.with_file_name(APP_DATA_BACKUP_FILE_NAME).exists());
        assert!(!file_path.with_file_name(APP_DATA_TEMP_FILE_NAME).exists());

        cleanup_test_path(&file_path);
    }

    #[test]
    fn safe_write_replaces_stale_temp_file() {
        let file_path = create_test_file_path("replaces_stale_temp_file");
        let temp_file_path = file_path.with_file_name(APP_DATA_TEMP_FILE_NAME);
        fs::write(&temp_file_path, "stale").expect("stale temp file should be written");

        write_app_data_file_safely(&file_path, r#"{"value":"fresh"}"#)
            .expect("safe write should replace stale temp file");

        assert_eq!(
            fs::read_to_string(&file_path).unwrap(),
            r#"{"value":"fresh"}"#
        );
        assert!(!temp_file_path.exists());

        cleanup_test_path(&file_path);
    }
}
