use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const IMPORTED_SCORES_DIR_NAME: &str = "imported-scores";
const IMPORTED_SCORE_FILE_EXTENSION: &str = "json";
const IMPORTED_SCORE_TEMP_EXTENSION: &str = "json.tmp";
const IMPORTED_SCORE_BACKUP_EXTENSION: &str = "json.bak";
const MAX_SCORE_ID_LENGTH: usize = 128;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreFileMetadata {
    file_name: String,
    id: String,
    modified_ms: Option<u128>,
    path: String,
    size_bytes: u64,
}

#[tauri::command]
pub fn resolve_imported_scores_directory() -> Result<String, String> {
    current_exe_imported_scores_directory().map(|directory| display_path(&directory))
}

#[tauri::command]
pub fn ensure_imported_scores_directory() -> Result<String, String> {
    let directory = current_exe_imported_scores_directory()?;

    ensure_imported_scores_directory_at(&directory)?;

    Ok(display_path(&directory))
}

#[tauri::command]
pub fn save_imported_score_song(song_id: String, song: Value) -> Result<String, String> {
    let directory = current_exe_imported_scores_directory()?;
    let file_path = save_imported_score_song_at(&directory, &song_id, &song)?;

    Ok(display_path(&file_path))
}

#[tauri::command]
pub fn read_imported_score_song(song_id: String) -> Result<Value, String> {
    let directory = current_exe_imported_scores_directory()?;

    read_imported_score_song_at(&directory, &song_id)
}

#[tauri::command]
pub fn imported_score_file_exists(song_id: String) -> Result<bool, String> {
    let directory = current_exe_imported_scores_directory()?;
    let file_path = imported_score_file_path(&directory, &song_id)?;

    Ok(file_path.is_file())
}

#[tauri::command]
pub fn delete_imported_score_file(song_id: String) -> Result<bool, String> {
    let directory = current_exe_imported_scores_directory()?;

    delete_imported_score_file_at(&directory, &song_id)
}

#[tauri::command]
pub fn list_imported_score_files() -> Result<Vec<ImportedScoreFileMetadata>, String> {
    let directory = current_exe_imported_scores_directory()?;

    list_imported_score_files_at(&directory)
}

#[tauri::command]
pub fn clear_imported_score_files() -> Result<usize, String> {
    let directory = current_exe_imported_scores_directory()?;

    clear_imported_score_files_at(&directory)
}

#[tauri::command]
pub fn open_imported_scores_directory(app: AppHandle) -> Result<(), String> {
    let directory = current_exe_imported_scores_directory()?;

    ensure_imported_scores_directory_at(&directory)?;
    app.opener()
        .open_path(display_path(&directory), None::<String>)
        .map_err(|error| {
            format!(
                "Failed to open imported score directory at {}: {}",
                directory.display(),
                error
            )
        })
}

fn current_exe_imported_scores_directory() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve current executable path: {}", error))?;
    let exe_directory = exe_path.parent().ok_or_else(|| {
        format!(
            "Current executable path has no parent directory: {}",
            exe_path.display()
        )
    })?;

    Ok(exe_directory.join(IMPORTED_SCORES_DIR_NAME))
}

fn ensure_imported_scores_directory_at(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| {
        format!(
            "Failed to create imported score directory at {}: {}",
            directory.display(),
            error
        )
    })
}

