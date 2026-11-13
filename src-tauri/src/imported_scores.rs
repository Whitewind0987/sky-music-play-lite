use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const IMPORTED_SCORES_DIR_NAME: &str = "imported-scores";
const EXPORTED_SCORES_DIR_NAME: &str = "exported-scores";
const SCORE_ARCHIVE_DIR_NAME: &str = "曲谱分类";
const CANONICAL_IMPORTED_SCORE_FILE_EXTENSION: &str = "txt";
const CANONICAL_FILE_NAME_SEPARATOR: &str = "__";
const FALLBACK_SCORE_TITLE_SEGMENT: &str = "untitled-score";
const MAX_SCORE_ID_LENGTH: usize = 128;
const MAX_SCORE_TITLE_SEGMENT_CHARS: usize = 64;
const MAX_EXPLICIT_NOTE_DURATION_MS: f64 = 60000.0;

/// 镜像清单文件名。位于镜像根目录内，记录该目录下的文件与子目录由程序创建，
/// 从而让同步只清理「自己管理的内容」，绝不误删用户自建的目录或文件。
const MIRROR_MANIFEST_FILE_NAME: &str = ".sky-music-play-lite-mirror.json";
/// 清单格式版本，便于将来演进。
const MIRROR_MANIFEST_VERSION: u32 = 1;

