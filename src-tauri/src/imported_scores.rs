use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const IMPORTED_SCORES_DIR_NAME: &str = "imported-scores";
const CANONICAL_IMPORTED_SCORE_FILE_EXTENSION: &str = "txt";
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
    verified_song_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreReconcileFailure {
    error: String,
    song_id: String,
    song_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreStorageMigrationRequest {
    song_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreStorageMigrationFailure {
    song_id: String,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreStorageMigrationReport {
    migrated_count: usize,
    renamed_count: usize,
    deduplicated_count: usize,
    unchanged_count: usize,
    failed: Vec<ImportedScoreStorageMigrationFailure>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ManagedScoreFileNaming {
    Canonical,
    Legacy,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ManagedScoreFileExtension {
    Txt,
    Json,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ManagedScoreObjectKind {
    RegularFile,
    NonRegular,
}

fn classify_managed_score_object(file_type: &fs::FileType) -> ManagedScoreObjectKind {
    if file_type.is_file() {
        ManagedScoreObjectKind::RegularFile
    } else {
        ManagedScoreObjectKind::NonRegular
    }
}

#[derive(Clone)]
struct ManagedScoreFile {
    file_name: String,
    id: String,
    naming: ManagedScoreFileNaming,
    extension: ManagedScoreFileExtension,
    object_kind: ManagedScoreObjectKind,
    modified_ms: Option<u128>,
    path: PathBuf,
    size_bytes: u64,
}

struct ParsedManagedScoreFileName {
    id: String,
    naming: ManagedScoreFileNaming,
    extension: ManagedScoreFileExtension,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SemanticSong {
    bits_per_page: f64,
    bpm: f64,
    is_composed: bool,
    name: String,
    pitch_level: f64,
    song_notes: Vec<SemanticNote>,
}

#[derive(Debug, Deserialize, PartialEq)]
struct SemanticNote {
    key: String,
    time: f64,
}

type ManagedScoreFileIndex = BTreeMap<String, Vec<ManagedScoreFile>>;

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
pub fn migrate_imported_score_storage(
    request: ImportedScoreStorageMigrationRequest,
) -> Result<ImportedScoreStorageMigrationReport, String> {
    let directory = current_exe_imported_scores_directory()?;
    migrate_imported_score_storage_at(&directory, request.song_ids)
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

    let file_path = canonical_imported_score_file_path(directory, song_id, song)?;
    let files = managed_score_files_for_id(directory, song_id)?;

    for file in &files {
        read_and_verify_managed_score_file(file, song).map_err(|error| {
            format!(
                "Cannot safely save imported score {} because existing candidate {} is invalid or conflicting: {}",
                song_id,
                file.path.display(),
                error
            )
        })?;
    }

    if path_exists_without_following(&file_path)?
        && !files.iter().any(|file| file.path == file_path)
    {
        return Err(format!(
            "Cannot save imported score {} because target {} collides with an unmanaged file",
            song_id,
            file_path.display()
        ));
    }

    if !file_path.exists() {
        write_imported_score_song_file(&file_path, song_id, song)?;
        read_and_verify_expected_song(&file_path, song)?;
    }

    let mut file_index = managed_score_file_index_from_files(files.clone());
    cleanup_verified_redundant_managed_files(&mut file_index, song_id, &files, &file_path, song)?;

    Ok(file_path)
}

fn read_imported_score_song_at(directory: &Path, song_id: &str) -> Result<Value, String> {
    let files = managed_score_files_for_id(directory, song_id)?;

    if files.is_empty() {
        return Err(format!(
            "No imported score file found for ID {} in {}",
            song_id,
            directory.display()
        ));
    }

    let mut failures = Vec::new();

    for file in files {
        if file.object_kind != ManagedScoreObjectKind::RegularFile {
            failures.push(format!(
                "{}: recognized managed path is not a regular file",
                file.path.display()
            ));
            continue;
        }
        match read_regular_managed_score_file(&file) {
            Ok(song) => return Ok(song),
            Err(error) => failures.push(format!("{}: {}", file.path.display(), error)),
        }
    }

    Err(format!(
        "No valid imported score file found for ID {} in {}. Attempted files: {}",
        song_id,
        directory.display(),
        failures.join("; ")
    ))
}

fn imported_score_file_exists_at(directory: &Path, song_id: &str) -> Result<bool, String> {
    Ok(!managed_score_files_for_id(directory, song_id)?.is_empty())
}

fn delete_imported_score_file_at(directory: &Path, song_id: &str) -> Result<bool, String> {
    let files = managed_score_files_for_id(directory, song_id)?;

    if files.is_empty() {
        return Ok(false);
    }

    let mut removed_any = false;
    for file in files {
        if file.object_kind != ManagedScoreObjectKind::RegularFile {
            continue;
        }
        require_regular_file_without_following(&file.path, "managed score delete target")?;
        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to delete imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
        removed_any = true;
    }

    Ok(removed_any)
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
        if file.object_kind != ManagedScoreObjectKind::RegularFile {
            continue;
        }
        require_regular_file_without_following(&file.path, "managed score clear target")?;
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
    reconcile_imported_score_files_at_with_scan(directory, entries, scan_managed_score_files)
}

fn migrate_imported_score_storage_at(
    directory: &Path,
    song_ids: Vec<String>,
) -> Result<ImportedScoreStorageMigrationReport, String> {
    migrate_imported_score_storage_at_with_scan(directory, song_ids, scan_managed_score_files)
}

fn migrate_imported_score_storage_at_with_scan<F>(
    directory: &Path,
    song_ids: Vec<String>,
    scan_files: F,
) -> Result<ImportedScoreStorageMigrationReport, String>
where
    F: FnOnce(&Path) -> Result<Vec<ManagedScoreFile>, String>,
{
    ensure_imported_scores_directory_at(directory)?;
    for song_id in &song_ids {
        validate_imported_score_id(song_id)?;
    }

    let mut file_index = managed_score_file_index_from_files(scan_files(directory)?);
    let mut report = ImportedScoreStorageMigrationReport {
        migrated_count: 0,
        renamed_count: 0,
        deduplicated_count: 0,
        unchanged_count: 0,
        failed: Vec::new(),
    };

    for song_id in song_ids.into_iter().collect::<BTreeSet<_>>() {
        let files = indexed_managed_score_files_for_id(&file_index, &song_id);
        if files.is_empty() {
            continue;
        }

        let mut parsed_songs = Vec::new();
        let mut parse_failures = Vec::new();
        for file in &files {
            if file.object_kind != ManagedScoreObjectKind::RegularFile {
                parse_failures.push(format!(
                    "{}: recognized managed path is not a regular file",
                    file.path.display()
                ));
                continue;
            }
            match read_regular_managed_score_file(file) {
                Ok(song) => parsed_songs.push(song),
                Err(error) => parse_failures.push(format!("{}: {}", file.path.display(), error)),
            }
        }
        if !parse_failures.is_empty() {
            report.failed.push(ImportedScoreStorageMigrationFailure {
                song_id,
                error: format!(
                    "Cannot migrate because managed candidate(s) are invalid: {}",
                    parse_failures.join("; ")
                ),
            });
            continue;
        }
        let song = parsed_songs
            .into_iter()
            .next()
            .expect("non-empty candidates produce at least one parsed song");
        let target_path = canonical_imported_score_file_path(directory, &song_id, &song)?;
        let had_target = files.iter().any(|file| file.path == target_path);
        let had_duplicates = files.len() > 1;

        match reconcile_one_imported_score_file(directory, &mut file_index, &song_id, &song) {
            Ok(ReconcileAction::Renamed) => {
                report.migrated_count += 1;
                report.renamed_count += 1;
                if had_duplicates {
                    report.deduplicated_count += 1;
                }
            }
            Ok(ReconcileAction::Unchanged) => {
                report.migrated_count += 1;
                if had_target && had_duplicates {
                    report.deduplicated_count += 1;
                } else {
                    report.unchanged_count += 1;
                }
            }
            Ok(ReconcileAction::Created) => {
                unreachable!("existing candidates cannot create a target")
            }
            Err(error) => report
                .failed
                .push(ImportedScoreStorageMigrationFailure { song_id, error }),
        }
    }

    Ok(report)
}

fn reconcile_imported_score_files_at_with_scan<F>(
    directory: &Path,
    entries: Vec<ImportedScoreReconcileEntry>,
    scan_files: F,
) -> Result<ImportedScoreReconcileReport, String>
where
    F: FnOnce(&Path) -> Result<Vec<ManagedScoreFile>, String>,
{
    ensure_imported_scores_directory_at(directory)?;
    let mut file_index = managed_score_file_index_from_files(scan_files(directory)?);

    let mut report = ImportedScoreReconcileReport {
        created_count: 0,
        failed: Vec::new(),
        renamed_count: 0,
        unchanged_count: 0,
        verified_song_ids: Vec::new(),
    };

    for entry in entries {
        let song_name = song_name_from_value(&entry.song).to_string();

        match reconcile_one_imported_score_file(
            directory,
            &mut file_index,
            &entry.song_id,
            &entry.song,
        ) {
            Ok(action) => {
                if !report.verified_song_ids.contains(&entry.song_id) {
                    report.verified_song_ids.push(entry.song_id.clone());
                }

                match action {
                    ReconcileAction::Created => report.created_count += 1,
                    ReconcileAction::Renamed => report.renamed_count += 1,
                    ReconcileAction::Unchanged => report.unchanged_count += 1,
                }
            }
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
    file_index: &mut ManagedScoreFileIndex,
    song_id: &str,
    song: &Value,
) -> Result<ReconcileAction, String> {
    validate_imported_score_id(song_id)?;

    let canonical_path = canonical_imported_score_file_path(directory, song_id, song)?;
    let files = indexed_managed_score_files_for_id(file_index, song_id);

    if files.is_empty() {
        if path_exists_without_following(&canonical_path)? {
            return Err(format!(
                "Cannot create imported score {} because target {} already exists and is not a recognized regular managed file",
                song_id,
                canonical_path.display()
            ));
        }
        write_imported_score_song_file(&canonical_path, song_id, song)?;
        read_and_verify_expected_song(&canonical_path, song)?;
        insert_indexed_managed_score_file(
            file_index,
            managed_score_file_from_path(
                canonical_path,
                song_id.to_string(),
                ManagedScoreFileNaming::Canonical,
                ManagedScoreFileExtension::Txt,
            )?,
        );
        return Ok(ReconcileAction::Created);
    }

    for file in &files {
        read_and_verify_managed_score_file(file, song).map_err(|error| {
            format!(
                "Cannot safely canonicalize imported score {} because candidate {} is invalid or conflicting: {}",
                song_id,
                file.path.display(),
                error
            )
        })?;
    }

    if files.iter().any(|file| file.path == canonical_path) {
        cleanup_verified_redundant_managed_files(
            file_index,
            song_id,
            &files,
            &canonical_path,
            song,
        )?;
        return Ok(ReconcileAction::Unchanged);
    }

    if path_exists_without_following(&canonical_path)? {
        return Err(format!(
            "Cannot canonicalize imported score {} because target {} already exists and is not a recognized candidate",
            song_id,
            canonical_path.display()
        ));
    }

    let selected_file = files[0].clone();

    let canonical_file = rename_and_validate_managed_score_file(
        &selected_file.path,
        &canonical_path,
        |target_path| {
            let canonical_file = managed_score_file_from_path(
                target_path.to_path_buf(),
                song_id.to_string(),
                ManagedScoreFileNaming::Canonical,
                ManagedScoreFileExtension::Txt,
            )?;
            read_and_verify_expected_song(target_path, song)?;
            Ok(canonical_file)
        },
    )?;
    remove_indexed_managed_score_file_path(file_index, song_id, &selected_file.path);
    insert_indexed_managed_score_file(file_index, canonical_file);
    let updated_files = indexed_managed_score_files_for_id(file_index, song_id);
    cleanup_verified_redundant_managed_files(
        file_index,
        song_id,
        &updated_files,
        &canonical_path,
        song,
    )?;

    Ok(ReconcileAction::Renamed)
}

fn cleanup_verified_redundant_managed_files(
    file_index: &mut ManagedScoreFileIndex,
    song_id: &str,
    files: &[ManagedScoreFile],
    keep_path: &Path,
    expected_song: &Value,
) -> Result<(), String> {
    for file in files {
        if file.path == keep_path {
            continue;
        }
        read_and_verify_managed_score_file(file, expected_song).map_err(|error| {
            format!(
                "Cannot remove redundant imported score candidate {} because fresh verification failed: {}",
                file.path.display(),
                error
            )
        })?;
        fs::remove_file(&file.path).map_err(|error| {
            format!(
                "Failed to remove redundant imported score file at {}: {}",
                file.path.display(),
                error
            )
        })?;
        remove_indexed_managed_score_file_path(file_index, song_id, &file.path);
    }

    Ok(())
}

fn rename_and_validate_managed_score_file<F>(
    source_path: &Path,
    target_path: &Path,
    validate_target: F,
) -> Result<ManagedScoreFile, String>
where
    F: FnOnce(&Path) -> Result<ManagedScoreFile, String>,
{
    require_regular_file_without_following(source_path, "rename source")?;
    fs::rename(source_path, target_path).map_err(|error| {
        format!(
            "Failed to rename imported score file at {} to {}: {}",
            source_path.display(),
            target_path.display(),
            error
        )
    })?;

    match validate_target(target_path) {
        Ok(file) => Ok(file),
        Err(validation_error) => match fs::rename(target_path, source_path) {
            Ok(()) => Err(format!(
                "Renamed imported score target failed post-rename validation and the original source was restored: {}",
                validation_error
            )),
            Err(rollback_error) => Err(format!(
                "Renamed imported score target failed post-rename validation: {}. Rollback to {} also failed: {}",
                validation_error,
                source_path.display(),
                rollback_error
            )),
        },
    }
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

    match fs::symlink_metadata(file_path) {
        Ok(metadata) if !metadata.file_type().is_file() => {
            let _ = fs::remove_file(&temp_file_path);
            return Err(format!(
                "Refusing to replace non-regular imported score target at {}",
                file_path.display()
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            let _ = fs::remove_file(&temp_file_path);
            return Err(format!(
                "Failed to inspect imported score target at {} before replacement: {}",
                file_path.display(),
                error
            ));
        }
    }

    match fs::rename(&temp_file_path, file_path) {
        Ok(()) => Ok(()),
        Err(rename_error) if file_path.exists() => {
            let target_metadata = fs::symlink_metadata(file_path).map_err(|metadata_error| {
                let _ = fs::remove_file(&temp_file_path);
                format!(
                    "Failed to inspect existing imported score target at {} after replace failed ({}): {}",
                    file_path.display(),
                    rename_error,
                    metadata_error
                )
            })?;
            if !target_metadata.file_type().is_file() {
                let _ = fs::remove_file(&temp_file_path);
                return Err(format!(
                    "Refusing to replace non-regular imported score target at {}",
                    file_path.display()
                ));
            }
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

    validate_managed_song(file_path, &songs[0])?;

    Ok(songs[0].clone())
}

fn read_and_verify_expected_song(file_path: &Path, expected_song: &Value) -> Result<Value, String> {
    let actual_song = read_one_song_from_file(file_path)?;
    let expected_semantics = semantic_song_from_value(expected_song).map_err(|error| {
        format!(
            "Expected imported score for verification is invalid: {}",
            error
        )
    })?;
    let actual_semantics = semantic_song_from_value(&actual_song).map_err(|error| {
        format!(
            "Imported score file at {} cannot be compared semantically: {}",
            file_path.display(),
            error
        )
    })?;

    if actual_semantics != expected_semantics {
        return Err(format!(
            "Imported score file at {} does not match the expected song content",
            file_path.display()
        ));
    }

    Ok(actual_song)
}

fn read_and_verify_managed_score_file(
    file: &ManagedScoreFile,
    expected_song: &Value,
) -> Result<Value, String> {
    if file.object_kind != ManagedScoreObjectKind::RegularFile {
        return Err(format!(
            "Recognized managed path at {} is not a regular file",
            file.path.display()
        ));
    }

    require_regular_file_without_following(&file.path, "managed score candidate")?;
    read_and_verify_expected_song(&file.path, expected_song)
}

fn read_regular_managed_score_file(file: &ManagedScoreFile) -> Result<Value, String> {
    if file.object_kind != ManagedScoreObjectKind::RegularFile {
        return Err(format!(
            "Recognized managed path at {} is not a regular file",
            file.path.display()
        ));
    }

    require_regular_file_without_following(&file.path, "managed score read candidate")?;
    read_one_song_from_file(&file.path)
}

fn semantic_song_from_value(song: &Value) -> Result<SemanticSong, String> {
    serde_json::from_value(song.clone())
        .map_err(|error| format!("Failed to normalize song semantics: {}", error))
}

fn validate_managed_song(file_path: &Path, song: &Value) -> Result<(), String> {
    let song_object = song.as_object().ok_or_else(|| {
        format!(
            "Imported score file at {} must contain one song object",
            file_path.display()
        )
    })?;

    require_string_field(file_path, song, "name")?;
    require_number_field(file_path, song, "bpm")?;
    require_number_field(file_path, song, "bitsPerPage")?;
    require_number_field(file_path, song, "pitchLevel")?;
    require_boolean_field(file_path, song, "isComposed")?;

    let song_notes = song_object
        .get("songNotes")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            format!(
                "Imported score file at {} songNotes must be an array",
                file_path.display()
            )
        })?;

    for (note_index, note) in song_notes.iter().enumerate() {
        let note_object = note.as_object().ok_or_else(|| {
            format!(
                "Imported score file at {} songNotes[{}] must be an object",
                file_path.display(),
                note_index
            )
        })?;
        let has_numeric_time = note_object.get("time").is_some_and(|time| time.is_number());

        if !has_numeric_time {
            return Err(format!(
                "Imported score file at {} songNotes[{}].time must be a number",
                file_path.display(),
                note_index
            ));
        }

        let has_non_empty_key = note_object
            .get("key")
            .and_then(Value::as_str)
            .is_some_and(|key| !key.is_empty());

        if !has_non_empty_key {
            return Err(format!(
                "Imported score file at {} songNotes[{}].key must be a non-empty string",
                file_path.display(),
                note_index
            ));
        }
    }

    Ok(())
}

fn require_string_field(file_path: &Path, value: &Value, field_name: &str) -> Result<(), String> {
    if value.get(field_name).and_then(Value::as_str).is_some() {
        return Ok(());
    }

    Err(format!(
        "Imported score file at {} field {} must be a string",
        file_path.display(),
        field_name
    ))
}

fn require_number_field(file_path: &Path, value: &Value, field_name: &str) -> Result<(), String> {
    if value.get(field_name).is_some_and(Value::is_number) {
        return Ok(());
    }

    Err(format!(
        "Imported score file at {} field {} must be a number",
        file_path.display(),
        field_name
    ))
}

fn require_boolean_field(file_path: &Path, value: &Value, field_name: &str) -> Result<(), String> {
    if value.get(field_name).is_some_and(Value::is_boolean) {
        return Ok(());
    }

    Err(format!(
        "Imported score file at {} field {} must be a boolean",
        file_path.display(),
        field_name
    ))
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

fn managed_score_file_index_from_files(files: Vec<ManagedScoreFile>) -> ManagedScoreFileIndex {
    let mut index = ManagedScoreFileIndex::new();

    for file in files {
        insert_indexed_managed_score_file(&mut index, file);
    }

    index
}

fn indexed_managed_score_files_for_id(
    file_index: &ManagedScoreFileIndex,
    song_id: &str,
) -> Vec<ManagedScoreFile> {
    file_index.get(song_id).cloned().unwrap_or_default()
}

fn insert_indexed_managed_score_file(
    file_index: &mut ManagedScoreFileIndex,
    file: ManagedScoreFile,
) {
    let files = file_index.entry(file.id.clone()).or_default();

    files.push(file);
    sort_managed_score_files(files);
}

fn remove_indexed_managed_score_file_path(
    file_index: &mut ManagedScoreFileIndex,
    song_id: &str,
    removed_path: &Path,
) {
    if let Some(files) = file_index.get_mut(song_id) {
        files.retain(|file| file.path != removed_path);
    }

    remove_empty_index_entry(file_index, song_id);
}

fn remove_empty_index_entry(file_index: &mut ManagedScoreFileIndex, song_id: &str) {
    if file_index
        .get(song_id)
        .is_some_and(|files| files.is_empty())
    {
        file_index.remove(song_id);
    }
}

fn managed_score_file_from_path(
    path: PathBuf,
    id: String,
    naming: ManagedScoreFileNaming,
    extension: ManagedScoreFileExtension,
) -> Result<ManagedScoreFile, String> {
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        format!(
            "Failed to read imported score file metadata at {}: {}",
            path.display(),
            error
        )
    })?;
    if !metadata.file_type().is_file() {
        return Err(format!(
            "Imported score path at {} is not a regular file",
            path.display()
        ));
    }
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| {
            format!(
                "Imported score file path has no valid file name: {}",
                path.display()
            )
        })?;

    Ok(ManagedScoreFile {
        file_name,
        id,
        naming,
        extension,
        object_kind: ManagedScoreObjectKind::RegularFile,
        modified_ms: metadata_modified_ms(&metadata),
        path,
        size_bytes: metadata.len(),
    })
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
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Failed to read imported score entry type at {}: {}",
                entry.path().display(),
                error
            )
        })?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(|error| {
            format!(
                "Failed to read imported score entry metadata at {}: {}",
                entry.path().display(),
                error
            )
        })?;
        let entry_kind = classify_managed_score_object(&file_type);
        let metadata_kind = classify_managed_score_object(&metadata.file_type());
        let object_kind = if entry_kind == ManagedScoreObjectKind::RegularFile
            && metadata_kind == ManagedScoreObjectKind::RegularFile
        {
            ManagedScoreObjectKind::RegularFile
        } else {
            ManagedScoreObjectKind::NonRegular
        };

        files.push(ManagedScoreFile {
            file_name,
            id: parsed_file_name.id,
            naming: parsed_file_name.naming,
            extension: parsed_file_name.extension,
            object_kind,
            modified_ms: metadata_modified_ms(&metadata),
            path: entry.path(),
            size_bytes: metadata.len(),
        });
    }

    sort_managed_score_files(&mut files);

    Ok(files)
}

fn sort_managed_score_files(files: &mut [ManagedScoreFile]) {
    files.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then_with(|| {
                managed_score_file_sort_key(left).cmp(&managed_score_file_sort_key(right))
            })
            .then_with(|| left.file_name.cmp(&right.file_name))
    });
}

fn is_preferred_managed_file(candidate: &ManagedScoreFile, current: &ManagedScoreFile) -> bool {
    managed_score_file_sort_key(candidate)
        .cmp(&managed_score_file_sort_key(current))
        .then_with(|| candidate.file_name.cmp(&current.file_name))
        .is_lt()
}

fn managed_score_file_sort_key(file: &ManagedScoreFile) -> u8 {
    match (file.naming, file.extension) {
        (ManagedScoreFileNaming::Canonical, ManagedScoreFileExtension::Txt) => 0,
        (ManagedScoreFileNaming::Legacy, ManagedScoreFileExtension::Txt) => 1,
        (ManagedScoreFileNaming::Canonical, ManagedScoreFileExtension::Json) => 2,
        (ManagedScoreFileNaming::Legacy, ManagedScoreFileExtension::Json) => 3,
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
        CANONICAL_IMPORTED_SCORE_FILE_EXTENSION
    ))
}

fn song_name_from_value(song: &Value) -> &str {
    song.get("name")
        .and_then(Value::as_str)
        .unwrap_or(FALLBACK_SCORE_TITLE_SEGMENT)
}

fn parse_managed_score_file_name(file_name: &str) -> Option<ParsedManagedScoreFileName> {
    let (stem, extension) = if let Some(stem) = file_name.strip_suffix(".txt") {
        (stem, ManagedScoreFileExtension::Txt)
    } else if let Some(stem) = file_name.strip_suffix(".json") {
        (stem, ManagedScoreFileExtension::Json)
    } else {
        return None;
    };

    if let Some((title_segment, score_id)) = stem.rsplit_once(CANONICAL_FILE_NAME_SEPARATOR) {
        if !is_valid_sanitized_title_segment(title_segment) {
            return None;
        }

        validate_imported_score_id(score_id).ok()?;

        return Some(ParsedManagedScoreFileName {
            id: score_id.to_string(),
            naming: ManagedScoreFileNaming::Canonical,
            extension,
        });
    }

    validate_imported_score_id(stem).ok()?;

    Some(ParsedManagedScoreFileName {
        id: stem.to_string(),
        naming: ManagedScoreFileNaming::Legacy,
        extension,
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

fn path_exists_without_following(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Failed to inspect filesystem object at {}: {}",
            path.display(),
            error
        )),
    }
}

fn require_regular_file_without_following(path: &Path, label: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        format!(
            "Failed to inspect {} at {}: {}",
            label,
            path.display(),
            error
        )
    })?;

    if metadata.file_type().is_file() {
        Ok(())
    } else {
        Err(format!(
            "{} at {} is not a regular file",
            label,
            path.display()
        ))
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
        cell::Cell,
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

    fn write_raw_file(directory: &Path, file_name: &str, content: &str) {
        fs::create_dir_all(directory).expect("directory should be created");
        fs::write(directory.join(file_name), content).expect("raw file should be written");
    }

    #[test]
    fn canonical_filename_generation_from_english_song_name() {
        assert_eq!(
            canonical_imported_score_file_name("local-1", &sample_song("Moonlight Sonata"))
                .unwrap(),
            "Moonlight Sonata__local-1.txt"
        );
    }

    #[test]
    fn canonical_filename_generation_from_chinese_song_name() {
        assert_eq!(
            canonical_imported_score_file_name("local-1", &sample_song("夜曲")).unwrap(),
            "夜曲__local-1.txt"
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
        assert!(matches!(parsed.naming, ManagedScoreFileNaming::Legacy));
        assert!(matches!(parsed.extension, ManagedScoreFileExtension::Json));
    }

    #[test]
    fn canonical_filename_parsing_extracts_final_id_segment() {
        let parsed = parse_managed_score_file_name("夜曲__demo__local-1.json").unwrap();

        assert_eq!(parsed.id, "local-1");
        assert!(matches!(parsed.naming, ManagedScoreFileNaming::Canonical));
        assert!(matches!(parsed.extension, ManagedScoreFileExtension::Json));
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

        assert_eq!(file_path.file_name().unwrap(), "Readable Song__local-1.txt");
        assert!(file_path.exists());
    }

    #[test]
    fn new_save_preserves_and_reports_conflicting_existing_candidates() {
        let test_dir = unique_test_dir("save_no_pre_scan");
        let song = sample_song("Readable Song");

        write_score_file(
            &test_dir.path,
            "Old Title__local-1.json",
            &sample_song("Old Title"),
        );
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Legacy"));

        assert!(save_imported_score_song_at(&test_dir.path, "local-1", &song).is_err());

        assert!(!test_dir.path.join("Readable Song__local-1.txt").exists());
        assert!(test_dir.path.join("Old Title__local-1.json").exists());
        assert!(test_dir.path.join("local-1.json").exists());
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
    fn read_by_id_falls_back_from_invalid_canonical_to_valid_legacy() {
        let test_dir = unique_test_dir("read_fallback_legacy");
        let legacy_song = sample_song("Legacy");

        write_raw_file(&test_dir.path, "Broken__local-1.json", "[{}]");
        write_score_file(&test_dir.path, "local-1.json", &legacy_song);

        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            legacy_song
        );
        assert_eq!(
            fs::read_to_string(test_dir.path.join("Broken__local-1.json")).unwrap(),
            "[{}]"
        );
    }

    #[test]
    fn read_by_id_reports_all_invalid_candidate_errors() {
        let test_dir = unique_test_dir("read_all_invalid");

        write_raw_file(&test_dir.path, "Broken__local-1.json", "[{}]");
        write_raw_file(
            &test_dir.path,
            "local-1.json",
            r#"[{"name":"Broken","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":{}}]"#,
        );

        let error = read_imported_score_song_at(&test_dir.path, "local-1").unwrap_err();

        assert!(error.contains("No valid imported score file found for ID local-1"));
        assert!(error.contains("Broken__local-1.json"));
        assert!(error.contains("local-1.json"));
        assert!(error.contains("field name must be a string"));
        assert!(error.contains("songNotes must be an array"));
    }

    #[test]
    fn managed_song_validation_rejects_empty_object_song() {
        let test_dir = unique_test_dir("validate_empty_object");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(&test_dir.path, "Broken__local-1.json", "[{}]");

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("field name must be a string"));
    }

    #[test]
    fn managed_song_validation_rejects_invalid_song_notes() {
        let test_dir = unique_test_dir("validate_song_notes");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Broken__local-1.json",
            r#"[{"name":"Broken","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":{}}]"#,
        );

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("songNotes must be an array"));
    }

    #[test]
    fn managed_song_validation_rejects_invalid_note_time_or_key() {
        let test_dir = unique_test_dir("validate_note_fields");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Broken__local-1.json",
            r#"[{"name":"Broken","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":[{"time":"0","key":""}]}]"#,
        );

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("songNotes[0].time must be a number"));
    }

    #[test]
    fn managed_song_validation_rejects_empty_note_key() {
        let test_dir = unique_test_dir("validate_note_key");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Broken__local-1.json",
            r#"[{"name":"Broken","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":[{"time":0,"key":""}]}]"#,
        );

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("songNotes[0].key must be a non-empty string"));
    }

    #[test]
    fn managed_song_validation_rejects_invalid_scalar_fields() {
        let test_dir = unique_test_dir("validate_scalars");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Broken__local-1.json",
            r#"[{"name":"Broken","bpm":"120","bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":[]}]"#,
        );

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("field bpm must be a number"));
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
        assert_eq!(report.verified_song_ids, vec!["local-1"]);
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            sample_song("Created")
        );
        assert!(test_dir.path.join("Created__local-1.txt").exists());
    }

    #[test]
    fn batch_reconciliation_scans_directory_once() {
        let test_dir = unique_test_dir("reconcile_one_scan");
        let scan_count = Cell::new(0);

        let report = reconcile_imported_score_files_at_with_scan(
            &test_dir.path,
            vec![
                ImportedScoreReconcileEntry {
                    song_id: "local-1".to_string(),
                    song: sample_song("One"),
                },
                ImportedScoreReconcileEntry {
                    song_id: "local-2".to_string(),
                    song: sample_song("Two"),
                },
            ],
            |directory| {
                scan_count.set(scan_count.get() + 1);
                scan_managed_score_files(directory)
            },
        )
        .unwrap();

        assert_eq!(scan_count.get(), 1);
        assert_eq!(report.created_count, 2);
    }

    #[test]
    fn batch_reconciliation_creates_many_entries_without_duplicates() {
        let test_dir = unique_test_dir("reconcile_many_create");

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![
                ImportedScoreReconcileEntry {
                    song_id: "local-1".to_string(),
                    song: sample_song("One"),
                },
                ImportedScoreReconcileEntry {
                    song_id: "local-2".to_string(),
                    song: sample_song("Two"),
                },
                ImportedScoreReconcileEntry {
                    song_id: "local-3".to_string(),
                    song: sample_song("Three"),
                },
            ],
        )
        .unwrap();
        let files = scan_managed_score_files(&test_dir.path).unwrap();

        assert_eq!(report.created_count, 3);
        assert_eq!(files.len(), 3);
        assert!(test_dir.path.join("One__local-1.txt").exists());
        assert!(test_dir.path.join("Two__local-2.txt").exists());
        assert!(test_dir.path.join("Three__local-3.txt").exists());
    }

    #[test]
    fn batch_reconciliation_updates_index_after_create_for_repeated_id() {
        let test_dir = unique_test_dir("reconcile_index_create");
        let entry = || ImportedScoreReconcileEntry {
            song_id: "local-1".to_string(),
            song: sample_song("Created"),
        };

        let report =
            reconcile_imported_score_files_at(&test_dir.path, vec![entry(), entry()]).unwrap();

        assert_eq!(report.created_count, 1);
        assert_eq!(report.unchanged_count, 1);
        assert_eq!(scan_managed_score_files(&test_dir.path).unwrap().len(), 1);
    }

    #[test]
    fn reconciliation_renames_valid_legacy_file() {
        let test_dir = unique_test_dir("reconcile_rename_legacy");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Current Name"));

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current Name"),
            }],
        )
        .unwrap();

        assert_eq!(report.renamed_count, 1);
        assert_eq!(report.verified_song_ids, vec!["local-1"]);
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(test_dir.path.join("Current Name__local-1.txt").exists());
    }

    #[test]
    fn batch_reconciliation_updates_index_after_rename_for_repeated_id() {
        let test_dir = unique_test_dir("reconcile_index_rename");
        let entry = || ImportedScoreReconcileEntry {
            song_id: "local-1".to_string(),
            song: sample_song("Current Name"),
        };

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Current Name"));

        let report =
            reconcile_imported_score_files_at(&test_dir.path, vec![entry(), entry()]).unwrap();

        assert_eq!(report.renamed_count, 1);
        assert_eq!(report.unchanged_count, 1);
        assert_eq!(report.verified_song_ids, vec!["local-1"]);
        assert_eq!(scan_managed_score_files(&test_dir.path).unwrap().len(), 1);
        assert!(test_dir.path.join("Current Name__local-1.txt").exists());
    }

    #[test]
    fn reconciliation_renames_outdated_canonical_file() {
        let test_dir = unique_test_dir("reconcile_rename_canonical");

        write_score_file(
            &test_dir.path,
            "Old Name__local-1.json",
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

        assert_eq!(report.renamed_count, 1);
        assert!(!test_dir.path.join("Old Name__local-1.json").exists());
        assert!(test_dir.path.join("Current Name__local-1.txt").exists());
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

        assert_eq!(report.renamed_count, 1);
        assert!(test_dir.path.join("Current Name__local-1.txt").exists());
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
        assert_eq!(report.verified_song_ids, vec!["local-2"]);
        assert!(test_dir.path.join("Created__local-2.txt").exists());
    }

    #[test]
    fn reconciliation_fails_invalid_canonical_with_valid_legacy_but_read_falls_back() {
        let test_dir = unique_test_dir("reconcile_invalid_canonical_valid_legacy");
        let legacy_song = sample_song("Legacy");

        write_raw_file(&test_dir.path, "Broken__local-1.json", "[{}]");
        write_score_file(&test_dir.path, "local-1.json", &legacy_song);

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Broken"),
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert!(test_dir.path.join("Broken__local-1.json").exists());
        assert!(test_dir.path.join("local-1.json").exists());
        assert_eq!(
            fs::read_to_string(test_dir.path.join("Broken__local-1.json")).unwrap(),
            "[{}]"
        );
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            legacy_song
        );
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

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert!(test_dir.path.join("Current__local-1.json").exists());
        assert_eq!(fs::read_to_string(&invalid_file_path).unwrap(), "{}");
    }

    #[test]
    fn reconciliation_handles_legacy_and_canonical_for_one_id_safely() {
        let test_dir = unique_test_dir("reconcile_duplicate_formats");

        write_score_file(&test_dir.path, "local-1.json", &sample_song("Current"));
        write_score_file(
            &test_dir.path,
            "Current__local-1.json",
            &sample_song("Current"),
        );

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current"),
            }],
        )
        .unwrap();

        assert_eq!(report.renamed_count, 1);
        assert_eq!(report.verified_song_ids, vec!["local-1"]);
        assert!(test_dir.path.join("Current__local-1.txt").exists());
        assert!(!test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn reconciliation_rejects_matching_canonical_with_mismatching_legacy() {
        let test_dir = unique_test_dir("reconcile_canonical_conflicting_legacy");
        let canonical_path = test_dir.path.join("Current__local-1.json");
        let legacy_path = test_dir.path.join("local-1.json");

        write_score_file(
            &test_dir.path,
            "Current__local-1.json",
            &sample_song("Current"),
        );
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Wrong"));

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current"),
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert!(report.failed[0].error.contains("local-1.json"));
        assert!(canonical_path.exists());
        assert!(legacy_path.exists());
    }

    #[test]
    fn reconciliation_rejects_matching_canonical_with_mismatching_second_canonical() {
        let test_dir = unique_test_dir("reconcile_conflicting_canonicals");
        let expected_path = test_dir.path.join("Current__local-1.json");
        let conflicting_path = test_dir.path.join("Wrong__local-1.json");

        write_score_file(
            &test_dir.path,
            "Current__local-1.json",
            &sample_song("Current"),
        );
        write_score_file(&test_dir.path, "Wrong__local-1.json", &sample_song("Wrong"));

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Current"),
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert!(report.failed[0].error.contains("Wrong__local-1.json"));
        assert!(expected_path.exists());
        assert!(conflicting_path.exists());
    }

    #[test]
    fn reconciliation_rejects_mismatching_canonical_with_matching_legacy() {
        let test_dir = unique_test_dir("reconcile_mismatching_canonical_matching_legacy");
        let expected = sample_song("Current");
        let mut conflicting = expected.clone();
        conflicting["songNotes"][0]["key"] = serde_json::json!("1Key9");

        write_score_file(&test_dir.path, "Current__local-1.json", &conflicting);
        write_score_file(&test_dir.path, "local-1.json", &expected);

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: expected,
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert!(test_dir.path.join("Current__local-1.json").exists());
        assert!(test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn reconciliation_conflicting_song_does_not_prevent_later_verification() {
        let test_dir = unique_test_dir("reconcile_conflict_then_success");

        write_score_file(&test_dir.path, "One__local-1.json", &sample_song("One"));
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Wrong"));

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![
                ImportedScoreReconcileEntry {
                    song_id: "local-1".to_string(),
                    song: sample_song("One"),
                },
                ImportedScoreReconcileEntry {
                    song_id: "local-2".to_string(),
                    song: sample_song("Two"),
                },
            ],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.created_count, 1);
        assert_eq!(report.verified_song_ids, vec!["local-2"]);
        assert!(test_dir.path.join("Two__local-2.txt").exists());
    }

    #[test]
    fn reconciliation_ignores_unknown_fields_when_semantics_match() {
        let test_dir = unique_test_dir("reconcile_unknown_fields");
        let expected = sample_song("Expected");
        let mut actual = expected.clone();

        actual
            .as_object_mut()
            .unwrap()
            .insert("harmlessExtra".to_string(), serde_json::json!(true));
        write_score_file(&test_dir.path, "Expected__local-1.json", &actual);

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: expected,
            }],
        )
        .unwrap();

        assert_eq!(report.renamed_count, 1);
        assert_eq!(report.verified_song_ids, vec!["local-1"]);
    }

    #[test]
    fn reconciliation_rejects_content_mismatched_canonical_without_modifying_it() {
        let test_dir = unique_test_dir("reconcile_mismatched_canonical");
        let expected = sample_song("Expected");
        let mut actual = expected.clone();
        actual["songNotes"][0]["key"] = serde_json::json!("1Key9");
        let file_path = test_dir.path.join("Expected__local-1.json");

        write_score_file(&test_dir.path, "Expected__local-1.json", &actual);
        let original_content = fs::read_to_string(&file_path).unwrap();

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: expected,
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), original_content);
        assert!(file_path.exists());
    }

    #[test]
    fn reconciliation_rejects_different_note_order() {
        let test_dir = unique_test_dir("reconcile_note_order");
        let expected = serde_json::json!({
            "name": "Ordered",
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "songNotes": [
                { "time": 0, "key": "1Key0" },
                { "time": 500, "key": "1Key1" }
            ]
        });
        let actual = serde_json::json!({
            "name": "Ordered",
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "songNotes": [
                { "time": 500, "key": "1Key1" },
                { "time": 0, "key": "1Key0" }
            ]
        });

        write_score_file(&test_dir.path, "Ordered__local-1.json", &actual);
        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: expected,
            }],
        )
        .unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.verified_song_ids.is_empty());
    }

    #[test]
    fn reconciliation_preserves_unrelated_json_while_verifying_managed_file() {
        let test_dir = unique_test_dir("reconcile_preserve_unrelated");

        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(test_dir.path.join("notes.json"), "[]").unwrap();
        write_score_file(
            &test_dir.path,
            "Expected__local-1.json",
            &sample_song("Expected"),
        );

        let report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song: sample_song("Expected"),
            }],
        )
        .unwrap();

        assert_eq!(report.verified_song_ids, vec!["local-1"]);
        assert!(test_dir.path.join("notes.json").exists());
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

        assert_eq!(clear_imported_score_files_at(&test_dir.path).unwrap(), 3);
        assert!(!test_dir.path.join("local-1.json").exists());
        assert!(!test_dir.path.join("Canonical__local-2.json").exists());
        assert!(test_dir.path.join("bad name.json").exists());
        assert!(!test_dir.path.join("local-3.txt").exists());
        assert!(test_dir.path.join("local-4.json.tmp").exists());
        assert!(test_dir.path.join("local-5.json").exists());
    }

    #[test]
    fn txt_and_json_candidates_use_required_preference_order() {
        let test_dir = unique_test_dir("candidate_preference");
        let song = sample_song("Preferred");
        write_score_file(&test_dir.path, "Preferred__local-1.json", &song);
        write_score_file(&test_dir.path, "local-1.json", &song);
        write_score_file(&test_dir.path, "local-1.txt", &song);
        write_score_file(&test_dir.path, "Preferred__local-1.txt", &song);

        let files = managed_score_files_for_id(&test_dir.path, "local-1").unwrap();
        let names = files
            .into_iter()
            .map(|file| file.file_name)
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "Preferred__local-1.txt",
                "local-1.txt",
                "Preferred__local-1.json",
                "local-1.json",
            ]
        );
    }

    #[test]
    fn invalid_txt_read_falls_back_to_valid_json() {
        let test_dir = unique_test_dir("read_txt_fallback_json");
        let song = sample_song("Fallback");
        write_raw_file(&test_dir.path, "Fallback__local-1.txt", "not json");
        write_score_file(&test_dir.path, "Fallback__local-1.json", &song);

        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );
    }

    #[test]
    fn generic_storage_migration_is_idempotent_and_deduplicates_repeated_ids() {
        let test_dir = unique_test_dir("generic_migration_idempotent");
        let song = sample_song("Migrated");
        write_score_file(&test_dir.path, "local-1.json", &song);

        let first = migrate_imported_score_storage_at(
            &test_dir.path,
            vec!["local-1".to_string(), "local-1".to_string()],
        )
        .unwrap();
        let second =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();

        assert_eq!(first.renamed_count, 1);
        assert_eq!(second.unchanged_count, 1);
        assert!(test_dir.path.join("Migrated__local-1.txt").exists());
        assert_eq!(scan_managed_score_files(&test_dir.path).unwrap().len(), 1);
    }

    #[test]
    fn generic_storage_migration_scans_directory_once() {
        let test_dir = unique_test_dir("generic_migration_scan_once");
        write_score_file(&test_dir.path, "local-1.json", &sample_song("One"));
        write_score_file(&test_dir.path, "local-2.json", &sample_song("Two"));
        let scan_count = Cell::new(0);

        migrate_imported_score_storage_at_with_scan(
            &test_dir.path,
            vec!["local-1".to_string(), "local-2".to_string()],
            |directory| {
                scan_count.set(scan_count.get() + 1);
                scan_managed_score_files(directory)
            },
        )
        .unwrap();

        assert_eq!(scan_count.get(), 1);
    }

    #[test]
    fn generic_storage_migration_preserves_conflicting_candidates() {
        let test_dir = unique_test_dir("generic_migration_conflict");
        write_score_file(
            &test_dir.path,
            "Conflict__local-1.txt",
            &sample_song("Conflict"),
        );
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Different"));

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(test_dir.path.join("Conflict__local-1.txt").exists());
        assert!(test_dir.path.join("local-1.json").exists());
    }

    #[test]
    fn canonical_directory_collision_is_never_replaced_or_backed_up() {
        let test_dir = unique_test_dir("canonical_directory_collision");
        let song = sample_song("Occupied");
        let target = test_dir.path.join("Occupied__local-1.txt");
        let marker = target.join("keep.txt");
        fs::create_dir_all(&target).unwrap();
        fs::write(&marker, "keep").unwrap();

        let save_error = save_imported_score_song_at(&test_dir.path, "local-1", &song).unwrap_err();
        let durable_write_error =
            write_imported_score_song_file(&target, "local-1", &song).unwrap_err();
        let reconcile_report = reconcile_imported_score_files_at(
            &test_dir.path,
            vec![ImportedScoreReconcileEntry {
                song_id: "local-1".to_string(),
                song,
            }],
        )
        .unwrap();

        assert!(save_error.contains("not a regular file"));
        assert!(durable_write_error.contains("non-regular"));
        assert_eq!(reconcile_report.failed.len(), 1);
        assert!(target.is_dir());
        assert_eq!(fs::read_to_string(marker).unwrap(), "keep");
        assert!(!test_dir.path.join("Occupied__local-1.txt.bak").exists());
        assert!(!test_dir.path.join("Occupied__local-1.txt.tmp").exists());
    }

    #[test]
    fn non_regular_managed_candidate_with_regular_fallback_fails_migration_safely() {
        let test_dir = unique_test_dir("non_regular_with_fallback");
        let song = sample_song("Occupied");
        let non_regular = test_dir.path.join("Occupied__local-1.txt");
        let marker = non_regular.join("keep.txt");
        let fallback = test_dir.path.join("local-1.json");
        fs::create_dir_all(&non_regular).unwrap();
        fs::write(&marker, "keep").unwrap();
        write_score_file(&test_dir.path, "local-1.json", &song);

        assert!(imported_score_file_exists_at(&test_dir.path, "local-1").unwrap());
        assert_eq!(
            list_imported_score_files_at(&test_dir.path).unwrap().len(),
            1
        );
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();

        assert_eq!(report.failed.len(), 1);
        assert!(report.failed[0].error.contains("not a regular file"));
        assert!(non_regular.is_dir());
        assert_eq!(fs::read_to_string(marker).unwrap(), "keep");
        assert!(fallback.is_file());
    }

    #[test]
    fn post_rename_validation_failure_rolls_back_without_updating_index() {
        let test_dir = unique_test_dir("post_rename_rollback");
        let source = test_dir.path.join("local-1.json");
        let target = test_dir.path.join("Rollback__local-1.txt");
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Rollback"));
        let file_index =
            managed_score_file_index_from_files(scan_managed_score_files(&test_dir.path).unwrap());

        let error = rename_and_validate_managed_score_file(&source, &target, |_| {
            Err("injected metadata failure".to_string())
        })
        .err()
        .unwrap();

        assert!(error.contains("original source was restored"));
        assert!(source.is_file());
        assert!(!target.exists());
        assert_eq!(file_index["local-1"][0].path, source);
    }

    #[test]
    fn cleanup_revalidates_redundant_candidate_before_deleting() {
        let test_dir = unique_test_dir("cleanup_revalidate");
        let expected = sample_song("Expected");
        let target = test_dir.path.join("Expected__local-1.txt");
        let redundant = test_dir.path.join("local-1.json");
        write_score_file(&test_dir.path, "Expected__local-1.txt", &expected);
        write_score_file(&test_dir.path, "local-1.json", &expected);
        let files = scan_managed_score_files(&test_dir.path).unwrap();
        let mut file_index = managed_score_file_index_from_files(files.clone());
        write_score_file(&test_dir.path, "local-1.json", &sample_song("Changed"));

        let error = cleanup_verified_redundant_managed_files(
            &mut file_index,
            "local-1",
            &files,
            &target,
            &expected,
        )
        .unwrap_err();

        assert!(error.contains("fresh verification failed"));
        assert!(target.is_file());
        assert!(redundant.is_file());
        assert_eq!(
            read_one_song_from_file(&redundant).unwrap()["name"],
            "Changed"
        );
    }

    #[test]
    fn managed_object_classification_distinguishes_regular_files_and_directories() {
        let test_dir = unique_test_dir("object_classification");
        let regular_path = test_dir.path.join("regular.txt");
        let directory_path = test_dir.path.join("directory.txt");
        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(&regular_path, "regular").unwrap();
        fs::create_dir(&directory_path).unwrap();

        assert!(matches!(
            classify_managed_score_object(&fs::symlink_metadata(regular_path).unwrap().file_type()),
            ManagedScoreObjectKind::RegularFile
        ));
        assert!(matches!(
            classify_managed_score_object(
                &fs::symlink_metadata(directory_path).unwrap().file_type()
            ),
            ManagedScoreObjectKind::NonRegular
        ));
    }

    #[cfg(unix)]
    #[test]
    fn managed_symlink_is_present_but_never_automatically_mutated() {
        use std::os::unix::fs::symlink;

        let test_dir = unique_test_dir("managed_symlink");
        let song = sample_song("Linked");
        let external_target = test_dir.path.join("external-score");
        let managed_link = test_dir.path.join("Linked__local-1.txt");
        let fallback = test_dir.path.join("local-1.json");
        fs::create_dir_all(&test_dir.path).unwrap();
        write_score_file(&test_dir.path, "external-score", &song);
        symlink(&external_target, &managed_link).unwrap();
        write_score_file(&test_dir.path, "local-1.json", &song);

        let files = managed_score_files_for_id(&test_dir.path, "local-1").unwrap();
        let linked_candidate = files.iter().find(|file| file.path == managed_link).unwrap();
        assert!(matches!(
            linked_candidate.object_kind,
            ManagedScoreObjectKind::NonRegular
        ));
        assert!(imported_score_file_exists_at(&test_dir.path, "local-1").unwrap());
        assert_eq!(
            list_imported_score_files_at(&test_dir.path).unwrap().len(),
            1
        );
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();
        assert_eq!(report.failed.len(), 1);
        assert!(fs::symlink_metadata(&managed_link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(fallback.is_file());
        assert!(external_target.is_file());

        assert!(delete_imported_score_file_at(&test_dir.path, "local-1").unwrap());
        assert!(fs::symlink_metadata(&managed_link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(!fallback.exists());
        assert_eq!(clear_imported_score_files_at(&test_dir.path).unwrap(), 0);
        assert!(fs::symlink_metadata(&managed_link)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn durable_writer_refuses_exact_symlink_target_without_artifacts() {
        use std::os::unix::fs::symlink;

        let test_dir = unique_test_dir("writer_symlink_target");
        let target = test_dir.path.join("Linked__local-1.txt");
        let external_target = test_dir.path.join("external-score");
        fs::create_dir_all(&test_dir.path).unwrap();
        write_score_file(&test_dir.path, "external-score", &sample_song("External"));
        symlink(&external_target, &target).unwrap();

        let error =
            write_imported_score_song_file(&target, "local-1", &sample_song("Linked")).unwrap_err();

        assert!(error.contains("non-regular"));
        assert!(fs::symlink_metadata(&target)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            read_one_song_from_file(&external_target).unwrap()["name"],
            "External"
        );
        assert!(!test_dir.path.join("Linked__local-1.txt.tmp").exists());
        assert!(!test_dir.path.join("Linked__local-1.txt.bak").exists());
    }
}
