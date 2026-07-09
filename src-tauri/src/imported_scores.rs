use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const IMPORTED_SCORES_DIR_NAME: &str = "imported-scores";
const IMPORTED_SCORE_FILE_EXTENSION: &str = "json";
const CANONICAL_FILE_NAME_SEPARATOR: &str = "__";
const FALLBACK_SCORE_TITLE_SEGMENT: &str = "untitled-score";
const MAX_SCORE_ID_LENGTH: usize = 128;
const MAX_SCORE_TITLE_SEGMENT_CHARS: usize = 64;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreFileMetadata {
    file_name: String,
    id: String,
    modified_ms: Option<u128>,
    path: String,
    size_bytes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreReconcileEntry {
    song_id: String,
    song: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreReconcileReport {
    created_count: usize,
    failed: Vec<ImportedScoreReconcileFailure>,
    renamed_count: usize,
    unchanged_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreReconcileFailure {
    error: String,
    song_id: String,
    song_name: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ManagedScoreFileKind {
    Canonical,
    Legacy,
}

#[derive(Clone)]
struct ManagedScoreFile {
    file_name: String,
    id: String,
    kind: ManagedScoreFileKind,
    modified_ms: Option<u128>,
    path: PathBuf,
    size_bytes: u64,
}

struct ParsedManagedScoreFileName {
    id: String,
    kind: ManagedScoreFileKind,
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

    imported_score_file_exists_at(&directory, &song_id)
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
pub fn reconcile_imported_score_files(
    entries: Vec<ImportedScoreReconcileEntry>,
) -> Result<ImportedScoreReconcileReport, String> {
    let directory = current_exe_imported_scores_directory()?;

    reconcile_imported_score_files_at(&directory, entries)
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

    let existing_files = managed_score_files_for_id(directory, song_id)?;
    let file_path = canonical_imported_score_file_path(directory, song_id, song)?;
    write_imported_score_song_file(&file_path, song_id, song)?;
    remove_redundant_managed_files(&existing_files, &file_path)?;

    Ok(file_path)
}

fn read_imported_score_song_at(directory: &Path, song_id: &str) -> Result<Value, String> {
    let file = resolve_preferred_imported_score_file(directory, song_id)?.ok_or_else(|| {
        format!(
            "No imported score file found for ID {} in {}",
            song_id,
            directory.display()
        )
    })?;

    read_one_song_from_file(&file.path)
}

fn imported_score_file_exists_at(directory: &Path, song_id: &str) -> Result<bool, String> {
    Ok(!managed_score_files_for_id(directory, song_id)?.is_empty())
}

fn delete_imported_score_file_at(directory: &Path, song_id: &str) -> Result<bool, String> {
    let files = managed_score_files_for_id(directory, song_id)?;

    if files.is_empty() {
        return Ok(false);
    }

    for file in files {
        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to delete imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
    }

    Ok(true)
}

fn list_imported_score_files_at(
    directory: &Path,
) -> Result<Vec<ImportedScoreFileMetadata>, String> {
    let files = scan_managed_score_files(directory)?;
    let mut selected_files = BTreeMap::<String, ManagedScoreFile>::new();

    for file in files {
        selected_files
            .entry(file.id.clone())
            .and_modify(|current_file| {
                if is_preferred_managed_file(&file, current_file) {
                    *current_file = file.clone();
                }
            })
            .or_insert(file);
    }

    Ok(selected_files
        .into_values()
        .map(|file| ImportedScoreFileMetadata {
            file_name: file.file_name,
            id: file.id,
            modified_ms: file.modified_ms,
            path: display_path(&file.path),
            size_bytes: file.size_bytes,
        })
        .collect())
}

fn clear_imported_score_files_at(directory: &Path) -> Result<usize, String> {
    let files = scan_managed_score_files(directory)?;
    let mut removed_count = 0;

    for file in files {
        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to clear imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
        removed_count += 1;
    }

    Ok(removed_count)
}

fn reconcile_imported_score_files_at(
    directory: &Path,
    entries: Vec<ImportedScoreReconcileEntry>,
) -> Result<ImportedScoreReconcileReport, String> {
    ensure_imported_scores_directory_at(directory)?;

    let mut report = ImportedScoreReconcileReport {
        created_count: 0,
        failed: Vec::new(),
        renamed_count: 0,
        unchanged_count: 0,
    };

    for entry in entries {
        let song_name = song_name_from_value(&entry.song).to_string();

        match reconcile_one_imported_score_file(directory, &entry.song_id, &entry.song) {
            Ok(ReconcileAction::Created) => report.created_count += 1,
            Ok(ReconcileAction::Renamed) => report.renamed_count += 1,
            Ok(ReconcileAction::Unchanged) => report.unchanged_count += 1,
            Err(error) => report.failed.push(ImportedScoreReconcileFailure {
                error,
                song_id: entry.song_id,
                song_name,
            }),
        }
    }

    Ok(report)
}

enum ReconcileAction {
    Created,
    Renamed,
    Unchanged,
}

fn reconcile_one_imported_score_file(
    directory: &Path,
    song_id: &str,
    song: &Value,
) -> Result<ReconcileAction, String> {
    validate_imported_score_id(song_id)?;

    let canonical_path = canonical_imported_score_file_path(directory, song_id, song)?;
    let files = managed_score_files_for_id(directory, song_id)?;

    if files.is_empty() {
        write_imported_score_song_file(&canonical_path, song_id, song)?;
        return Ok(ReconcileAction::Created);
    }

    let selected_file = select_reconcile_source_file(&files, &canonical_path);

    read_one_song_from_file(&selected_file.path)?;

    if selected_file.path == canonical_path {
        remove_valid_redundant_managed_files(&files, &canonical_path)?;
        return Ok(ReconcileAction::Unchanged);
    }

    fs::rename(&selected_file.path, &canonical_path).map_err(|error| {
        format!(
            "Failed to rename imported score file at {} to {}: {}",
            selected_file.path.display(),
            canonical_path.display(),
            error
        )
    })?;

    remove_valid_redundant_managed_files(&files, &canonical_path)?;

    Ok(ReconcileAction::Renamed)
}

fn select_reconcile_source_file<'a>(
    files: &'a [ManagedScoreFile],
    canonical_path: &Path,
) -> &'a ManagedScoreFile {
    files
        .iter()
        .find(|file| file.path == canonical_path)
        .or_else(|| {
            files
                .iter()
                .filter(|file| file.kind == ManagedScoreFileKind::Canonical)
                .min_by(|left, right| left.file_name.cmp(&right.file_name))
        })
        .unwrap_or_else(|| {
            files
                .iter()
                .min_by(|left, right| left.file_name.cmp(&right.file_name))
                .expect("reconcile source requires at least one managed file")
        })
}

fn remove_redundant_managed_files(
    files: &[ManagedScoreFile],
    keep_path: &Path,
) -> Result<(), String> {
    for file in files {
        if file.path == keep_path || !file.path.exists() {
            continue;
        }

        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to remove redundant imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn remove_valid_redundant_managed_files(
    files: &[ManagedScoreFile],
    keep_path: &Path,
) -> Result<(), String> {
    for file in files {
        if file.path == keep_path || !file.path.exists() {
            continue;
        }

        if read_one_song_from_file(&file.path).is_err() {
            continue;
        }

        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to remove redundant imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn write_imported_score_song_file(
    file_path: &Path,
    song_id: &str,
    song: &Value,
) -> Result<(), String> {
    let parent_dir = file_path
        .parent()
        .ok_or_else(|| "Imported score file path has no parent directory.".to_string())?;
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Imported score file path has no valid file name.".to_string())?;
    let temp_file_path = parent_dir.join(format!("{}.tmp", file_name));
    let backup_file_path = parent_dir.join(format!("{}.bak", file_name));
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

    match fs::rename(&temp_file_path, file_path) {
        Ok(()) => Ok(()),
        Err(rename_error) if file_path.exists() => {
            replace_existing_imported_score_file(
                file_path,
                &temp_file_path,
                &backup_file_path,
                rename_error,
            )?;
            Ok(())
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

fn read_one_song_from_file(file_path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(file_path).map_err(|error| {
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

fn resolve_preferred_imported_score_file(
    directory: &Path,
    song_id: &str,
) -> Result<Option<ManagedScoreFile>, String> {
    let files = managed_score_files_for_id(directory, song_id)?;

    Ok(files.into_iter().reduce(|current_file, next_file| {
        if is_preferred_managed_file(&next_file, &current_file) {
            next_file
        } else {
            current_file
        }
    }))
}

fn managed_score_files_for_id(
    directory: &Path,
    song_id: &str,
) -> Result<Vec<ManagedScoreFile>, String> {
    validate_imported_score_id(song_id)?;

    Ok(scan_managed_score_files(directory)?
        .into_iter()
        .filter(|file| file.id == song_id)
        .collect())
}

fn scan_managed_score_files(directory: &Path) -> Result<Vec<ManagedScoreFile>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(directory).map_err(|error| {
        format!(
            "Failed to list imported score directory at {}: {}",
            directory.display(),
            error
        )
    })?;
    let mut files = Vec::new();

    for entry_result in entries {
        let entry = entry_result.map_err(|error| {
            format!(
                "Failed to read imported score directory entry at {}: {}",
                directory.display(),
                error
            )
        })?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let Some(parsed_file_name) = parse_managed_score_file_name(&file_name) else {
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

        files.push(ManagedScoreFile {
            file_name,
            id: parsed_file_name.id,
            kind: parsed_file_name.kind,
            modified_ms: metadata_modified_ms(&metadata),
            path: entry.path(),
            size_bytes: metadata.len(),
        });
    }

    files.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then_with(|| {
                score_file_kind_sort_key(left.kind).cmp(&score_file_kind_sort_key(right.kind))
            })
            .then_with(|| left.file_name.cmp(&right.file_name))
    });

    Ok(files)
}

fn is_preferred_managed_file(candidate: &ManagedScoreFile, current: &ManagedScoreFile) -> bool {
    score_file_kind_sort_key(candidate.kind)
        .cmp(&score_file_kind_sort_key(current.kind))
        .then_with(|| candidate.file_name.cmp(&current.file_name))
        .is_lt()
}

fn score_file_kind_sort_key(kind: ManagedScoreFileKind) -> u8 {
    match kind {
        ManagedScoreFileKind::Canonical => 0,
        ManagedScoreFileKind::Legacy => 1,
    }
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

fn canonical_imported_score_file_path(
    directory: &Path,
    song_id: &str,
    song: &Value,
) -> Result<PathBuf, String> {
    validate_imported_score_id(song_id)?;

    Ok(directory.join(canonical_imported_score_file_name(song_id, song)?))
}

fn canonical_imported_score_file_name(song_id: &str, song: &Value) -> Result<String, String> {
    validate_imported_score_id(song_id)?;

    Ok(format!(
        "{}{}{}.{}",
        sanitize_score_title_segment(song_name_from_value(song)),
        CANONICAL_FILE_NAME_SEPARATOR,
        song_id,
        IMPORTED_SCORE_FILE_EXTENSION
    ))
}

fn song_name_from_value(song: &Value) -> &str {
    song.get("name")
        .and_then(Value::as_str)
        .unwrap_or(FALLBACK_SCORE_TITLE_SEGMENT)
}

fn parse_managed_score_file_name(file_name: &str) -> Option<ParsedManagedScoreFileName> {
    let stem = file_name.strip_suffix(".json")?;

    if let Some((title_segment, score_id)) = stem.rsplit_once(CANONICAL_FILE_NAME_SEPARATOR) {
        if !is_valid_sanitized_title_segment(title_segment) {
            return None;
        }

        validate_imported_score_id(score_id).ok()?;

        return Some(ParsedManagedScoreFileName {
            id: score_id.to_string(),
            kind: ManagedScoreFileKind::Canonical,
        });
    }

    validate_imported_score_id(stem).ok()?;

    Some(ParsedManagedScoreFileName {
        id: stem.to_string(),
        kind: ManagedScoreFileKind::Legacy,
    })
}

fn sanitize_score_title_segment(title: &str) -> String {
    let replaced_invalid: String = title
        .chars()
        .filter_map(|character| {
            if character.is_ascii_control() {
                None
            } else if is_windows_invalid_file_name_character(character) {
                Some(' ')
            } else {
                Some(character)
            }
        })
        .collect();
    let collapsed_whitespace = replaced_invalid
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = trim_score_title_segment(&collapsed_whitespace);
    let truncated = trimmed
        .chars()
        .take(MAX_SCORE_TITLE_SEGMENT_CHARS)
        .collect::<String>();
    let final_title = trim_score_title_segment(&truncated);

    if final_title.is_empty() {
        FALLBACK_SCORE_TITLE_SEGMENT.to_string()
    } else {
        final_title
    }
}

fn trim_score_title_segment(value: &str) -> String {
    value.trim().trim_end_matches([' ', '.']).to_string()
}

fn is_valid_sanitized_title_segment(title_segment: &str) -> bool {
    !title_segment.is_empty() && sanitize_score_title_segment(title_segment) == title_segment
}

fn is_windows_invalid_file_name_character(character: char) -> bool {
    matches!(
        character,
        '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
    )
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

    if !(song_id.starts_with("local-") || song_id.starts_with("legacy-")) {
        return Err(format!(
            "Imported score ID must start with local- or legacy-: {}",
            song_id
        ));
    }

    Ok(())
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

    fn write_score_file(directory: &Path, file_name: &str, song: &Value) {
        fs::create_dir_all(directory).expect("directory should be created");
        fs::write(
            directory.join(file_name),
            serde_json::to_string_pretty(&Value::Array(vec![song.clone()])).unwrap(),
        )
        .expect("score file should be written");
    }

    #[test]
    fn canonical_filename_generation_from_english_song_name() {
        assert_eq!(
            canonical_imported_score_file_name("local-1", &sample_song("Moonlight Sonata"))
                .unwrap(),
            "Moonlight Sonata__local-1.json"
        );
    }

    #[test]
    fn canonical_filename_generation_from_chinese_song_name() {
        assert_eq!(
            canonical_imported_score_file_name("local-1", &sample_song("夜曲")).unwrap(),
            "夜曲__local-1.json"
        );
    }

    #[test]
    fn canonical_filename_replaces_invalid_windows_characters() {
        assert_eq!(
            sanitize_score_title_segment(r#"A<B>C:D"E/F\G|H?I*J"#),
            "A B C D E F G H I J"
        );
    }

    #[test]
    fn canonical_filename_removes_ascii_control_characters() {
        assert_eq!(
            sanitize_score_title_segment("A\u{0000}B\tC\u{001f}D"),
            "ABCD"
        );
    }

    #[test]
    fn canonical_filename_trims_and_collapses_whitespace() {
        assert_eq!(
            sanitize_score_title_segment("  Hello     World  "),
            "Hello World"
        );
    }

    #[test]
    fn canonical_filename_removes_trailing_spaces_and_periods() {
        assert_eq!(sanitize_score_title_segment("Hello. . "), "Hello");
    }

    #[test]
    fn canonical_filename_uses_fallback_for_empty_or_invalid_names() {
        assert_eq!(sanitize_score_title_segment("////"), "untitled-score");
        assert_eq!(sanitize_score_title_segment("   ...   "), "untitled-score");
    }

    #[test]
    fn canonical_filename_truncates_without_splitting_unicode_scalars() {
        let long_name = "曲".repeat(70);
        let sanitized = sanitize_score_title_segment(&long_name);

        assert_eq!(sanitized.chars().count(), 64);
        assert_eq!(sanitized, "曲".repeat(64));
    }

    #[test]
    fn legacy_filename_parsing_extracts_id() {
        let parsed = parse_managed_score_file_name("local-1.json").unwrap();

        assert_eq!(parsed.id, "local-1");
        assert!(matches!(parsed.kind, ManagedScoreFileKind::Legacy));
    }

    #[test]
    fn canonical_filename_parsing_extracts_final_id_segment() {
        let parsed = parse_managed_score_file_name("夜曲__demo__local-1.json").unwrap();

        assert_eq!(parsed.id, "local-1");
        assert!(matches!(parsed.kind, ManagedScoreFileKind::Canonical));
    }

    #[test]
    fn malformed_canonical_filename_is_rejected() {
        assert!(parse_managed_score_file_name("bad<name>__local-1.json").is_none());
        assert!(parse_managed_score_file_name("title__bad/id.json").is_none());
        assert!(parse_managed_score_file_name("title__local-1.json.tmp").is_none());
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

    #[test]
    fn new_save_uses_canonical_readable_filename() {
        let test_dir = unique_test_dir("save_canonical");
        let song = sample_song("Readable Song");
        let file_path = save_imported_score_song_at(&test_dir.path, "local-1", &song).unwrap();

        assert_eq!(
            file_path.file_name().unwrap(),
            "Readable Song__local-1.json"
        );
        assert!(file_path.exists());
    }

    #[test]
    fn legacy_file_can_still_be_read_by_id() {
        let test_dir = unique_test_dir("read_legacy");
        let song = sample_song("Legacy");

        write_score_file(&test_dir.path, "local-1.json", &song);

        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );
    }

    #[test]
    fn canonical_file_can_be_read_by_id() {
        let test_dir = unique_test_dir("read_canonical");
        let song = sample_song("Canonical");

        write_score_file(&test_dir.path, "Canonical__local-1.json", &song);

        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );
    }

    #[test]
    fn existence_lookup_supports_both_formats() {
        let test_dir = unique_test_dir("exists_formats");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));
        write_score_file(
            &test_dir.path,
            "Canonical__local-2.json",
            &sample_song("Canonical"),
        );

        assert!(imported_score_file_exists_at(&test_dir.path, "local-1").unwrap());
        assert!(imported_score_file_exists_at(&test_dir.path, "local-2").unwrap());
        assert!(!imported_score_file_exists_at(&test_dir.path, "local-3").unwrap());
    }

    #[test]
    fn delete_by_id_removes_legacy_files() {
        let test_dir = unique_test_dir("delete_legacy");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));

        assert!(delete_imported_score_file_at(&test_dir.path, "local-1").unwrap());
        assert!(!test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn delete_by_id_removes_canonical_files() {
        let test_dir = unique_test_dir("delete_canonical");

        write_score_file(
            &test_dir.path,
            "Canonical__local-1.json",
            &sample_song("Canonical"),
        );

        assert!(delete_imported_score_file_at(&test_dir.path, "local-1").unwrap());
        assert!(!test_dir.path.join("Canonical__local-1.json").exists());
    }

    #[test]
    fn delete_by_id_removes_redundant_legacy_and_canonical_files() {
        let test_dir = unique_test_dir("delete_duplicates");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));
        write_score_file(
            &test_dir.path,
            "Canonical__local-1.json",
            &sample_song("Canonical"),
        );

        assert!(delete_imported_score_file_at(&test_dir.path, "local-1").unwrap());
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(!test_dir.path.join("Canonical__local-1.json").exists());
    }

    #[test]
    fn unrelated_json_files_are_preserved() {
        let test_dir = unique_test_dir("preserve_unrelated");

        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(test_dir.path.join("notes.json"), "[]").unwrap();
        write_score_file(
            &test_dir.path,
            "Canonical__local-1.json",
            &sample_song("Canonical"),
        );

        clear_imported_score_files_at(&test_dir.path).unwrap();

        assert!(test_dir.path.join("notes.json").exists());
        assert!(!test_dir.path.join("Canonical__local-1.json").exists());
    }

    #[test]
    fn reconciliation_creates_missing_file() {
        let test_dir = unique_test_dir("reconcile_create");

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Created"),
            }],
        )
        .unwrap();

        assert_eq!(report.created_count, 1);
        assert!(test_dir.path.join("Created__local-1.json").exists());
    }

    #[test]
    fn reconciliation_renames_valid_legacy_file() {
        let test_dir = unique_test_dir("reconcile_rename_legacy");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current Name"),
            }],
        )
        .unwrap();

        assert_eq!(report.renamed_count, 1);
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(test_dir.path.join("Current Name__local-1.json").exists());
    }

    #[test]
    fn reconciliation_renames_outdated_canonical_file() {
        let test_dir = unique_test_dir("reconcile_rename_canonical");

        write_score_file(
            &test_dir.path,
            "Old Name__local-1.json",
            &sample_song("Old Name"),
        );

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current Name"),
            }],
        )
        .unwrap();

        assert_eq!(report.renamed_count, 1);
        assert!(!test_dir.path.join("Old Name__local-1.json").exists());
        assert!(test_dir.path.join("Current Name__local-1.json").exists());
    }

    #[test]
    fn reconciliation_leaves_existing_valid_canonical_file_unchanged() {
        let test_dir = unique_test_dir("reconcile_unchanged");

        write_score_file(
            &test_dir.path,
            "Current Name__local-1.json",
            &sample_song("Current Name"),
        );

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current Name"),
            }],
        )
        .unwrap();

        assert_eq!(report.unchanged_count, 1);
        assert!(test_dir.path.join("Current Name__local-1.json").exists());
    }

    #[test]
    fn reconciliation_is_idempotent() {
        let test_dir = unique_test_dir("reconcile_idempotent");
        let entry = || ImportedScoreReconcileEntry {
            song_id: "local-1".to_string(),
            song: sample_song("Stable"),
        };

        let first_report =
            reconcile_imported_score_files_at(&test_dir.path, vec![entry()]).unwrap();
        let second_report =
            reconcile_imported_score_files_at(&test_dir.path, vec![entry()]).unwrap();

        assert_eq!(first_report.created_count, 1);
        assert_eq!(second_report.unchanged_count, 1);
        assert_eq!(scan_managed_score_files(&test_dir.path).unwrap().len(), 1);
    }

    #[test]
    fn reconciliation_isolates_failure_and_continues() {
        let test_dir = unique_test_dir("reconcile_partial_failure");

        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(test_dir.path.join("Broken__local-1.json"), "{}").unwrap();

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![
                ImportedScoreReconcileEntry {
                    song_id: "local-1".to_string(),
                    song: sample_song("Broken"),
                },
                ImportedScoreReconcileEntry {
                    song_id: "local-2".to_string(),
                    song: sample_song("Created"),
                },
            ],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.created_count, 1);
        assert!(test_dir.path.join("Created__local-2.json").exists());
    }

    #[test]
    fn reconciliation_does_not_overwrite_invalid_existing_managed_file() {
        let test_dir = unique_test_dir("reconcile_preserve_invalid");
        let invalid_file_path = test_dir.path.join("Broken__local-1.json");

        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(&invalid_file_path, "{}").unwrap();

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Broken"),
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert_eq!(fs::read_to_string(&invalid_file_path).unwrap(), "{}");
    }

    #[test]
    fn reconciliation_does_not_delete_invalid_redundant_managed_file() {
        let test_dir = unique_test_dir("reconcile_keep_invalid_redundant");
        let invalid_file_path = test_dir.path.join("Old Broken__local-1.json");

        fs::create_dir_all(&test_dir.path).unwrap();
        write_score_file(
            &test_dir.path,
            "Current__local-1.json",
            &sample_song("Current"),
        );
        fs::write(&invalid_file_path, "{}").unwrap();

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current"),
            }],
        )
        .unwrap();

        assert_eq!(report.unchanged_count, 1);
        assert!(test_dir.path.join("Current__local-1.json").exists());
        assert_eq!(fs::read_to_string(&invalid_file_path).unwrap(), "{}");
    }

    #[test]
    fn reconciliation_handles_legacy_and_canonical_for_one_id_safely() {
        let test_dir = unique_test_dir("reconcile_duplicate_formats");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));
        write_score_file(
            &test_dir.path,
            "Current__local-1.json",
            &sample_song("Canonical"),
        );

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current"),
            }],
        )
        .unwrap();

        assert_eq!(report.unchanged_count, 1);
        assert!(test_dir.path.join("Current__local-1.json").exists());
        assert!(!test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn clear_removes_only_recognized_managed_final_json_files() {
        let test_dir = unique_test_dir("clear_managed");

        fs::create_dir_all(&test_dir.path).expect("directory should be created");
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));
        write_score_file(
            &test_dir.path,
            "Canonical__local-2.json",
            &sample_song("Canonical"),
        );
        fs::write(test_dir.path.join("bad name.json"), "[]")
            .expect("invalid ID file should be written");
        fs::write(test_dir.path.join("local-3.txt"), "[]")
            .expect("non-json file should be written");
        fs::write(test_dir.path.join("local-4.json.tmp"), "stale")
            .expect("temporary file should be written");
        fs::create_dir(test_dir.path.join("local-5.json"))
            .expect("directory with json suffix should be created");

        assert_eq!(clear_imported_score_files_at(&test_dir.path).unwrap(), 2);
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(!test_dir.path.join("Canonical__local-2.json").exists());
        assert!(test_dir.path.join("bad name.json").exists());
        assert!(test_dir.path.join("local-3.txt").exists());
        assert!(test_dir.path.join("local-4.json.tmp").exists());
        assert!(test_dir.path.join("local-5.json").exists());
    }
}