fn save_imported_score_song_at(
    directory: &Path,
    song_id: &str,
    song: &Value,
) -> Result<PathBuf, String> {
    ensure_imported_scores_directory_at(directory)?;

    let file_path = imported_score_file_path(directory, song_id)?;
    let temp_file_path = imported_score_temp_file_path(directory, song_id)?;
    let backup_file_path = imported_score_backup_file_path(directory, song_id)?;
    let content = serde_json::to_string_pretty(&Value::Array(vec![song.clone()]))
        .map_err(|error| format!("Failed to serialize imported score {}: {}", song_id, error))?;

    remove_file_if_exists(&temp_file_path, "stale temporary imported score file")?;

    {
        let mut temp_file = File::create(&temp_file_path).map_err(|error| {
            format!(
                "Failed to create temporary imported score file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;

        temp_file.write_all(content.as_bytes()).map_err(|error| {
            let _ = fs::remove_file(&temp_file_path);
            format!(
                "Failed to write temporary imported score file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;

        temp_file.sync_all().map_err(|error| {
            let _ = fs::remove_file(&temp_file_path);
            format!(
                "Failed to sync temporary imported score file at {}: {}",
                temp_file_path.display(),
                error
            )
        })?;
    }

    match fs::rename(&temp_file_path, &file_path) {
        Ok(()) => Ok(file_path),
        Err(rename_error) if file_path.exists() => {
            replace_existing_imported_score_file(
                &file_path,
                &temp_file_path,
                &backup_file_path,
                rename_error,
            )?;
            Ok(file_path)
        }
        Err(rename_error) => {
            let _ = fs::remove_file(&temp_file_path);
            Err(format!(
                "Failed to replace imported score file at {} with temporary file {}: {}",
                file_path.display(),
                temp_file_path.display(),
                rename_error
            ))
        }
    }
}

fn read_imported_score_song_at(directory: &Path, song_id: &str) -> Result<Value, String> {
    let file_path = imported_score_file_path(directory, song_id)?;
    let content = fs::read_to_string(&file_path).map_err(|error| {
        format!(
            "Failed to read imported score file at {}: {}",
            file_path.display(),
            error
        )
    })?;
    let parsed: Value = serde_json::from_str(&content).map_err(|error| {
        format!(
            "Imported score file at {} is not valid JSON: {}",
            file_path.display(),
            error
        )
    })?;
    let songs = parsed.as_array().ok_or_else(|| {
        format!(
            "Imported score file at {} must contain a top-level song array",
            file_path.display()
        )
    })?;

    if songs.len() != 1 {
        return Err(format!(
            "Imported score file at {} must contain exactly one song, found {}",
            file_path.display(),
            songs.len()
        ));
    }

    Ok(songs[0].clone())
}

fn delete_imported_score_file_at(directory: &Path, song_id: &str) -> Result<bool, String> {
    let file_path = imported_score_file_path(directory, song_id)?;

    match fs::remove_file(&file_path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Failed to delete imported score file at {}: {}",
            file_path.display(),
            error
        )),
    }
}

fn list_imported_score_files_at(
    directory: &Path,
) -> Result<Vec<ImportedScoreFileMetadata>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(directory).map_err(|error| {
        format!(
            "Failed to list imported score directory at {}: {}",
            directory.display(),
            error
        )
    })?;

    for entry_result in entries {
        let entry = entry_result.map_err(|error| {
            format!(
                "Failed to read imported score directory entry at {}: {}",
                directory.display(),
                error
            )
        })?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let Some(score_id) = managed_score_id_from_file_name(&file_name) else {
            continue;
        };
        let metadata = entry.metadata().map_err(|error| {
            format!(
                "Failed to read imported score file metadata at {}: {}",
                entry.path().display(),
                error
            )
        })?;

        if !metadata.is_file() {
            continue;
        }

        files.push(ImportedScoreFileMetadata {
            file_name,
            id: score_id,
            modified_ms: metadata_modified_ms(&metadata),
            path: display_path(&entry.path()),
            size_bytes: metadata.len(),
        });
    }

    files.sort_by(|left, right| left.id.cmp(&right.id));

    Ok(files)
}

fn clear_imported_score_files_at(directory: &Path) -> Result<usize, String> {
    let files = list_imported_score_files_at(directory)?;
    let mut removed_count = 0;

    for file in files {
        let file_path = imported_score_file_path(directory, &file.id)?;

        fs::remove_file(&file_path).map_err(|error| {
            format!(
                "Failed to clear imported score file at {}: {}",
                file_path.display(),
                error
            )
        })?;
        removed_count += 1;
    }

    Ok(removed_count)
}

fn replace_existing_imported_score_file(
    file_path: &Path,
    temp_file_path: &Path,
    backup_file_path: &Path,
    original_rename_error: std::io::Error,
) -> Result<(), String> {
    remove_file_if_exists(backup_file_path, "stale backup imported score file")?;

    fs::rename(file_path, backup_file_path).map_err(|backup_error| {
        let _ = fs::remove_file(temp_file_path);
        format!(
            "Failed to back up existing imported score file at {} to {} after direct replace failed ({}): {}",
            file_path.display(),
            backup_file_path.display(),
            original_rename_error,
            backup_error
        )
    })?;

    match fs::rename(temp_file_path, file_path) {
        Ok(()) => {
            remove_file_if_exists(
                backup_file_path,
                "backup imported score file after replacement",
            )?;
            Ok(())
        }
        Err(final_rename_error) => {
            let restore_result = fs::rename(backup_file_path, file_path);
            let _ = fs::remove_file(temp_file_path);

            match restore_result {
                Ok(()) => Err(format!(
                    "Failed to replace imported score file at {} with temporary file {} after backup: {}. Restored backup from {}.",
                    file_path.display(),
                    temp_file_path.display(),
                    final_rename_error,
                    backup_file_path.display()
                )),
                Err(restore_error) => Err(format!(
                    "Failed to replace imported score file at {} with temporary file {} after backup: {}. Also failed to restore backup from {}: {}",
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

fn imported_score_file_path(directory: &Path, song_id: &str) -> Result<PathBuf, String> {
    validate_imported_score_id(song_id)?;

    Ok(directory.join(format!("{}.{}", song_id, IMPORTED_SCORE_FILE_EXTENSION)))
}

fn imported_score_temp_file_path(directory: &Path, song_id: &str) -> Result<PathBuf, String> {
    validate_imported_score_id(song_id)?;

    Ok(directory.join(format!("{}.{}", song_id, IMPORTED_SCORE_TEMP_EXTENSION)))
}

fn imported_score_backup_file_path(directory: &Path, song_id: &str) -> Result<PathBuf, String> {
    validate_imported_score_id(song_id)?;

    Ok(directory.join(format!("{}.{}", song_id, IMPORTED_SCORE_BACKUP_EXTENSION)))
}

fn validate_imported_score_id(song_id: &str) -> Result<(), String> {
    if song_id.is_empty() {
        return Err("Imported score ID must not be empty.".to_string());
    }

    if song_id.len() > MAX_SCORE_ID_LENGTH {
        return Err(format!(
            "Imported score ID is too long: {} bytes, maximum {}.",
            song_id.len(),
            MAX_SCORE_ID_LENGTH
        ));
    }

    if !song_id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(format!(
            "Imported score ID contains unsupported characters: {}",
            song_id
        ));
    }

    Ok(())
}

fn managed_score_id_from_file_name(file_name: &str) -> Option<String> {
    let score_id = file_name.strip_suffix(".json")?;

    validate_imported_score_id(score_id).ok()?;

    Some(score_id.to_string())
}

fn remove_file_if_exists(file_path: &Path, label: &str) -> Result<(), String> {
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

fn metadata_modified_ms(metadata: &fs::Metadata) -> Option<u128> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env, process,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory {
        path: PathBuf,
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn unique_test_dir(test_name: &str) -> TestDirectory {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after Unix epoch")
            .as_nanos();

        TestDirectory {
            path: env::temp_dir().join(format!(
                "sky_music_play_lite_imported_scores_test_{}_{}_{}",
                test_name,
                process::id(),
                timestamp
            )),
        }
    }

    fn sample_song(name: &str) -> Value {
        serde_json::json!({
            "name": name,
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "songNotes": [
                {
                    "time": 0,
                    "key": "1Key0"
                }
            ]
        })
    }

    #[test]
    fn valid_id_resolves_to_json_file_inside_directory() {
        let test_dir = unique_test_dir("valid_id_resolves");
        let file_path = imported_score_file_path(&test_dir.path, "local-123_ABC")
            .expect("valid score ID should resolve");

        assert_eq!(file_path, test_dir.path.join("local-123_ABC.json"));
        assert!(file_path.starts_with(&test_dir.path));
    }

    #[test]
    fn invalid_ids_are_rejected_before_path_use() {
        let test_dir = unique_test_dir("invalid_ids");
        let invalid_ids = [
            "",
            "..",
            "../escape",
            "nested/path",
            "nested\\path",
            "C:\\absolute",
            "/absolute",
            ".hidden",
            "local.1",
            "local 1",
            "local:1",
        ];

        for score_id in invalid_ids {
            assert!(
                imported_score_file_path(&test_dir.path, score_id).is_err(),
                "{score_id:?} should be rejected"
            );
        }
    }

    #[test]
    fn directory_creation_uses_supplied_directory() {
        let test_dir = unique_test_dir("directory_creation");

        ensure_imported_scores_directory_at(&test_dir.path).expect("directory should be created");

        assert!(test_dir.path.is_dir());
    }

    #[test]
    fn save_and_read_round_trip() {
        let test_dir = unique_test_dir("round_trip");
        let song = sample_song("Round Trip");

        save_imported_score_song_at(&test_dir.path, "local-1", &song)
            .expect("song should be saved");
        let read_song =
            read_imported_score_song_at(&test_dir.path, "local-1").expect("song should be read");

        assert_eq!(read_song, song);
    }

    #[test]
    fn saved_json_uses_one_item_top_level_array() {
        let test_dir = unique_test_dir("one_item_array");
        let song = sample_song("Single Array");
        let file_path = save_imported_score_song_at(&test_dir.path, "local-1", &song)
            .expect("song should be saved");
        let parsed: Value = serde_json::from_str(
            &fs::read_to_string(file_path).expect("saved file should be readable"),
        )
        .expect("saved file should be valid JSON");
        let songs = parsed.as_array().expect("top level should be an array");

        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0], song);
    }

    #[test]
    fn safe_save_replaces_existing_file() {
        let test_dir = unique_test_dir("safe_replace");
        let first_song = sample_song("Old");
        let replacement_song = sample_song("New");

        save_imported_score_song_at(&test_dir.path, "local-1", &first_song)
            .expect("initial song should be saved");
        save_imported_score_song_at(&test_dir.path, "local-1", &replacement_song)
            .expect("replacement song should be saved");

        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            replacement_song
        );
        assert!(!test_dir.path.join("local-1.json.tmp").exists());
        assert!(!test_dir.path.join("local-1.json.bak").exists());
    }

    #[test]
    fn delete_existing_file() {
        let test_dir = unique_test_dir("delete_existing");
        let song = sample_song("Delete Me");

        save_imported_score_song_at(&test_dir.path, "local-1", &song)
            .expect("song should be saved");

        assert!(delete_imported_score_file_at(&test_dir.path, "local-1")
            .expect("existing file should be deleted"));
        assert!(!test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn delete_missing_file_is_successful_noop() {
        let test_dir = unique_test_dir("delete_missing");

        assert!(!delete_imported_score_file_at(&test_dir.path, "local-1")
            .expect("missing file should be treated as deleted"));
    }

    #[test]
    fn list_only_managed_json_score_files() {
        let test_dir = unique_test_dir("list_managed");

        fs::create_dir_all(&test_dir.path).expect("directory should be created");
        fs::write(test_dir.path.join("local-1.json"), "[]")
            .expect("managed file should be written");
        fs::write(test_dir.path.join("LOCAL-2.json"), "[]")
            .expect("uppercase managed file should be written");
        fs::write(test_dir.path.join("local-3.JSON"), "[]")
            .expect("uppercase extension should be written");
        fs::write(test_dir.path.join("bad name.json"), "[]")
            .expect("invalid ID file should be written");
        fs::write(test_dir.path.join("local-4.json.tmp"), "stale")
            .expect("temporary file should be written");
        fs::create_dir(test_dir.path.join("local-5.json"))
            .expect("directory with json suffix should be created");

        let files =
            list_imported_score_files_at(&test_dir.path).expect("managed files should be listed");
        let ids: Vec<_> = files.into_iter().map(|file| file.id).collect();

        assert_eq!(ids, vec!["LOCAL-2", "local-1"]);
    }

    #[test]
    fn clear_only_managed_score_files() {
        let test_dir = unique_test_dir("clear_managed");

        fs::create_dir_all(&test_dir.path).expect("directory should be created");
        fs::write(test_dir.path.join("local-1.json"), "[]")
            .expect("managed file should be written");
        fs::write(test_dir.path.join("bad name.json"), "[]")
            .expect("invalid ID file should be written");
        fs::write(test_dir.path.join("local-2.txt"), "[]")
            .expect("non-json file should be written");
        fs::write(test_dir.path.join("local-3.json.tmp"), "stale")
            .expect("temporary file should be written");

        assert_eq!(
            clear_imported_score_files_at(&test_dir.path).expect("managed files should be cleared"),
            1
        );
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(test_dir.path.join("bad name.json").exists());
        assert!(test_dir.path.join("local-2.txt").exists());
        assert!(test_dir.path.join("local-3.json.tmp").exists());
    }

    #[test]
    fn save_removes_stale_temporary_file() {
        let test_dir = unique_test_dir("stale_temp");
        let stale_temp_path = test_dir.path.join("local-1.json.tmp");

        fs::create_dir_all(&test_dir.path).expect("directory should be created");
        fs::write(&stale_temp_path, "stale").expect("stale temp file should be written");

        save_imported_score_song_at(&test_dir.path, "local-1", &sample_song("Fresh"))
            .expect("song should be saved after stale temp cleanup");

        assert!(!stale_temp_path.exists());
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap()["name"],
            "Fresh"
        );
    }

    #[test]
    fn rejected_ids_do_not_escape_supplied_directory() {
        let test_dir = unique_test_dir("no_escape");
        let outside_file = test_dir
            .path
            .parent()
            .expect("test directory should have parent")
            .join("escape.json");

        assert!(
            save_imported_score_song_at(&test_dir.path, "../escape", &sample_song("Escape"))
                .is_err()
        );
        assert!(delete_imported_score_file_at(&test_dir.path, "../escape").is_err());
        assert!(!outside_file.exists());
    }
}