/// 镜像清单：记录程序创建的文件与子目录（相对镜像根目录的路径）。
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MirrorManifest {
    version: u32,
    /// 程序创建的文件（相对根目录）。
    #[serde(default)]
    files: Vec<String>,
    /// 程序创建的子目录（相对根目录）。
    #[serde(default)]
    directories: Vec<String>,
    /// 每个文件对应的曲谱 ID。用于「本轮读取失败时保留该曲谱的旧镜像」，
    /// 避免一次临时读取故障就把已有镜像删掉。
    #[serde(default)]
    file_song_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScoreFileMetadata {
    file_name: String,
    id: String,
    modified_ms: Option<u128>,
    path: String,
    size_bytes: u64,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedScoreFile {
    pub file_name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistExportReport {
    pub exported_files: Vec<ExportedScoreFile>,
    pub failures: Vec<String>,
    pub folder_name: String,
    pub folder_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveScoreEntry {
    pub folder: String,
    pub song: Value,
    pub song_id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedScoreFile {
    pub folder: String,
    pub path: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveReport {
    pub failures: Vec<String>,
    pub root_path: String,
    pub written_files: Vec<ArchivedScoreFile>,
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
    #[serde(rename = "formatVersion", default = "default_format_version")]
    format_version: u8,
    song_notes: Vec<SemanticNote>,
}

#[derive(Debug, Deserialize, PartialEq)]
struct SemanticNote {
    key: String,
    time: f64,
    duration: Option<f64>,
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
pub fn export_playlist_scores_to_folder(
    playlist_name: String,
    song_ids: Vec<String>,
) -> Result<PlaylistExportReport, String> {
    let imported_directory = current_exe_imported_scores_directory()?;
    let exported_root = current_exe_exported_scores_directory()?;

    ensure_exported_scores_directory_at(&exported_root)?;

    let folder_name = sanitize_exported_score_title(&playlist_name);
    let playlist_directory = ensure_unique_playlist_folder(&exported_root, &folder_name)?;

    let mut exported = Vec::new();
    let mut failures = Vec::new();

    for song_id in song_ids {
        match export_imported_score_song_at(&imported_directory, &playlist_directory, &song_id) {
            Ok(file) => exported.push(file),
            Err(error) => failures.push(format!("{}: {}", song_id, error)),
        }
    }

    Ok(PlaylistExportReport {
        exported_files: exported,
        failures,
        folder_path: display_path(&playlist_directory),
        folder_name,
    })
}


/// 把曲谱内容写入「导出区」（exported-scores）下的指定目录。
///
/// 与「自动镜像」区分开：
/// * 自动镜像（sync_score_mirror）写「曲谱分类」，由清单管理，会被同步清理；
/// * 手动导出写「exported-scores」，是用户主动保存的内容，同步不会碰它。
///
/// 曲谱内容由前端提供，因此内置曲谱、本地导入曲谱、歌单私有副本
/// 都能导出（不再受「源文件必须在 imported-scores 里」的限制）。
#[tauri::command]
pub fn export_scores_into_exported_folder(
    folder_name: String,
    entries: Vec<ArchiveScoreEntry>,
) -> Result<ArchiveReport, String> {
    let exported_root = current_exe_exported_scores_directory()?;

    ensure_exported_scores_directory_at(&exported_root)?;

    let folder_segment = sanitize_exported_score_title(&folder_name);
    let playlist_directory = ensure_unique_playlist_folder(&exported_root, &folder_segment)?;

    let mut written = Vec::new();
    let mut failures = Vec::new();

    for entry in &entries {
        match write_exported_score_file(&playlist_directory, entry) {
            Ok(path) => written.push(ArchivedScoreFile {
                folder: entry.folder.clone(),
                path: display_path(&path),
                title: entry.title.clone(),
            }),
            Err(error) => failures.push(format!(
                "{}/{} ({}): {}",
                entry.folder, entry.title, entry.song_id, error
            )),
        }
    }

    Ok(ArchiveReport {
        failures,
        root_path: display_path(&exported_root),
        written_files: written,
    })
}

/// 在导出目录里写一个曲谱文件，文件名带 ID 后缀以免同名互相覆盖。
fn write_exported_score_file(
    directory: &Path,
    entry: &ArchiveScoreEntry,
) -> Result<PathBuf, String> {
    ensure_exported_scores_directory_at(directory)?;

    let title_segment = sanitize_exported_score_title(&entry.title);
    let file_name = archive_score_file_name(&title_segment, &entry.song_id);
    let file_path = directory.join(&file_name);

    let content = format!(
        "{}\n",
        serde_json::to_string_pretty(&Value::Array(vec![entry.song.clone()])).map_err(|error| {
            format!("Failed to serialize exported score {}: {}", entry.song_id, error)
        })?
    );

    fs::write(&file_path, content.as_bytes()).map_err(|error| {
        format!(
            "Failed to write exported score at {}: {}",
            file_path.display(),
            error
        )
    })?;

    Ok(file_path)
}

/// 重命名后的歌单：把旧的分类归档文件夹改名为新名字，保持「歌单 ↔ 文件夹」一致。
#[tauri::command]
pub fn rename_archive_folder(
    old_name: String,
    new_name: String,
) -> Result<bool, String> {
    let root = current_exe_score_archive_directory()?;

    if !root.is_dir() {
        return Ok(false);
    }

    let old_segment = sanitize_exported_score_title(&old_name);
    let new_segment = sanitize_exported_score_title(&new_name);

    if old_segment == new_segment {
        return Ok(false);
    }

    let source = root.join(&old_segment);
    let target = root.join(&new_segment);

    if !path_exists_without_following(&source)? || !source.is_dir() {
        return Ok(false);
    }

    let canonical_root = fs::canonicalize(&root).map_err(|error| {
        format!(
            "Failed to resolve score archive root {}: {}",
            root.display(),
            error
        )
    })?;
    let canonical_source = fs::canonicalize(&source).map_err(|error| {
        format!(
            "Failed to resolve archive folder {}: {}",
            source.display(),
            error
        )
    })?;

    if canonical_source.parent() != Some(canonical_root.as_path()) {
        return Err(format!(
            "Refusing to rename non-child path outside score archive root: {}",
            source.display()
        ));
    }

    // 目标已存在则不覆盖，避免把别的歌单文件夹挤掉。
    if path_exists_without_following(&target)? {
        return Err(format!(
            "Cannot rename archive folder because target already exists: {}",
            target.display()
        ));
    }

    fs::rename(&canonical_source, &target).map_err(|error| {
        format!(
            "Failed to rename archive folder from {} to {}: {}",
            canonical_source.display(),
            target.display(),
            error
        )
    })?;

    Ok(true)
}

#[tauri::command]
pub fn open_score_archive_directory(app: AppHandle) -> Result<(), String> {
    let root = current_exe_score_archive_directory()?;

    ensure_archive_root_directory(&root)?;
    app.opener()
        .open_path(display_path(&root), None::<String>)
        .map_err(|error| {
            format!(
                "Failed to open score archive directory at {}: {}",
                root.display(),
                error
            )
        })
}

/// 清空整个归档根目录，供「重新归档」使用。
#[tauri::command]
pub fn clear_score_archive_directory() -> Result<usize, String> {
    let root = current_exe_score_archive_directory()?;

    if !root.is_dir() {
        return Ok(0);
    }

    let mut removed = 0_usize;

    for entry in fs::read_dir(&root).map_err(|error| {
        format!(
            "Failed to read score archive directory {}: {}",
            root.display(),
            error
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to inspect score archive entry under {}: {}",
                root.display(),
                error
            )
        })?;
        let path = entry.path();

        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| {
                format!(
                    "Failed to remove score archive folder {}: {}",
                    path.display(),
                    error
                )
            })?;
            removed += 1;
        }
    }

    Ok(removed)
}

fn ensure_archive_root_directory(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| {
        format!(
            "Failed to create score archive directory at {}: {}",
            root.display(),
            error
        )
    })
}

fn current_exe_score_archive_directory() -> Result<PathBuf, String> {
    current_exe_score_directory(SCORE_ARCHIVE_DIR_NAME)
}

/// 删除某个歌单/分类对应的归档文件夹。
///
/// 「曲谱分类」是自动镜像区：目录里可能混有用户自己放进去的文件。
/// 因此这里只删除**镜像清单登记过的文件**，以及删除后已变空的目录，
/// 目录内用户自建的文件一律保留。
#[tauri::command]
pub fn delete_archive_folder(folder_name: String) -> Result<bool, String> {
    let root = current_exe_score_archive_directory()?;

    if !root.is_dir() {
        return Ok(false);
    }

    let folder_segment = sanitize_exported_score_title(&folder_name);
    let candidate = root.join(&folder_segment);

    if !path_exists_without_following(&candidate)? || !candidate.is_dir() {
        return Ok(false);
    }

    let canonical_root = fs::canonicalize(&root).map_err(|error| {
        format!(
            "Failed to resolve score archive root {}: {}",
            root.display(),
            error
        )
    })?;
    let canonical_candidate = fs::canonicalize(&candidate).map_err(|error| {
        format!(
            "Failed to resolve archive folder {}: {}",
            candidate.display(),
            error
        )
    })?;

    if canonical_candidate.parent() != Some(canonical_root.as_path()) {
        return Err(format!(
            "Refusing to delete non-child path outside score archive root: {}",
            candidate.display()
        ));
    }

    let manifest = read_mirror_manifest(&root);
    let folder_prefix = format!("{}/", folder_segment.replace('\\', "/"));

    let mut removed_any = false;

    // 只删除清单登记在该目录下的文件。
    for relative in &manifest.files {
        let normalized = relative.replace('\\', "/");
        if !normalized.starts_with(&folder_prefix) {
            continue;
        }

        let Some(path) = resolve_manifest_path(&root, relative) else {
            continue;
        };

        if !path_exists_without_following(&path).unwrap_or(false) {
            continue;
        }

        if let Err(error) = fs::remove_file(&path) {
            return Err(format!(
                "Failed to delete archive file at {}: {}",
                path.display(),
                error
            ));
        }

        removed_any = true;
    }

    // 目录内已经没有内容时才移除目录本身；否则保留（里面还有用户的文件）。
    let remaining = fs::read_dir(&canonical_candidate)
        .map(|entries| entries.flatten().count())
        .unwrap_or(0);

    if remaining == 0 {
        if let Err(error) = fs::remove_dir(&canonical_candidate) {
            return Err(format!(
                "Failed to delete archive folder at {}: {}",
                canonical_candidate.display(),
                error
            ));
        }

        removed_any = true;
    }

    Ok(removed_any)
}

/// 读取镜像清单。清单缺失或损坏时返回空清单（表示「没有任何已登记内容」），
/// 这样最坏情况只是不清理旧内容，而不会误删用户文件。
fn read_mirror_manifest(root: &Path) -> MirrorManifest {
    let manifest_path = root.join(MIRROR_MANIFEST_FILE_NAME);

    let empty = || MirrorManifest {
        version: MIRROR_MANIFEST_VERSION,
        files: Vec::new(),
        directories: Vec::new(),
        file_song_ids: Vec::new(),
    };

    let Ok(raw) = fs::read_to_string(&manifest_path) else {
        return empty();
    };

    match serde_json::from_str::<MirrorManifest>(&raw) {
        Ok(manifest) => manifest,
        Err(_) => empty(),
    }
}

/// 写回镜像清单。写入失败不阻断同步主体，仅返回错误供调用方记录。
fn write_mirror_manifest(root: &Path, manifest: &MirrorManifest) -> Result<(), String> {
    let manifest_path = root.join(MIRROR_MANIFEST_FILE_NAME);
    let serialized = serde_json::to_string_pretty(manifest)
        .map_err(|error| format!("Failed to serialize mirror manifest: {}", error))?;

    fs::write(&manifest_path, serialized.as_bytes()).map_err(|error| {
        format!(
            "Failed to write mirror manifest at {}: {}",
            manifest_path.display(),
            error
        )
    })
}

/// 解析清单中的相对路径，并确保它没有逃出镜像根目录。
/// 返回 `None` 表示该条目非法（越界或为空），调用方应跳过而不是删除。
fn resolve_manifest_path(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.is_empty() {
        return None;
    }

    // 拒绝绝对路径与任何父目录跳转，确保清单无法指向根目录之外。
    let mut candidate = root.to_path_buf();
    for segment in relative.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return None;
        }
        candidate.push(segment);
    }

    Some(candidate)
}

/// 按清单清理镜像目录中「由程序创建」的文件与子目录。
///
/// 只处理清单里登记过的相对路径，因此用户自行创建的文件或目录一律保留。
/// 目录按深度倒序删除，保证先删子目录再删父目录。
fn cleanup_manifest_entries(root: &Path, manifest: &MirrorManifest) -> Vec<String> {
    let mut failures = Vec::new();

    // 先删文件。
    for relative in &manifest.files {
        let Some(path) = resolve_manifest_path(root, relative) else {
            continue;
        };

        if !path_exists_without_following(&path).unwrap_or(false) {
            continue;
        }

        if let Err(error) = fs::remove_file(&path) {
            failures.push(format!("清理文件 {} 失败: {}", path.display(), error));
        }
    }

    // 再删目录（深度倒序，保证子目录先于父目录被删）。
    let mut directories: Vec<(usize, &String)> = manifest
        .directories
        .iter()
        .map(|relative| (relative.split('/').count(), relative))
        .collect();
    directories.sort_by(|left, right| right.0.cmp(&left.0));

    for (_, relative) in directories {
        let Some(path) = resolve_manifest_path(root, relative) else {
            continue;
        };

        if !path_exists_without_following(&path).unwrap_or(false) {
            continue;
        }

        if !path.is_dir() {
            continue;
        }

        // 只删空目录：目录里可能还有用户自己放的文件，
        // 递归删除会把它们一起带走。
        let remaining = fs::read_dir(&path)
            .map(|entries| entries.flatten().count())
            .unwrap_or(0);

        if remaining > 0 {
            continue;
        }

        if let Err(error) = fs::remove_dir(&path) {
            failures.push(format!("清理目录 {} 失败: {}", path.display(), error));
        }
    }

    failures
}


/// 旧格式镜像迁移报告。
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorMigrationReport {
    /// 删除的旧格式曲谱文件数。
    pub removed_legacy_files: usize,
    /// 删除的空目录数。
    pub removed_empty_directories: usize,
    /// 因无法解析而保留的文件（很可能是用户自己放的文件）。
    pub preserved_files: Vec<String>,
    /// 本次是否真的执行了迁移。
    pub migrated: bool,
}

/// 判断某个文件是否是「程序生成的旧格式镜像曲谱」。
///
/// 判据：扩展名是 .txt，且内容能解析为合法的曲谱 JSON。
/// 用户自己放进去的其它文件（说明文档、图片、随手记的 txt）都解析不出来，
/// 因此会被保留。
fn is_legacy_mirror_score_file(file_path: &Path) -> bool {
    if file_path.extension().and_then(|value| value.to_str()) != Some("txt") {
        return false;
    }

    // 新格式文件名带 ID 后缀，不属于旧格式。
    let Some(stem) = file_path.file_stem().and_then(|value| value.to_str()) else {
        return false;
    };

    if stem.contains(CANONICAL_FILE_NAME_SEPARATOR) {
        return false;
    }

    // 内容必须是合法曲谱。
    read_one_song_from_file(file_path).is_ok()
}

/// 一次性迁移旧格式的镜像目录。
///
/// 旧版本把镜像直接写进「曲谱分类」下的目录，文件名是「标题.txt」，
/// 没有清单记录。新版本改用清单管理，并在文件名里加入 ID 后缀。
///
/// 迁移策略：
/// ① 只删除「能解析为合法曲谱 JSON 的 .txt 文件」—— 用户自己放的文件一律保留；
/// ② 删除后变空的目录一并移除；
/// ③ 迁移完成后写入一份清单，标记这些目录已由程序接管。
///
/// 该命令是幂等的：迁移过一次之后再次调用不会有任何改动。
#[tauri::command]
pub fn migrate_legacy_score_mirror() -> Result<MirrorMigrationReport, String> {
    let root = current_exe_score_archive_directory()?;

    let mut report = MirrorMigrationReport {
        migrated: false,
        ..MirrorMigrationReport::default()
    };

    if !root.is_dir() {
        return Ok(report);
    }

    // 已有清单说明已经迁移过（或已经是新版），不再处理。
    if root.join(MIRROR_MANIFEST_FILE_NAME).exists() {
        return Ok(report);
    }

    let read_dir = fs::read_dir(&root).map_err(|error| {
        format!(
            "Failed to read score archive root {}: {}",
            root.display(),
            error
        )
    })?;

    let mut directories: Vec<PathBuf> = Vec::new();

    for entry in read_dir.flatten() {
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        directories.push(path);
    }

    for directory in directories {
        let Ok(children) = fs::read_dir(&directory) else {
            continue;
        };

        for child in children.flatten() {
            let path = child.path();

            if !path.is_file() {
                continue;
            }

            if is_legacy_mirror_score_file(&path) {
                if let Err(error) = fs::remove_file(&path) {
                    report
                        .preserved_files
                        .push(format!("{} ({})", path.display(), error));
                } else {
                    report.removed_legacy_files += 1;
                }
            } else {
                // 不是程序生成的旧镜像文件：保留。
                report.preserved_files.push(path.display().to_string());
            }
        }

        // 目录变空才移除；还留着用户文件就保留。
        let remaining = fs::read_dir(&directory)
            .map(|entries| entries.flatten().count())
            .unwrap_or(0);

        if remaining == 0 {
            if fs::remove_dir(&directory).is_ok() {
                report.removed_empty_directories += 1;
            }
        }
    }

    report.migrated = report.removed_legacy_files > 0;

    // 写一份空清单，标记迁移已完成：之后的同步只管理自己登记的内容。
    let manifest = MirrorManifest {
        version: MIRROR_MANIFEST_VERSION,
        files: Vec::new(),
        directories: Vec::new(),
        file_song_ids: Vec::new(),
    };

    if let Err(error) = write_mirror_manifest(&root, &manifest) {
        report.preserved_files.push(error);
    }

    Ok(report)
}

/// 全量同步镜像：按当前歌单/分类重建「曲谱分类」下的镜像内容。
///
/// 安全约定：
/// ① 只删除清单登记过的内容，用户自建的目录与文件一律保留；
/// ② 先写新内容、成功后再删旧内容，写入失败不会丢失已有镜像；
/// ③ 文件名带曲谱 ID 后缀，同名曲谱不会互相覆盖。
#[tauri::command]
pub fn sync_score_mirror(
    empty_folders: Vec<String>,
    entries: Vec<ArchiveScoreEntry>,
    preserve_song_ids: Vec<String>,
) -> Result<ArchiveReport, String> {
    let root = current_exe_score_archive_directory()?;

    ensure_archive_root_directory(&root)?;

    let mut failures = Vec::new();

    // 1) 读取上一轮清单：它定义了「哪些内容归程序管」。
    let previous_manifest = read_mirror_manifest(&root);

    // 2) 计算本轮要写入的内容（文件名已含唯一 ID），先写盘。
    let mut written = Vec::new();
    let mut written_keys = std::collections::BTreeSet::new();
    let mut next_manifest = MirrorManifest {
        version: MIRROR_MANIFEST_VERSION,
        files: Vec::new(),
        directories: Vec::new(),
        file_song_ids: Vec::new(),
    };
    let mut next_directories = std::collections::BTreeSet::new();

    // 空歌单/空分类也要建目录（只建目录，不写文件）。
    for folder in &empty_folders {
        let folder_segment = sanitize_exported_score_title(folder);
        let directory = root.join(&folder_segment);

        if let Err(error) = ensure_exported_scores_directory_at(&directory) {
            failures.push(format!("{}/（空文件夹）: {}", folder, error));
            continue;
        }

        next_directories.insert(folder_segment);
    }

    // 按传入条目重建：entries 里的 folder 就是目标目录名。
    // 去重规则：同一个文件夹内，同一首曲谱只写一份；
    // 不同歌单文件夹之间，同一首歌各自拥有独立文件（这是允许的）。
    for entry in &entries {
        let dedupe_key = format!("{}\u{1}{}", entry.folder, entry.song_id);

        if !written_keys.insert(dedupe_key) {
            continue; // 同一文件夹内重复的曲谱，跳过
        }

        let folder_segment = sanitize_exported_score_title(&entry.folder);

        match write_archive_score_file_overwrite(&root, entry) {
            Ok(path) => {
                // 记录相对路径与曲谱 ID，供下次同步时精确清理 / 保留。
                if let Ok(relative) = path.strip_prefix(&root) {
                    if let Some(relative) = relative.to_str() {
                        next_manifest.files.push(relative.replace('\\', "/"));
                        next_manifest.file_song_ids.push(entry.song_id.clone());
                    }
                }

                next_directories.insert(folder_segment);

                written.push(ArchivedScoreFile {
                    folder: entry.folder.clone(),
                    path: display_path(&path),
                    title: entry.title.clone(),
                });
            }
            Err(error) => failures.push(format!(
                "{}/{} ({}): {}",
                entry.folder, entry.title, entry.song_id, error
            )),
        }
    }

    next_manifest.directories = next_directories.into_iter().collect();

    // 3) 新内容已全部写入成功后，才清理上一轮登记的旧内容。
    //    顺序很关键：先写后删，写入失败时旧镜像仍然完好。
    //
    //    清理集 = 上一轮清单 − 本轮清单：
    //    只有「上一轮有、这一轮没有重新写入」的路径才需要删除。
    //    上一轮和这一轮都有的文件路径相同（本轮已覆盖更新），
    //    若也一并删除就会把刚写好的内容删掉。
    //
    //    本轮读取失败的曲谱（preserve_song_ids）对应的旧文件要保留：
    //    一次临时读取故障不应该让磁盘镜像与曲库状态不一致。
    let preserved: std::collections::BTreeSet<&String> =
        preserve_song_ids.iter().collect();
    // 被保留的文件：既不删文件，也不删它所在的目录。
    // 目录删除用的是 remove_dir_all（递归），若不排除就会连带删掉保留文件。
    let preserved_files: Vec<&String> = previous_manifest
        .files
        .iter()
        .enumerate()
        .filter(|(index, _)| {
            previous_manifest
                .file_song_ids
                .get(*index)
                .map(|song_id| preserved.contains(song_id))
                .unwrap_or(false)
        })
        .map(|(_, relative)| relative)
        .collect();

    let preserved_directories: std::collections::BTreeSet<String> =
        preserved_files
            .iter()
            .filter_map(|relative| {
                relative
                    .split('/')
                    .next()
                    .map(|segment| segment.to_string())
            })
            .collect();

    // 本轮已经写入的路径集合：这些路径不需要清理。
    let current_files: std::collections::BTreeSet<&String> =
        next_manifest.files.iter().collect();
    let current_directories: std::collections::BTreeSet<&String> =
        next_manifest.directories.iter().collect();

    let cleanup_manifest = MirrorManifest {
        version: previous_manifest.version,
        files: previous_manifest
            .files
            .iter()
            .enumerate()
            .filter(|(index, relative)| {
                // 本轮已写入 → 不删
                if current_files.contains(relative) {
                    return false;
                }
                // 被 preserve → 不删
                previous_manifest
                    .file_song_ids
                    .get(*index)
                    .map(|song_id| !preserved.contains(song_id))
                    .unwrap_or(true)
            })
            .map(|(_, relative)| relative.clone())
            .collect(),
        directories: previous_manifest
            .directories
            .iter()
            .filter(|directory| {
                // 本轮仍在使用 → 不删
                if current_directories.contains(*directory) {
                    return false;
                }
                // 含被保留文件的目录 → 不删
                !preserved_directories.contains(*directory)
            })
            .cloned()
            .collect(),
        file_song_ids: Vec::new(),
    };
    let mut cleanup_failures = cleanup_manifest_entries(&root, &cleanup_manifest);
    failures.append(&mut cleanup_failures);

    // 4) 写回新清单。即便清理有失败，也已经写入了新的清单内容，
    //    下轮同步不会再重复清理这些路径。
    if let Err(error) = write_mirror_manifest(&root, &next_manifest) {
        failures.push(error);
    }

    Ok(ArchiveReport {
        failures,
        root_path: display_path(&root),
        written_files: written,
    })
}

/// 写入归档文件，**同名直接覆盖**（用于镜像同步，避免重复堆积）。
///
/// 文件名由「曲谱标题 + 曲谱 ID 后缀」组成：标题保证可读，ID 保证唯一且稳定，
/// 因此不同曲谱即使同名也不会写到同一路径。
fn write_archive_score_file_overwrite(
    root: &Path,
    entry: &ArchiveScoreEntry,
) -> Result<PathBuf, String> {
    let folder_segment = sanitize_exported_score_title(&entry.folder);
    let title_segment = sanitize_exported_score_title(&entry.title);
    let directory = root.join(&folder_segment);

    ensure_exported_scores_directory_at(&directory)?;

    let file_path = directory.join(archive_score_file_name(&title_segment, &entry.song_id));

    let content = format!(
        "{}\n",
        serde_json::to_string_pretty(&Value::Array(vec![entry.song.clone()])).map_err(|error| {
            format!("Failed to serialize archived score {}: {}", entry.song_id, error)
        })?
    );

    fs::write(&file_path, content.as_bytes()).map_err(|error| {
        format!(
            "Failed to write archived score at {}: {}",
            file_path.display(),
            error
        )
    })?;

    Ok(file_path)
}

/// 生成镜像文件名：`标题__<ID 片段>.txt`。
///
/// ID 片段由曲谱 ID 稳定派生，同一曲谱每次同步得到相同文件名（可覆盖、可去重），
/// 不同曲谱即使标题相同也会得到不同文件名（不会互相覆盖）。
fn archive_score_file_name(title_segment: &str, song_id: &str) -> String {
    let id_suffix = stable_song_id_suffix(song_id);

    format!(
        "{}{}{}.{}",
        title_segment,
        CANONICAL_FILE_NAME_SEPARATOR,
        id_suffix,
        CANONICAL_IMPORTED_SCORE_FILE_EXTENSION
    )
}

/// 从曲谱 ID 派生一个短且稳定的文件名词片段。
///
/// 只使用字母数字与短横线，避免非法字符；长度固定，跨次同步保持一致。
fn stable_song_id_suffix(song_id: &str) -> String {
    // FNV-1a 64bit，跨平台稳定（不依赖平台相关的 hasher）。
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in song_id.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    let digest = format!("{:016x}", hash);

    // 带上 ID 的可读前缀，便于人工排查同名冲突。
    let readable: String = song_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .take(12)
        .collect();

    if readable.is_empty() {
        digest
    } else {
        format!("{}-{}", readable.to_ascii_lowercase(), &digest[..8])
    }
}

/// 删除歌单对应的导出文件夹（含其中所有乐谱）。
/// 只允许删除 exported-scores 根目录下的直接子目录，杜绝路径穿越。
///
/// 只删除**与歌单名精确对应**的那一个目录；带序号的历史目录保留。
#[tauri::command]
pub fn delete_playlist_export_folder(playlist_name: String) -> Result<bool, String> {
    let exported_root = current_exe_exported_scores_directory()?;

    if !exported_root.is_dir() {
        return Ok(false);
    }

    let folder_name = sanitize_exported_score_title(&playlist_name);
    let canonical_root = fs::canonicalize(&exported_root).map_err(|error| {
        format!(
            "Failed to resolve exported scores root {}: {}",
            exported_root.display(),
            error
        )
    })?;

    let mut removed_any = false;

    // 只处理与歌单名精确匹配的主目录。
    // 历史上因重名追加过序号的 "名字 (1)"、"名字 (2)"…… 属于用户可能主动
    // 保存过的导出内容，一律保留，不随歌单删除而清理。
    for candidate in [exported_root.join(&folder_name)] {
        if !path_exists_without_following(&candidate)? {
            continue;
        }

        let canonical_candidate = fs::canonicalize(&candidate).map_err(|error| {
            format!(
                "Failed to resolve playlist export folder {}: {}",
                candidate.display(),
                error
            )
        })?;

        // 只删根目录的直接子目录，防止路径穿越或误删。
        if canonical_candidate.parent() != Some(canonical_root.as_path()) {
            continue;
        }

        if !canonical_candidate.is_dir() {
            continue;
        }

        fs::remove_dir_all(&canonical_candidate).map_err(|error| {
            format!(
                "Failed to delete playlist export folder at {}: {}",
                canonical_candidate.display(),
                error
            )
        })?;
        removed_any = true;
    }

    Ok(removed_any)
}

/// 歌单文件夹命名：固定使用歌单名，保证「歌单 ↔ 文件夹」一一对应，
/// 重复导出时清理旧内容重新写入，删除歌单时据此定位。
fn ensure_unique_playlist_folder(root: &Path, folder_name: &str) -> Result<PathBuf, String> {
    let candidate = root.join(folder_name);

    if path_exists_without_following(&candidate)? {
        // 清空旧内容，避免重复导出残留已从歌单移除的曲谱。
        let canonical_root = fs::canonicalize(root).map_err(|error| {
            format!(
                "Failed to resolve exported scores root {}: {}",
                root.display(),
                error
            )
        })?;
        let canonical_candidate = fs::canonicalize(&candidate).map_err(|error| {
            format!(
                "Failed to resolve playlist export folder {}: {}",
                candidate.display(),
                error
            )
        })?;

        if canonical_candidate.parent() != Some(canonical_root.as_path()) {
            return Err(format!(
                "Refusing to reuse non-child path outside exported scores root: {}",
                candidate.display()
            ));
        }

        fs::remove_dir_all(&canonical_candidate).map_err(|error| {
            format!(
                "Failed to clear existing playlist export folder at {}: {}",
                canonical_candidate.display(),
                error
            )
        })?;
    }

    ensure_exported_scores_directory_at(&candidate)?;

    Ok(candidate)
}

#[tauri::command]
pub fn reveal_imported_score_file(app: AppHandle, song_id: String) -> Result<String, String> {
    let directory = current_exe_imported_scores_directory()?;
    let file_path = resolve_imported_score_file_for_id(&directory, &song_id)?;

    app.opener()
        .reveal_item_in_dir(&file_path)
        .map_err(|error| {
            format!(
                "Failed to reveal imported score file at {}: {}",
                file_path.display(),
                error
            )
        })?;

    Ok(display_path(&file_path))
}

/// 定位某个曲谱 id 的真实文件路径：优先用已登记的受管文件，
/// 找不到时按规范命名回退，便于资源管理器高亮选中。
fn resolve_imported_score_file_for_id(directory: &Path, song_id: &str) -> Result<PathBuf, String> {
    let files = managed_score_files_for_id(directory, song_id)?;

    if let Some(file) = files.first() {
        return Ok(file.path.clone());
    }

    let song = read_imported_score_song_at(directory, song_id)?;
    let canonical_path = canonical_imported_score_file_path(directory, song_id, &song)?;

    if canonical_path.exists() {
        return Ok(canonical_path);
    }

    Err(format!(
        "No imported score file found for ID {} in {}",
        song_id,
        directory.display()
    ))
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

#[tauri::command]
pub fn export_imported_score_song(song_id: String) -> Result<ExportedScoreFile, String> {
    let imported_directory = current_exe_imported_scores_directory()?;
    let exported_directory = current_exe_exported_scores_directory()?;

    export_imported_score_song_at(&imported_directory, &exported_directory, &song_id)
}

#[tauri::command]
pub fn open_exported_scores_directory(app: AppHandle) -> Result<(), String> {
    let directory = current_exe_exported_scores_directory()?;

    ensure_exported_scores_directory_at(&directory)?;
    app.opener()
        .open_path(display_path(&directory), None::<String>)
        .map_err(|error| {
            format!(
                "Failed to open exported score directory at {}: {}",
                directory.display(),
                error
            )
        })
}

fn current_exe_imported_scores_directory() -> Result<PathBuf, String> {
    current_exe_score_directory(IMPORTED_SCORES_DIR_NAME)
}

fn current_exe_exported_scores_directory() -> Result<PathBuf, String> {
    current_exe_score_directory(EXPORTED_SCORES_DIR_NAME)
}

fn current_exe_score_directory(directory_name: &str) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve current executable path: {}", error))?;
    let exe_directory = exe_path.parent().ok_or_else(|| {
        format!(
            "Current executable path has no parent directory: {}",
            exe_path.display()
        )
    })?;

    Ok(exe_directory.join(directory_name))
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

fn ensure_exported_scores_directory_at(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|error| {
        format!(
            "Failed to create exported score directory at {}: {}",
            directory.display(),
            error
        )
    })
}

fn export_imported_score_song_at(
    imported_directory: &Path,
    exported_directory: &Path,
    song_id: &str,
) -> Result<ExportedScoreFile, String> {
    let song = read_imported_score_song_at(imported_directory, song_id)?;
    let content = format!(
        "{}\n",
        serde_json::to_string_pretty(&Value::Array(vec![song.clone()])).map_err(|error| {
            format!("Failed to serialize exported score {}: {}", song_id, error)
        })?
    );
    let title = sanitize_exported_score_title(song_name_from_value(&song));

    ensure_exported_scores_directory_at(exported_directory)?;

    for sequence in 1_u32.. {
        let file_name = if sequence == 1 {
            format!("{}.txt", title)
        } else {
            format!("{} ({}).txt", title, sequence)
        };
        let file_path = exported_directory.join(&file_name);
        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => {
                if path_exists_without_following(&file_path)? {
                    continue;
                }
                return Err(format!(
                    "Failed to create exported score file at {}: {}",
                    file_path.display(),
                    error
                ));
            }
        };

        if let Err(error) = file
            .write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
        {
            let _ = fs::remove_file(&file_path);
            return Err(format!(
                "Failed to write exported score file at {}: {}",
                file_path.display(),
                error
            ));
        }

        return Ok(ExportedScoreFile {
            file_name,
            path: display_path(&file_path),
        });
    }

    unreachable!("export collision suffix sequence cannot be exhausted")
}

fn save_imported_score_song_at(
    directory: &Path,
    song_id: &str,
    song: &Value,
) -> Result<PathBuf, String> {
    let canonical_song = canonicalize_managed_song(song)?;
    let song = &canonical_song;
    ensure_imported_scores_directory_at(directory)?;

    let file_path = canonical_imported_score_file_path(directory, song_id, song)?;
    validate_managed_song(&file_path, song)?;
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
    }
    ensure_canonical_managed_song_content(&file_path, song_id, song)?;

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
    let canonical_song = canonicalize_managed_song(song)?;
    let song = &canonical_song;
    validate_imported_score_id(song_id)?;

    let canonical_path = canonical_imported_score_file_path(directory, song_id, song)?;
    validate_managed_song(&canonical_path, song)?;
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
        ensure_canonical_managed_song_content(&canonical_path, song_id, song)?;
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

    if let Some(canonical_file) = files.iter().find(|file| file.path == canonical_path) {
        require_regular_file_without_following(
            &canonical_file.path,
            "canonical managed score target",
        )?;
        ensure_canonical_managed_song_content(&canonical_path, song_id, song)?;

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
            ensure_canonical_managed_song_content(target_path, song_id, song)?;
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

fn read_raw_one_song_from_file(file_path: &Path) -> Result<Value, String> {
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

fn read_one_song_from_file(file_path: &Path) -> Result<Value, String> {
    let song = canonicalize_managed_song(&read_raw_one_song_from_file(file_path)?)?;
    validate_managed_song(file_path, &song)?;

    Ok(song)
}

fn read_and_verify_expected_song(file_path: &Path, expected_song: &Value) -> Result<Value, String> {
    let actual_song = read_one_song_from_file(file_path)?;
    verify_managed_song_semantics(file_path, &actual_song, expected_song)?;

    Ok(actual_song)
}

fn ensure_canonical_managed_song_content(
    file_path: &Path,
    song_id: &str,
    expected_song: &Value,
) -> Result<Value, String> {
    require_regular_file_without_following(file_path, "managed score canonical rewrite target")?;
    let raw_song = read_raw_one_song_from_file(file_path)?;
    let canonical_song = canonicalize_managed_song(&raw_song)?;
    validate_managed_song(file_path, &canonical_song)?;
    verify_managed_song_semantics(file_path, &canonical_song, expected_song)?;

    if raw_song != canonical_song {
        write_imported_score_song_file(file_path, song_id, &canonical_song)?;
        let rewritten_raw_song = read_raw_one_song_from_file(file_path)?;
        let rewritten_song = canonicalize_managed_song(&rewritten_raw_song)?;
        validate_managed_song(file_path, &rewritten_song)?;

        if rewritten_raw_song != rewritten_song {
            return Err(format!(
                "Imported score file at {} remains physically noncanonical after rewrite",
                file_path.display()
            ));
        }

        verify_managed_song_semantics(file_path, &rewritten_song, expected_song)?;
        return Ok(rewritten_song);
    }

    Ok(canonical_song)
}

fn verify_managed_song_semantics(
    file_path: &Path,
    actual_song: &Value,
    expected_song: &Value,
) -> Result<(), String> {
    let expected_semantics = semantic_song_from_value(expected_song).map_err(|error| {
        format!(
            "Expected imported score for verification is invalid: {}",
            error
        )
    })?;
    let actual_semantics = semantic_song_from_value(actual_song).map_err(|error| {
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

    Ok(())
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
    serde_json::from_value(canonicalize_managed_song(song)?)
        .map_err(|error| format!("Failed to normalize song semantics: {}", error))
}

fn default_format_version() -> u8 {
    1
}

fn canonicalize_managed_song(song: &Value) -> Result<Value, String> {
    let mut canonical_song = song.clone();
    let song_object = canonical_song
        .as_object_mut()
        .ok_or_else(|| "Managed score song must be an object.".to_string())?;
    let explicit_format_version = match song_object.get("formatVersion") {
        None => None,
        Some(value) if value.as_u64() == Some(1) => Some(1_u64),
        Some(value) if value.as_u64() == Some(2) => Some(2_u64),
        Some(_) => return Err("Managed score formatVersion must be the number 1 or 2.".to_string()),
    };
    let has_duration = song_object
        .get("songNotes")
        .and_then(Value::as_array)
        .is_some_and(|notes| notes.iter().any(|note| note.get("duration").is_some()));

    if explicit_format_version == Some(1) {
        if let Some(notes) = song_object
            .get_mut("songNotes")
            .and_then(Value::as_array_mut)
        {
            for note in notes {
                if let Some(note_object) = note.as_object_mut() {
                    note_object.remove("duration");
                }
            }
        }
    } else if explicit_format_version == Some(2)
        || (explicit_format_version.is_none() && has_duration)
    {
        song_object.insert("formatVersion".to_string(), Value::from(2));
    }

    Ok(canonical_song)
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

    if let Some(format_version) = song_object.get("formatVersion") {
        if !matches!(format_version.as_u64(), Some(1 | 2)) {
            return Err(format!(
                "Imported score file at {} formatVersion must be the number 1 or 2",
                file_path.display()
            ));
        }
    }

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

        if let Some(duration) = note_object.get("duration") {
            let is_valid_duration = duration.as_f64().is_some_and(|value| {
                value.is_finite() && value > 0.0 && value <= MAX_EXPLICIT_NOTE_DURATION_MS
            });

            if !is_valid_duration {
                return Err(format!(
                    "Imported score file at {} songNotes[{}].duration must be a positive number no greater than {}",
                    file_path.display(),
                    note_index,
                    MAX_EXPLICIT_NOTE_DURATION_MS
                ));
            }
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

fn sanitize_exported_score_title(title: &str) -> String {
    let sanitized = sanitize_score_title_segment(title)
        .trim_matches([' ', '.'])
        .to_string();
    let sanitized = if sanitized.is_empty() {
        FALLBACK_SCORE_TITLE_SEGMENT.to_string()
    } else {
        sanitized
    };
    let device_stem = sanitized
        .split('.')
        .next()
        .unwrap_or(&sanitized)
        .trim()
        .to_ascii_uppercase();
    let is_reserved = matches!(device_stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || device_stem.strip_prefix("COM").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
        || device_stem.strip_prefix("LPT").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        });

    if is_reserved {
        format!("_{}", sanitized)
    } else {
        sanitized
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

    fn unversioned_duration_song(name: &str) -> Value {
        serde_json::json!({
            "name": name,
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "songNotes": [{"time": 0, "key": "1Key0", "duration": 1500}]
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
    fn exported_filename_sanitizes_paths_fallbacks_and_windows_devices() {
        assert_eq!(
            sanitize_exported_score_title(r#"../A<B>:C/D\\E?F*"#),
            "A B C D E F"
        );
        assert_eq!(sanitize_exported_score_title("////"), "untitled-score");
        assert_eq!(sanitize_exported_score_title("CON"), "_CON");
        assert_eq!(sanitize_exported_score_title("com1.demo"), "_com1.demo");
        assert_eq!(sanitize_exported_score_title("COM0"), "COM0");
        assert_eq!(sanitize_exported_score_title("LPT10"), "LPT10");
    }

    #[test]
    fn export_round_trips_canonical_v2_without_mutating_managed_source() {
        let root = unique_test_dir("export_v2_round_trip");
        let imported_directory = root.path.join("imported");
        let exported_directory = root.path.join("exported");
        let song_id = "local-export-v2";
        let song = serde_json::json!({
            "name": "夜曲",
            "bpm": 98,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "formatVersion": 2,
            "songNotes": [
                {"time": 0, "key": "1Key0", "duration": 137},
                {"time": 421, "key": "1Key1", "duration": 2048}
            ]
        });
        let managed_path = save_imported_score_song_at(&imported_directory, song_id, &song)
            .expect("managed score should be saved");
        let managed_before = fs::read(&managed_path).expect("managed source should be readable");

        let result =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("score should be exported");

        assert_eq!(result.file_name, "夜曲.txt");
        assert_eq!(
            PathBuf::from(&result.path),
            exported_directory.join("夜曲.txt")
        );
        let exported: Value = serde_json::from_str(
            &fs::read_to_string(&result.path).expect("export should be readable"),
        )
        .expect("export should be JSON");
        let songs = exported.as_array().expect("export should be an array");
        assert_eq!(songs.len(), 1);
        assert_eq!(
            songs[0],
            read_imported_score_song_at(&imported_directory, song_id).unwrap()
        );
        assert_eq!(songs[0]["formatVersion"], 2);
        assert_eq!(songs[0]["songNotes"][0]["duration"], 137);
        assert_eq!(songs[0]["songNotes"][1]["duration"], 2048);
        assert_eq!(fs::read(&managed_path).unwrap(), managed_before);
    }

    #[test]
    fn export_keeps_v1_shape_and_importable_one_song_array() {
        let root = unique_test_dir("export_v1_shape");
        let imported_directory = root.path.join("imported");
        let exported_directory = root.path.join("exported");
        let song_id = "local-export-v1";
        save_imported_score_song_at(&imported_directory, song_id, &sample_song("Simple Song"))
            .expect("managed score should be saved");

        let result =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("score should be exported");
        let exported_song = read_raw_one_song_from_file(Path::new(&result.path))
            .expect("export should satisfy the one-song import contract");

        assert_eq!(result.file_name, "Simple Song.txt");
        assert_eq!(exported_song["name"], "Simple Song");
        assert!(exported_song.get("formatVersion").is_none());
        assert!(exported_song["songNotes"][0].get("duration").is_none());
    }

    #[test]
    fn export_uses_collision_suffixes_without_overwriting_any_existing_object() {
        let root = unique_test_dir("export_collisions");
        let imported_directory = root.path.join("imported");
        let exported_directory = root.path.join("exported");
        let song_id = "local-export-collision";
        save_imported_score_song_at(&imported_directory, song_id, &sample_song("Collision"))
            .expect("managed score should be saved");
        fs::create_dir_all(&exported_directory).unwrap();
        fs::write(exported_directory.join("Collision.txt"), "keep me").unwrap();
        fs::create_dir(exported_directory.join("Collision (2).txt")).unwrap();

        let first =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("first export should skip collisions");
        let second =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("second export should use the next suffix");

        assert_eq!(first.file_name, "Collision (3).txt");
        assert_eq!(second.file_name, "Collision (4).txt");
        assert_eq!(
            fs::read_to_string(exported_directory.join("Collision.txt")).unwrap(),
            "keep me"
        );
        assert!(exported_directory.join("Collision (2).txt").is_dir());
    }

    #[test]
    fn repeated_exports_use_second_and_third_suffixes_without_overwrite() {
        let root = unique_test_dir("export_repeated_suffixes");
        let imported_directory = root.path.join("imported");
        let exported_directory = root.path.join("exported");
        let song_id = "local-export-repeated";
        save_imported_score_song_at(&imported_directory, song_id, &sample_song("Repeated"))
            .expect("managed score should be saved");

        let first =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("first export should succeed");
        let first_content = fs::read(&first.path).expect("first export should be readable");
        let second =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("second export should succeed");
        let third =
            export_imported_score_song_at(&imported_directory, &exported_directory, song_id)
                .expect("third export should succeed");

        assert_eq!(first.file_name, "Repeated.txt");
        assert_eq!(second.file_name, "Repeated (2).txt");
        assert_eq!(third.file_name, "Repeated (3).txt");
        assert_eq!(fs::read(&first.path).unwrap(), first_content);
    }

    #[test]
    fn export_rejects_missing_or_malformed_managed_sources() {
        let root = unique_test_dir("export_invalid_sources");
        let imported_directory = root.path.join("imported");
        let exported_directory = root.path.join("exported");

        let missing_error = export_imported_score_song_at(
            &imported_directory,
            &exported_directory,
            "local-missing",
        )
        .expect_err("missing managed source must fail");
        assert!(missing_error.contains("No imported score file found"));
        assert!(!exported_directory.exists());

        write_raw_file(&imported_directory, "Broken__local-broken.txt", "not json");
        let malformed_error =
            export_imported_score_song_at(&imported_directory, &exported_directory, "local-broken")
                .expect_err("malformed managed source must fail");
        assert!(malformed_error.contains("No valid imported score file found"));
        assert!(!exported_directory.exists());
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
    fn managed_song_validation_rejects_invalid_note_duration() {
        let test_dir = unique_test_dir("validate_note_duration");
        let file_path = test_dir.path.join("Broken__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Broken__local-1.json",
            r#"[{"name":"Broken","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"songNotes":[{"time":0,"key":"1Key0","duration":-5}]}]"#,
        );

        let error = read_one_song_from_file(&file_path).unwrap_err();

        assert!(error.contains("songNotes[0].duration must be a positive number"));
    }

    #[test]
    fn managed_song_validation_accepts_v2_duration() {
        let test_dir = unique_test_dir("validate_v2_duration");
        let file_path = test_dir.path.join("Valid__local-1.json");

        write_raw_file(
            &test_dir.path,
            "Valid__local-1.json",
            r#"[{"name":"Valid","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"formatVersion":2,"songNotes":[{"time":0,"key":"1Key0","duration":1500}]}]"#,
        );

        let song = read_one_song_from_file(&file_path).unwrap();

        assert_eq!(song["songNotes"][0]["duration"], serde_json::json!(1500));
    }

    #[test]
    fn managed_song_duration_limit_is_inclusive() {
        let test_dir = unique_test_dir("duration_limit");
        let valid_path = test_dir.path.join("Valid__local-1.json");
        let invalid_path = test_dir.path.join("Invalid__local-2.json");

        write_raw_file(
            &test_dir.path,
            "Valid__local-1.json",
            r#"[{"name":"Valid","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"formatVersion":2,"songNotes":[{"time":0,"key":"1Key0","duration":60000}]}]"#,
        );
        write_raw_file(
            &test_dir.path,
            "Invalid__local-2.json",
            r#"[{"name":"Invalid","bpm":120,"bitsPerPage":16,"pitchLevel":0,"isComposed":false,"formatVersion":2,"songNotes":[{"time":0,"key":"1Key0","duration":60001}]}]"#,
        );

        assert!(read_one_song_from_file(&valid_path).is_ok());
        assert!(read_one_song_from_file(&invalid_path).is_err());
    }

    #[test]
    fn managed_v2_storage_round_trip_preserves_marker_and_duration() {
        let test_dir = unique_test_dir("v2_round_trip");
        let song = serde_json::json!({
            "name": "Round Trip",
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "formatVersion": 2,
            "songNotes": [{"time": 0, "key": "1Key0", "duration": 1500}]
        });

        save_imported_score_song_at(&test_dir.path, "local-1", &song).unwrap();
        let restored = read_imported_score_song_at(&test_dir.path, "local-1").unwrap();

        assert_eq!(restored["formatVersion"], serde_json::json!(2));
        assert_eq!(
            restored["songNotes"][0]["duration"],
            serde_json::json!(1500)
        );
    }

    #[test]
    fn migration_upgrades_old_duration_file_without_marker() {
        let test_dir = unique_test_dir("upgrade_old_v2");
        let old_song = unversioned_duration_song("Old V2");
        write_score_file(&test_dir.path, "Old V2__local-1.txt", &old_song);

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();
        let restored = read_imported_score_song_at(&test_dir.path, "local-1").unwrap();

        assert!(report.failed.is_empty());
        assert_eq!(restored["formatVersion"], serde_json::json!(2));
        assert_eq!(
            restored["songNotes"][0]["duration"],
            serde_json::json!(1500)
        );
        assert_eq!(
            read_raw_one_song_from_file(&test_dir.path.join("Old V2__local-1.txt")).unwrap()
                ["formatVersion"],
            serde_json::json!(2)
        );
    }

    #[test]
    fn direct_save_upgrades_existing_final_txt_content() {
        let test_dir = unique_test_dir("save_upgrade_final");
        let song = unversioned_duration_song("Existing V2");
        let final_path = test_dir.path.join("Existing V2__local-1.txt");
        write_score_file(&test_dir.path, "Existing V2__local-1.txt", &song);

        save_imported_score_song_at(&test_dir.path, "local-1", &song).unwrap();

        let raw = read_raw_one_song_from_file(&final_path).unwrap();
        assert_eq!(raw["formatVersion"], serde_json::json!(2));
        assert_eq!(raw["songNotes"][0]["duration"], serde_json::json!(1500));
    }

    #[test]
    fn migration_renames_legacy_file_and_rewrites_v2_marker() {
        let test_dir = unique_test_dir("upgrade_legacy_rename");
        let song = unversioned_duration_song("Legacy V2");
        write_score_file(&test_dir.path, "local-1.json", &song);

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();
        let final_path = test_dir.path.join("Legacy V2__local-1.txt");
        let raw = read_raw_one_song_from_file(&final_path).unwrap();

        assert_eq!(report.renamed_count, 1);
        assert!(!test_dir.path.join("local-1.json").exists());
        assert_eq!(raw["formatVersion"], serde_json::json!(2));
    }

    #[test]
    fn migration_renames_outdated_canonical_and_rewrites_v2_marker() {
        let test_dir = unique_test_dir("upgrade_outdated_rename");
        let song = unversioned_duration_song("Current V2");
        write_score_file(&test_dir.path, "Old V2__local-1.json", &song);

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();
        let final_path = test_dir.path.join("Current V2__local-1.txt");
        let raw = read_raw_one_song_from_file(&final_path).unwrap();

        assert_eq!(report.renamed_count, 1);
        assert!(!test_dir.path.join("Old V2__local-1.json").exists());
        assert_eq!(raw["formatVersion"], serde_json::json!(2));
    }

    #[test]
    fn explicit_v1_duration_is_removed_from_managed_read_and_storage() {
        let test_dir = unique_test_dir("normalize_explicit_v1");
        let song = serde_json::json!({
            "name": "Explicit V1",
            "bpm": 120,
            "bitsPerPage": 16,
            "pitchLevel": 0,
            "isComposed": false,
            "formatVersion": 1,
            "songNotes": [{"time": 0, "key": "1Key0", "duration": 1500}]
        });
        write_score_file(&test_dir.path, "Explicit V1__local-1.txt", &song);

        let read_song = read_imported_score_song_at(&test_dir.path, "local-1").unwrap();
        assert!(read_song["songNotes"][0].get("duration").is_none());

        save_imported_score_song_at(&test_dir.path, "local-1", &song).unwrap();
        let raw =
            read_raw_one_song_from_file(&test_dir.path.join("Explicit V1__local-1.txt")).unwrap();
        assert_eq!(raw["formatVersion"], serde_json::json!(1));
        assert!(raw["songNotes"][0].get("duration").is_none());
    }

    #[test]
    fn migration_does_not_convert_ordinary_v1_file() {
        let test_dir = unique_test_dir("keep_v1");
        let song = sample_song("V1");
        write_score_file(&test_dir.path, "V1__local-1.txt", &song);

        let report =
            migrate_imported_score_storage_at(&test_dir.path, vec!["local-1".to_string()]).unwrap();
        let restored = read_imported_score_song_at(&test_dir.path, "local-1").unwrap();

        assert!(report.failed.is_empty());
        assert!(restored.get("formatVersion").is_none());
        assert!(
            read_raw_one_song_from_file(&test_dir.path.join("V1__local-1.txt"))
                .unwrap()
                .get("formatVersion")
                .is_none()
        );
    }

    #[test]
    fn semantic_comparison_detects_duration_changes() {
        let with_duration = serde_json::json!({
            "name": "Song",
            "bpm": 120.0,
            "bitsPerPage": 16.0,
            "pitchLevel": 0.0,
            "isComposed": false,
            "songNotes": [{ "time": 0.0, "key": "1Key0", "duration": 1500.0 }]
        });
        let without_duration = serde_json::json!({
            "name": "Song",
            "bpm": 120.0,
            "bitsPerPage": 16.0,
            "pitchLevel": 0.0,
            "isComposed": false,
            "songNotes": [{ "time": 0.0, "key": "1Key0" }]
        });

        assert_ne!(
            semantic_song_from_value(&with_duration).unwrap(),
            semantic_song_from_value(&without_duration).unwrap()
        );
    }

    #[test]
    fn explicit_v1_semantics_ignore_duration_fields() {
        let with_duration = serde_json::json!({
            "name": "V1",
            "bpm": 120.0,
            "bitsPerPage": 16.0,
            "pitchLevel": 0.0,
            "isComposed": false,
            "formatVersion": 1,
            "songNotes": [{ "time": 0.0, "key": "1Key0", "duration": 1500.0 }]
        });
        let without_duration = serde_json::json!({
            "name": "V1",
            "bpm": 120.0,
            "bitsPerPage": 16.0,
            "pitchLevel": 0.0,
            "isComposed": false,
            "formatVersion": 1,
            "songNotes": [{ "time": 0.0, "key": "1Key0" }]
        });

        assert_eq!(
            semantic_song_from_value(&with_duration).unwrap(),
            semantic_song_from_value(&without_duration).unwrap()
        );
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
    fn post_rename_canonical_rewrite_failure_restores_original_source() {
        let test_dir = unique_test_dir("post_rename_rewrite_rollback");
        let source = test_dir.path.join("local-1.json");
        let target = test_dir.path.join("Rollback V2__local-1.txt");
        let temp_collision = test_dir.path.join("Rollback V2__local-1.txt.tmp");
        let song = unversioned_duration_song("Rollback V2");
        write_score_file(&test_dir.path, "local-1.json", &song);
        fs::create_dir_all(&temp_collision).unwrap();

        let error = rename_and_validate_managed_score_file(&source, &target, |target_path| {
            ensure_canonical_managed_song_content(target_path, "local-1", &song)?;
            managed_score_file_from_path(
                target_path.to_path_buf(),
                "local-1".to_string(),
                ManagedScoreFileNaming::Canonical,
                ManagedScoreFileExtension::Txt,
            )
        })
        .err()
        .unwrap();

        assert!(error.contains("original source was restored"));
        assert!(source.is_file());
        assert!(!target.exists());
        assert!(temp_collision.is_dir());
        assert!(read_raw_one_song_from_file(&source).unwrap()["formatVersion"].is_null());
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

    #[test]
    fn recovery_scanner_recognizes_managed_names_and_prefers_canonical_file() {
        let test_dir = unique_test_dir("recovery_scanner_names");
        let song = sample_song("Canonical");
        write_score_file(&test_dir.path, "Canonical__local-1.txt", &song);
        write_score_file(&test_dir.path, "local-1.json", &song);
        fs::write(test_dir.path.join("notes.txt"), "ignore").unwrap();

        let listed = list_imported_score_files_at(&test_dir.path).unwrap();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "local-1");
        assert_eq!(listed[0].file_name, "Canonical__local-1.txt");
        assert_eq!(
            read_imported_score_song_at(&test_dir.path, "local-1").unwrap(),
            song
        );
    }

    #[test]
    fn recovery_scanner_reports_recognized_corrupt_file_for_isolated_read_failure() {
        let test_dir = unique_test_dir("recovery_scanner_corrupt");
        fs::create_dir_all(&test_dir.path).unwrap();
        fs::write(test_dir.path.join("Broken__local-bad.txt"), "not json").unwrap();

        let listed = list_imported_score_files_at(&test_dir.path).unwrap();
        let error = read_imported_score_song_at(&test_dir.path, "local-bad").unwrap_err();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "local-bad");
        assert!(error.contains("No valid imported score file found"));
        assert!(error.contains("Broken__local-bad.txt"));
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

    // ---- 镜像清单：只清理程序自己管理的内容 ----

    fn sample_entry(folder: &str, song_id: &str, title: &str) -> ArchiveScoreEntry {
        ArchiveScoreEntry {
            folder: folder.to_string(),
            song: sample_song(title),
            song_id: song_id.to_string(),
            title: title.to_string(),
        }
    }

    #[test]
    fn mirror_cleanup_keeps_user_created_files_and_directories() {
        let test_dir = unique_test_dir("mirror_keeps_user_content");
        let root = test_dir.path.join("archive-root");
        fs::create_dir_all(&root).unwrap();

        // 用户自己建的目录与文件
        let user_dir = root.join("我的收藏");
        fs::create_dir_all(&user_dir).unwrap();
        let user_file = user_dir.join("note.txt");
        fs::write(&user_file, "user content").unwrap();
        let loose_user_file = root.join("readme.md");
        fs::write(&loose_user_file, "user content").unwrap();

        // 第一轮：写入程序自己的内容并登记清单
        let entry = sample_entry("歌单A", "local-1", "曲谱一");
        let path = write_archive_score_file_overwrite(&root, &entry).unwrap();
        let relative = path.strip_prefix(&root).unwrap().to_str().unwrap().replace('\\', "/");

        let manifest = MirrorManifest {
            version: MIRROR_MANIFEST_VERSION,
            files: vec![relative],
            directories: vec!["歌单A".to_string()],
            file_song_ids: vec!["local-1".to_string()],
        };
        write_mirror_manifest(&root, &manifest).unwrap();

        assert!(root.join("歌单A").exists());

        // 第二轮：按清单清理
        let previous_manifest = read_mirror_manifest(&root);
        let failures = cleanup_manifest_entries(&root, &previous_manifest);
        assert!(failures.is_empty(), "清理不应失败: {:?}", failures);

        assert!(!root.join("歌单A").exists(), "程序自己的旧目录应被清理");
        assert!(user_dir.exists(), "用户目录必须保留");
        assert!(user_file.exists(), "用户文件必须保留");
        assert!(loose_user_file.exists(), "用户的散落文件必须保留");
    }

    #[test]
    fn mirror_manifest_is_written_and_read_back() {
        let test_dir = unique_test_dir("manifest_roundtrip");
        let root = test_dir.path.join("archive-root");
        fs::create_dir_all(&root).unwrap();

        let manifest = MirrorManifest {
            version: MIRROR_MANIFEST_VERSION,
            files: vec!["歌单A/曲谱一__local-1-abcd1234.txt".to_string()],
            directories: vec!["歌单A".to_string()],
            file_song_ids: vec!["local-1".to_string()],
        };
        write_mirror_manifest(&root, &manifest).unwrap();

        let read_back = read_mirror_manifest(&root);
        assert_eq!(read_back.files, manifest.files);
        assert_eq!(read_back.directories, manifest.directories);
        assert_eq!(read_back.version, MIRROR_MANIFEST_VERSION);
    }

    #[test]
    fn missing_or_corrupt_manifest_yields_empty_manifest() {
        let test_dir = unique_test_dir("manifest_missing");
        let root = test_dir.path.join("archive-root");
        fs::create_dir_all(&root).unwrap();

        // 清单缺失 → 空清单（不会清理任何东西）
        let missing = read_mirror_manifest(&root);
        assert!(missing.files.is_empty());
        assert!(missing.directories.is_empty());

        // 清单损坏 → 空清单（不会清理任何东西）
        fs::write(root.join(MIRROR_MANIFEST_FILE_NAME), "{ not json").unwrap();
        let corrupt = read_mirror_manifest(&root);
        assert!(corrupt.files.is_empty());
        assert!(corrupt.directories.is_empty());
    }

    #[test]
    fn manifest_paths_cannot_escape_the_root() {
        let test_dir = unique_test_dir("manifest_escape");
        let root = test_dir.path.join("archive-root");
        fs::create_dir_all(&root).unwrap();

        assert!(resolve_manifest_path(&root, "../outside.txt").is_none());
        assert!(resolve_manifest_path(&root, "a/../../outside.txt").is_none());
        assert!(resolve_manifest_path(&root, "").is_none());
        assert!(resolve_manifest_path(&root, ".").is_none());
        assert!(resolve_manifest_path(&root, "歌单A/曲谱.txt").is_some());
    }

    #[test]
    fn same_title_songs_get_distinct_file_names() {
        let test_dir = unique_test_dir("mirror_same_title");
        let root = test_dir.path.join("archive-root");
        fs::create_dir_all(&root).unwrap();

        let first = write_archive_score_file_overwrite(
            &root,
            &sample_entry("歌单A", "local-1", "同名曲谱"),
        )
        .unwrap();
        let second = write_archive_score_file_overwrite(
            &root,
            &sample_entry("歌单A", "local-2", "同名曲谱"),
        )
        .unwrap();

        // 同名但不同 ID → 不同路径，互不覆盖
        assert_ne!(first, second);
        assert!(first.exists());
        assert!(second.exists());

        // 同一 ID 重复写入 → 同一路径（稳定，可覆盖）
        let again = write_archive_score_file_overwrite(
            &root,
            &sample_entry("歌单A", "local-1", "同名曲谱"),
        )
        .unwrap();
        assert_eq!(first, again);
    }

    #[test]
    fn stable_song_id_suffix_is_deterministic_and_distinct() {
        let first = stable_song_id_suffix("local-1");
        let second = stable_song_id_suffix("local-2");

        assert_eq!(first, stable_song_id_suffix("local-1"));
        assert_ne!(first, second);
        assert!(first
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-'));
    }
}
