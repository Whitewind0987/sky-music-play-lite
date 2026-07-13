use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WindowEvent};

const FILE_NAME: &str = "sky_music_play_lite_window_state_v1.json";
const TEMP_FILE_NAME: &str = "sky_music_play_lite_window_state_v1.json.tmp";
const BACKUP_FILE_NAME: &str = "sky_music_play_lite_window_state_v1.json.bak";
const SCHEMA_VERSION: u32 = 1;
const MAIN_WINDOW_LABEL: &str = "main";
const DEFAULT_WIDTH_LOGICAL: f64 = 1100.0;
const DEFAULT_HEIGHT_LOGICAL: f64 = 720.0;
const MIN_WIDTH_LOGICAL: f64 = 480.0;
const MIN_HEIGHT_LOGICAL: f64 = 320.0;
const MAX_LOGICAL_DIMENSION: f64 = 32768.0;
const MIN_VISIBLE_WIDTH_LOGICAL: f64 = 160.0;
const MIN_VISIBLE_HEIGHT_LOGICAL: f64 = 80.0;
const MIN_VISIBLE_AREA_RATIO: f64 = 0.20;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct NormalWindowState {
    monitor_name: Option<String>,
    offset_x_logical: f64,
    offset_y_logical: f64,
    inner_width_logical: f64,
    inner_height_logical: f64,
    outer_width_logical: f64,
    outer_height_logical: f64,
    saved_scale_factor: f64,
    saved_work_area_x_physical: i32,
    saved_work_area_y_physical: i32,
    saved_work_area_width_physical: u32,
    saved_work_area_height_physical: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PersistedWindowState {
    normal: NormalWindowState,
    maximized: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WindowStateFile {
    schema_version: u32,
    windows: BTreeMap<String, PersistedWindowState>,
}

#[derive(Clone, Debug, PartialEq)]
struct RuntimeWindowState {
    normal: Option<NormalWindowState>,
    maximized: bool,
    initialized: bool,
}

pub struct WindowStateManager {
    state: Mutex<RuntimeWindowState>,
}

#[derive(Clone, Debug, PartialEq)]
struct MonitorGeometry {
    name: Option<String>,
    scale_factor: f64,
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    primary: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct PhysicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct RestoredGeometry {
    x: i32,
    y: i32,
    inner_width: u32,
    inner_height: u32,
    outer_width: u32,
    outer_height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum StableWindowMode {
    Normal,
    Maximized,
    Minimized,
}

impl WindowStateManager {
    fn new() -> Self {
        Self {
            state: Mutex::new(RuntimeWindowState {
                normal: None,
                maximized: false,
                initialized: false,
            }),
        }
    }

    fn snapshot(&self) -> Result<RuntimeWindowState, String> {
        self.state
            .lock()
            .map(|state| state.clone())
            .map_err(|_| "Window state cache lock is poisoned".to_string())
    }

    fn apply_capture(
        &self,
        mode: StableWindowMode,
        normal: Option<NormalWindowState>,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Window state cache lock is poisoned".to_string())?;
        apply_runtime_transition(&mut state, mode, normal);
        state.initialized = true;
        Ok(())
    }

    fn initialize_cache(
        &self,
        normal: Option<NormalWindowState>,
        maximized: bool,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Window state cache lock is poisoned".to_string())?;
        state.normal = normal;
        state.maximized = maximized;
        state.initialized = true;
        Ok(())
    }
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main window is unavailable during window-state setup".to_string())?;
    app.manage(WindowStateManager::new());

    let restore_result = restore_main_window(app, &window);
    if let Err(error) = &restore_result {
        log_window_state(
            app,
            "warn",
            "Window state restore failed; using defaults",
            json!({ "error": error }),
        );
        let _ = window.set_size(tauri::LogicalSize::new(
            DEFAULT_WIDTH_LOGICAL,
            DEFAULT_HEIGHT_LOGICAL,
        ));
        let _ = window.center();
    }

    window
        .show()
        .map_err(|error| format!("Failed to show main window: {error}"))?;

    if restore_result.is_err() {
        if let Err(error) = capture_window_into_cache(app, &window) {
            log_window_state(
                app,
                "warn",
                "Default window state capture failed after restore fallback",
                json!({ "error": error }),
            );
        }
    }

    if restore_result.is_ok() {
        log_window_state(app, "info", "Window state restoration completed", json!({}));
    }

    let app_handle = app.clone();
    let window_for_events = window.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            if let Err(error) = capture_window_into_cache(&app_handle, &window_for_events) {
                log_window_state(
                    &app_handle,
                    "warn",
                    "Window state runtime capture failed",
                    json!({ "error": error }),
                );
            }
        }
    });

    Ok(())
}

pub fn save_before_exit(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main window is unavailable during shutdown".to_string())?;
    capture_window_into_cache(app, &window)?;
    let manager = app.state::<WindowStateManager>();
    let snapshot = manager.snapshot()?;
    let normal = snapshot
        .normal
        .ok_or_else(|| "No valid normal window bounds are available".to_string())?;
    validate_normal_state(&normal)?;

    let path = state_file_path(app)?;
    merge_and_write_state(
        &path,
        PersistedWindowState {
            normal,
            maximized: snapshot.maximized,
        },
    )
}

fn restore_main_window(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    let persisted = load_state_file(app)?;
    let main_state = persisted.and_then(|file| file.windows.get(MAIN_WINDOW_LABEL).cloned());
    let monitors = monitor_geometries(window)?;
    let manager = app.state::<WindowStateManager>();

    if let Some(state) = main_state {
        validate_normal_state(&state.normal)?;
        if state.normal.monitor_name.is_some()
            && !monitors
                .iter()
                .any(|monitor| monitor.name == state.normal.monitor_name)
        {
            log_window_state(
                app,
                "warn",
                "Saved monitor is unavailable; selecting a safe fallback monitor",
                json!({ "savedMonitorName": state.normal.monitor_name.clone() }),
            );
        }
        if let Some(geometry) = restore_geometry(&state.normal, &monitors) {
            let selected_monitor = select_monitor(&state.normal, &monitors)
                .ok_or_else(|| "No monitor is available for restored geometry".to_string())?;
            window
                .set_size(PhysicalSize::new(
                    geometry.inner_width,
                    geometry.inner_height,
                ))
                .map_err(|error| format!("Failed to restore main window size: {error}"))?;
            let actual_outer = window.outer_size().ok();
            let corrected_position = if let Some(actual_outer) = actual_outer {
                let corrected = ensure_meaningful_visibility(
                    PhysicalRect {
                        x: geometry.x as f64,
                        y: geometry.y as f64,
                        width: actual_outer.width as f64,
                        height: actual_outer.height as f64,
                    },
                    &monitors,
                    selected_monitor,
                );
                (corrected.x.round() as i32, corrected.y.round() as i32)
            } else {
                (geometry.x, geometry.y)
            };
            window
                .set_position(PhysicalPosition::new(
                    corrected_position.0,
                    corrected_position.1,
                ))
                .map_err(|error| format!("Failed to restore main window position: {error}"))?;
            let normalized = capture_normal_state(window).or_else(|_| {
                normalize_applied_geometry(
                    geometry,
                    corrected_position,
                    actual_outer.map(|size| (size.width, size.height)),
                    selected_monitor,
                )
            })?;
            manager.initialize_cache(Some(normalized), state.maximized)?;
            if state.maximized {
                window
                    .maximize()
                    .map_err(|error| format!("Failed to restore maximized state: {error}"))?;
            }
            return Ok(());
        }
        log_window_state(
            app,
            "warn",
            "Saved monitor unavailable; using configured default placement",
            json!({}),
        );
    }

    manager.initialize_cache(None, false)?;
    capture_window_into_cache(app, window)
}

fn load_state_file(app: &AppHandle) -> Result<Option<WindowStateFile>, String> {
    let path = state_file_path(app)?;
    load_state_file_at(&path)
}

fn load_state_file_at(path: &Path) -> Result<Option<WindowStateFile>, String> {
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read window state at {}: {error}",
                path.display()
            ))
        }
    };
    parse_state_content(&content).map(Some)
}

fn merge_and_write_state(path: &Path, main_state: PersistedWindowState) -> Result<(), String> {
    let mut windows = load_state_file_at(path)?
        .map(|file| file.windows)
        .unwrap_or_default();
    windows.insert(MAIN_WINDOW_LABEL.to_string(), main_state);
    let content = serde_json::to_vec_pretty(&WindowStateFile {
        schema_version: SCHEMA_VERSION,
        windows,
    })
    .map_err(|error| format!("Failed to serialize window state: {error}"))?;
    write_state_file_atomically(path, &content)
}

fn parse_state_content(content: &str) -> Result<WindowStateFile, String> {
    let file: WindowStateFile = serde_json::from_str(content)
        .map_err(|error| format!("Window state JSON is invalid: {error}"))?;
    if file.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported window state schema version {}",
            file.schema_version
        ));
    }
    Ok(file)
}

fn capture_window_into_cache(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    let minimized = window.is_minimized().map_err(|error| error.to_string())?;
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let mode = if minimized {
        StableWindowMode::Minimized
    } else if maximized {
        StableWindowMode::Maximized
    } else {
        StableWindowMode::Normal
    };
    let normal = if mode == StableWindowMode::Normal {
        Some(capture_normal_state(window)?)
    } else {
        None
    };
    app.state::<WindowStateManager>()
        .apply_capture(mode, normal)
}

fn capture_normal_state(window: &tauri::WebviewWindow) -> Result<NormalWindowState, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let inner = window.inner_size().map_err(|error| error.to_string())?;
    let outer = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Cannot identify the current monitor".to_string())?;
    let work = monitor.work_area();
    let scale = monitor.scale_factor();
    if !scale.is_finite() || scale <= 0.0 {
        return Err("Current monitor scale factor is invalid".to_string());
    }
    let normal = NormalWindowState {
        monitor_name: monitor.name().cloned(),
        offset_x_logical: (position.x - work.position.x) as f64 / scale,
        offset_y_logical: (position.y - work.position.y) as f64 / scale,
        inner_width_logical: inner.width as f64 / scale,
        inner_height_logical: inner.height as f64 / scale,
        outer_width_logical: outer.width as f64 / scale,
        outer_height_logical: outer.height as f64 / scale,
        saved_scale_factor: scale,
        saved_work_area_x_physical: work.position.x,
        saved_work_area_y_physical: work.position.y,
        saved_work_area_width_physical: work.size.width,
        saved_work_area_height_physical: work.size.height,
    };
    validate_normal_state(&normal)?;
    Ok(normal)
}

fn apply_runtime_transition(
    state: &mut RuntimeWindowState,
    mode: StableWindowMode,
    normal: Option<NormalWindowState>,
) {
    match mode {
        StableWindowMode::Minimized => {}
        StableWindowMode::Maximized => state.maximized = true,
        StableWindowMode::Normal => {
            state.maximized = false;
            if let Some(normal) = normal {
                state.normal = Some(normal);
            }
        }
    }
}

fn validate_normal_state(state: &NormalWindowState) -> Result<(), String> {
    for (name, value) in [
        ("offsetXLogical", state.offset_x_logical),
        ("offsetYLogical", state.offset_y_logical),
        ("innerWidthLogical", state.inner_width_logical),
        ("innerHeightLogical", state.inner_height_logical),
        ("outerWidthLogical", state.outer_width_logical),
        ("outerHeightLogical", state.outer_height_logical),
        ("savedScaleFactor", state.saved_scale_factor),
    ] {
        if !value.is_finite() {
            return Err(format!("Window state field {name} must be finite"));
        }
    }
    for (name, value) in [
        ("innerWidthLogical", state.inner_width_logical),
        ("innerHeightLogical", state.inner_height_logical),
        ("outerWidthLogical", state.outer_width_logical),
        ("outerHeightLogical", state.outer_height_logical),
    ] {
        if value <= 0.0 || value > MAX_LOGICAL_DIMENSION {
            return Err(format!(
                "Window state field {name} is outside the supported range"
            ));
        }
    }
    if state.saved_scale_factor <= 0.0
        || state.saved_work_area_width_physical == 0
        || state.saved_work_area_height_physical == 0
    {
        return Err("Saved monitor geometry is invalid".to_string());
    }
    Ok(())
}

fn restore_geometry(
    saved: &NormalWindowState,
    monitors: &[MonitorGeometry],
) -> Option<RestoredGeometry> {
    let monitor = select_monitor(saved, monitors)?;
    let scale = monitor.scale_factor;
    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    let max_inner_width = monitor.work_width as f64;
    let max_inner_height = monitor.work_height as f64;
    let min_width = (MIN_WIDTH_LOGICAL * scale).min(max_inner_width);
    let min_height = (MIN_HEIGHT_LOGICAL * scale).min(max_inner_height);
    let inner_width =
        (saved.inner_width_logical * scale).clamp(min_width.max(1.0), max_inner_width.max(1.0));
    let inner_height =
        (saved.inner_height_logical * scale).clamp(min_height.max(1.0), max_inner_height.max(1.0));
    let decoration_width =
        ((saved.outer_width_logical - saved.inner_width_logical).max(0.0) * scale).min(256.0);
    let decoration_height =
        ((saved.outer_height_logical - saved.inner_height_logical).max(0.0) * scale).min(256.0);
    let outer_width = (inner_width + decoration_width).min(monitor.work_width as f64);
    let outer_height = (inner_height + decoration_height).min(monitor.work_height as f64);
    let proposed = PhysicalRect {
        x: monitor.work_x as f64 + saved.offset_x_logical * scale,
        y: monitor.work_y as f64 + saved.offset_y_logical * scale,
        width: outer_width,
        height: outer_height,
    };
    let safe = ensure_meaningful_visibility(proposed, monitors, monitor);
    Some(RestoredGeometry {
        x: safe.x.round() as i32,
        y: safe.y.round() as i32,
        inner_width: inner_width.round().max(1.0) as u32,
        inner_height: inner_height.round().max(1.0) as u32,
        outer_width: outer_width.round().max(1.0) as u32,
        outer_height: outer_height.round().max(1.0) as u32,
    })
}

fn normalize_applied_geometry(
    geometry: RestoredGeometry,
    position: (i32, i32),
    actual_outer_size: Option<(u32, u32)>,
    monitor: &MonitorGeometry,
) -> Result<NormalWindowState, String> {
    let scale = monitor.scale_factor;
    if !scale.is_finite() || scale <= 0.0 {
        return Err("Selected monitor scale factor is invalid".to_string());
    }
    let (outer_width, outer_height) =
        actual_outer_size.unwrap_or((geometry.outer_width, geometry.outer_height));
    let normalized = NormalWindowState {
        monitor_name: monitor.name.clone(),
        offset_x_logical: (position.0 - monitor.work_x) as f64 / scale,
        offset_y_logical: (position.1 - monitor.work_y) as f64 / scale,
        inner_width_logical: geometry.inner_width as f64 / scale,
        inner_height_logical: geometry.inner_height as f64 / scale,
        outer_width_logical: outer_width as f64 / scale,
        outer_height_logical: outer_height as f64 / scale,
        saved_scale_factor: scale,
        saved_work_area_x_physical: monitor.work_x,
        saved_work_area_y_physical: monitor.work_y,
        saved_work_area_width_physical: monitor.work_width,
        saved_work_area_height_physical: monitor.work_height,
    };
    validate_normal_state(&normalized)?;
    Ok(normalized)
}

fn select_monitor<'a>(
    saved: &NormalWindowState,
    monitors: &'a [MonitorGeometry],
) -> Option<&'a MonitorGeometry> {
    if let Some(name) = &saved.monitor_name {
        if let Some(exact) = monitors
            .iter()
            .find(|monitor| monitor.name.as_ref() == Some(name))
        {
            return Some(exact);
        }
    }
    let saved_center_x =
        saved.saved_work_area_x_physical as f64 + saved.saved_work_area_width_physical as f64 / 2.0;
    let saved_center_y = saved.saved_work_area_y_physical as f64
        + saved.saved_work_area_height_physical as f64 / 2.0;
    monitors
        .iter()
        .min_by(|left, right| {
            monitor_center_distance(left, saved_center_x, saved_center_y).total_cmp(
                &monitor_center_distance(right, saved_center_x, saved_center_y),
            )
        })
        .or_else(|| monitors.iter().find(|monitor| monitor.primary))
        .or_else(|| monitors.first())
}

fn monitor_center_distance(monitor: &MonitorGeometry, x: f64, y: f64) -> f64 {
    let center_x = monitor.work_x as f64 + monitor.work_width as f64 / 2.0;
    let center_y = monitor.work_y as f64 + monitor.work_height as f64 / 2.0;
    (center_x - x).powi(2) + (center_y - y).powi(2)
}

fn ensure_meaningful_visibility(
    proposed: PhysicalRect,
    monitors: &[MonitorGeometry],
    selected: &MonitorGeometry,
) -> PhysicalRect {
    let meaningful = monitors.iter().any(|monitor| {
        let work = monitor_rect(monitor);
        let intersection = intersection_rect(proposed, work);
        let ratio = intersection.map_or(0.0, |rect| {
            rect.width * rect.height / (proposed.width * proposed.height).max(1.0)
        });
        let usable = intersection.is_some_and(|rect| {
            rect.width >= MIN_VISIBLE_WIDTH_LOGICAL * monitor.scale_factor
                && rect.height >= MIN_VISIBLE_HEIGHT_LOGICAL * monitor.scale_factor
        });
        ratio >= MIN_VISIBLE_AREA_RATIO || usable
    });
    if meaningful {
        return proposed;
    }
    PhysicalRect {
        x: selected.work_x as f64 + (selected.work_width as f64 - proposed.width) / 2.0,
        y: selected.work_y as f64 + (selected.work_height as f64 - proposed.height) / 2.0,
        ..proposed
    }
}

fn intersection_rect(left: PhysicalRect, right: PhysicalRect) -> Option<PhysicalRect> {
    let x = left.x.max(right.x);
    let y = left.y.max(right.y);
    let right_edge = (left.x + left.width).min(right.x + right.width);
    let bottom_edge = (left.y + left.height).min(right.y + right.height);
    (right_edge > x && bottom_edge > y).then_some(PhysicalRect {
        x,
        y,
        width: right_edge - x,
        height: bottom_edge - y,
    })
}

fn monitor_rect(monitor: &MonitorGeometry) -> PhysicalRect {
    PhysicalRect {
        x: monitor.work_x as f64,
        y: monitor.work_y as f64,
        width: monitor.work_width as f64,
        height: monitor.work_height as f64,
    }
}

fn monitor_geometries(window: &tauri::WebviewWindow) -> Result<Vec<MonitorGeometry>, String> {
    let primary = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let primary_name = primary.as_ref().and_then(|monitor| monitor.name().cloned());
    window
        .available_monitors()
        .map_err(|error| format!("Failed to enumerate monitors: {error}"))?
        .iter()
        .map(|monitor| monitor_geometry(monitor, primary_name.as_ref()))
        .collect()
}

fn monitor_geometry(
    monitor: &Monitor,
    primary_name: Option<&String>,
) -> Result<MonitorGeometry, String> {
    let work = monitor.work_area();
    Ok(MonitorGeometry {
        name: monitor.name().cloned(),
        scale_factor: monitor.scale_factor(),
        work_x: work.position.x,
        work_y: work.position.y,
        work_width: work.size.width,
        work_height: work.size.height,
        primary: primary_name.is_some() && monitor.name() == primary_name,
    })
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(FILE_NAME))
        .map_err(|error| format!("Failed to resolve app config directory: {error}"))
}

fn write_state_file_atomically(path: &Path, content: &[u8]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Window state path has no parent".to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temp = directory.join(TEMP_FILE_NAME);
    let backup = directory.join(BACKUP_FILE_NAME);
    remove_regular_file_if_exists(&temp)?;
    {
        let mut file = File::create(&temp).map_err(|error| error.to_string())?;
        file.write_all(content).map_err(|error| error.to_string())?;
        file.flush().map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    if let Err(error) = reject_non_regular_target(path) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    replace_synced_temp(path, &temp, &backup, |source, target| {
        fs::rename(source, target)
    })
}

fn replace_synced_temp<F>(
    final_path: &Path,
    temp_path: &Path,
    backup_path: &Path,
    mut rename: F,
) -> Result<(), String>
where
    F: FnMut(&Path, &Path) -> std::io::Result<()>,
{
    reject_non_regular_target(temp_path)?;
    reject_non_regular_target(final_path)?;
    let final_exists = fs::symlink_metadata(final_path).is_ok();

    if !final_exists {
        return rename(temp_path, final_path).map_err(|error| {
            let cleanup = remove_regular_file_if_exists(temp_path);
            format!(
                "Failed to install new window state at {}: {}. Temporary cleanup: {}",
                final_path.display(),
                error,
                cleanup_result_description(cleanup, temp_path)
            )
        });
    }

    if let Err(error) = remove_regular_file_if_exists(backup_path) {
        let cleanup = remove_regular_file_if_exists(temp_path);
        return Err(format!(
            "Cannot prepare backup path {}: {}. Temporary cleanup: {}",
            backup_path.display(),
            error,
            cleanup_result_description(cleanup, temp_path)
        ));
    }
    if let Err(error) = rename(final_path, backup_path) {
        let cleanup = remove_regular_file_if_exists(temp_path);
        return Err(format!(
            "Failed to move previous window state {} to backup {}: {}. Previous final remains in place. Temporary cleanup: {}",
            final_path.display(),
            backup_path.display(),
            error,
            cleanup_result_description(cleanup, temp_path)
        ));
    }

    match rename(temp_path, final_path) {
        Ok(()) => remove_regular_file_if_exists(backup_path).map_err(|error| {
            format!(
                "New window state was installed at {}, but backup cleanup at {} failed: {}",
                final_path.display(),
                backup_path.display(),
                error
            )
        }),
        Err(install_error) => {
            let temp_cleanup = remove_regular_file_if_exists(temp_path);
            match rename(backup_path, final_path) {
                Ok(()) => Err(format!(
                    "Failed to install new window state at {}: {}. Previous state was restored from {}. Temporary cleanup: {}",
                    final_path.display(),
                    install_error,
                    backup_path.display(),
                    cleanup_result_description(temp_cleanup, temp_path)
                )),
                Err(rollback_error) => Err(format!(
                    "Failed to install new window state at {}: {}. Rollback from {} also failed: {}. Backup was preserved at {}. Temporary cleanup: {}",
                    final_path.display(),
                    install_error,
                    backup_path.display(),
                    rollback_error,
                    backup_path.display(),
                    cleanup_result_description(temp_cleanup, temp_path)
                )),
            }
        }
    }
}

fn cleanup_result_description(result: Result<(), String>, path: &Path) -> String {
    match result {
        Ok(()) => format!("removed safe artifact {}", path.display()),
        Err(error) => format!("failed for {}: {}", path.display(), error),
    }
}

fn reject_non_regular_target(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(()),
        Ok(_) => Err(format!(
            "Window state target {} is not a regular file",
            path.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to inspect window state target: {error}")),
    }
}

fn remove_regular_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => {
            fs::remove_file(path).map_err(|error| error.to_string())
        }
        Ok(_) => Err(format!(
            "Refusing to remove non-regular state artifact at {}",
            path.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn log_window_state(app: &AppHandle, level: &str, message: &str, details: serde_json::Value) {
    let _ = crate::app_log::append_internal_log(app, level, "window-state", message, Some(details));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn normal() -> NormalWindowState {
        NormalWindowState {
            monitor_name: Some("DISPLAY1".into()),
            offset_x_logical: 100.0,
            offset_y_logical: 80.0,
            inner_width_logical: 1100.0,
            inner_height_logical: 720.0,
            outer_width_logical: 1116.0,
            outer_height_logical: 759.0,
            saved_scale_factor: 1.0,
            saved_work_area_x_physical: 0,
            saved_work_area_y_physical: 0,
            saved_work_area_width_physical: 1920,
            saved_work_area_height_physical: 1040,
        }
    }

    fn monitor(
        name: Option<&str>,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        scale: f64,
        primary: bool,
    ) -> MonitorGeometry {
        MonitorGeometry {
            name: name.map(str::to_string),
            scale_factor: scale,
            work_x: x,
            work_y: y,
            work_width: width,
            work_height: height,
            primary,
        }
    }

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "sky-window-state-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn validation_rejects_zero_negative_non_finite_and_absurd_dimensions() {
        for value in [
            0.0,
            -1.0,
            f64::NAN,
            f64::INFINITY,
            MAX_LOGICAL_DIMENSION + 1.0,
        ] {
            let mut state = normal();
            state.inner_width_logical = value;
            assert!(validate_normal_state(&state).is_err());
        }
    }

    #[test]
    fn dimensions_are_clamped_to_minimum_and_work_area() {
        let mut state = normal();
        state.inner_width_logical = 100.0;
        state.inner_height_logical = 100.0;
        let restored = restore_geometry(
            &state,
            &[monitor(Some("DISPLAY1"), 0, 0, 800, 600, 1.0, true)],
        )
        .unwrap();
        assert_eq!(restored.inner_width, 480);
        assert_eq!(restored.inner_height, 320);
        state.inner_width_logical = 5000.0;
        state.inner_height_logical = 5000.0;
        let restored = restore_geometry(
            &state,
            &[monitor(Some("DISPLAY1"), 0, 0, 800, 600, 1.0, true)],
        )
        .unwrap();
        assert_eq!(restored.inner_width, 800);
        assert_eq!(restored.inner_height, 600);
    }

    #[test]
    fn negative_monitor_coordinates_are_preserved() {
        let state = normal();
        let restored = restore_geometry(
            &state,
            &[monitor(
                Some("DISPLAY1"),
                -1920,
                -200,
                1920,
                1080,
                1.0,
                true,
            )],
        )
        .unwrap();
        assert_eq!(restored.x, -1820);
        assert_eq!(restored.y, -120);
    }

    #[test]
    fn dpi_changes_reapply_logical_geometry_at_current_scale() {
        let state = normal();
        let up = restore_geometry(
            &state,
            &[monitor(Some("DISPLAY1"), 0, 0, 3000, 2000, 1.5, true)],
        )
        .unwrap();
        assert_eq!(up.inner_width, 1650);
        assert_eq!(up.x, 150);
        let mut high_dpi_saved = state;
        high_dpi_saved.saved_scale_factor = 1.5;
        let down = restore_geometry(
            &high_dpi_saved,
            &[monitor(Some("DISPLAY1"), 0, 0, 1920, 1080, 1.0, true)],
        )
        .unwrap();
        assert_eq!(down.inner_width, 1100);
        assert_eq!(down.x, 100);
    }

    #[test]
    fn offscreen_state_is_centered_but_meaningfully_visible_state_is_kept() {
        let monitor = monitor(None, -1000, 50, 1000, 800, 1.0, true);
        let offscreen = ensure_meaningful_visibility(
            PhysicalRect {
                x: 5000.0,
                y: 5000.0,
                width: 500.0,
                height: 400.0,
            },
            &[monitor.clone()],
            &monitor,
        );
        assert_eq!(offscreen.x, -750.0);
        assert_eq!(offscreen.y, 250.0);
        let partial = PhysicalRect {
            x: -1100.0,
            y: 100.0,
            width: 500.0,
            height: 400.0,
        };
        assert_eq!(
            ensure_meaningful_visibility(partial, &[monitor.clone()], &monitor),
            partial
        );
    }

    #[test]
    fn monitor_selection_handles_removed_missing_and_duplicate_names() {
        let state = normal();
        let duplicate = vec![
            monitor(Some("DISPLAY1"), 0, 0, 1000, 800, 1.0, false),
            monitor(Some("DISPLAY1"), 1000, 0, 1000, 800, 1.0, true),
        ];
        assert_eq!(select_monitor(&state, &duplicate).unwrap().work_x, 0);
        let mut missing = state;
        missing.monitor_name = None;
        let nearest = vec![
            monitor(None, -2000, 0, 1000, 800, 1.0, false),
            monitor(None, 0, 0, 1000, 800, 1.0, true),
        ];
        assert_eq!(select_monitor(&missing, &nearest).unwrap().work_x, 0);
        assert!(select_monitor(&missing, &[]).is_none());
    }

    #[test]
    fn runtime_cache_preserves_normal_bounds_through_maximize_and_minimize() {
        let first = normal();
        let second = NormalWindowState {
            offset_x_logical: 200.0,
            ..first.clone()
        };
        let mut runtime = RuntimeWindowState {
            normal: None,
            maximized: false,
            initialized: true,
        };
        apply_runtime_transition(&mut runtime, StableWindowMode::Normal, Some(first.clone()));
        apply_runtime_transition(&mut runtime, StableWindowMode::Maximized, None);
        apply_runtime_transition(&mut runtime, StableWindowMode::Minimized, None);
        assert_eq!(runtime.normal, Some(first));
        assert!(runtime.maximized);
        apply_runtime_transition(&mut runtime, StableWindowMode::Normal, Some(second.clone()));
        assert_eq!(runtime.normal, Some(second));
        assert!(!runtime.maximized);
    }

    #[test]
    fn corrected_geometry_replaces_stale_bounds_even_when_restored_maximized() {
        let mut stale = normal();
        stale.monitor_name = Some("REMOVED".into());
        stale.offset_x_logical = 9000.0;
        stale.offset_y_logical = 9000.0;
        stale.inner_width_logical = 5000.0;
        stale.inner_height_logical = 4000.0;
        let current = monitor(Some("CURRENT"), -1600, 100, 1200, 800, 1.5, true);
        let geometry = restore_geometry(&stale, std::slice::from_ref(&current)).unwrap();
        let normalized =
            normalize_applied_geometry(geometry, (geometry.x, geometry.y), None, &current).unwrap();
        let manager = WindowStateManager::new();
        manager
            .initialize_cache(Some(normalized.clone()), true)
            .unwrap();
        manager
            .apply_capture(StableWindowMode::Minimized, None)
            .unwrap();
        let snapshot = manager.snapshot().unwrap();

        assert_eq!(snapshot.normal, Some(normalized.clone()));
        assert!(snapshot.maximized);
        assert_ne!(normalized.monitor_name, stale.monitor_name);
        assert!(normalized.inner_width_logical < stale.inner_width_logical);
        assert!(normalized.offset_x_logical.abs() < 9000.0);
        let json = serde_json::to_value(PersistedWindowState {
            normal: snapshot.normal.unwrap(),
            maximized: snapshot.maximized,
        })
        .unwrap();
        assert_eq!(json["normal"]["monitorName"], "CURRENT");
        assert_ne!(json["normal"]["offsetXLogical"], 9000.0);
    }

    #[test]
    fn normalization_uses_final_resolution_work_area_and_dpi() {
        let mut saved = normal();
        saved.inner_width_logical = 2500.0;
        saved.inner_height_logical = 1800.0;
        let current = monitor(Some("DISPLAY1"), 0, 0, 1500, 900, 1.5, true);
        let geometry = restore_geometry(&saved, std::slice::from_ref(&current)).unwrap();
        let normalized = normalize_applied_geometry(
            geometry,
            (geometry.x, geometry.y),
            Some((1500, 900)),
            &current,
        )
        .unwrap();

        assert_eq!(normalized.saved_scale_factor, 1.5);
        assert_eq!(normalized.saved_work_area_width_physical, 1500);
        assert!(normalized.inner_width_logical <= 1000.0);
        assert!(normalized.inner_height_logical <= 600.0);
    }

    #[test]
    fn schema_rejects_unsupported_version_and_missing_fields() {
        let unsupported = r#"{"schemaVersion":2,"windows":{}}"#;
        assert!(parse_state_content(unsupported).is_err());
        assert!(parse_state_content(r#"{"schemaVersion":1}"#).is_err());
        assert!(parse_state_content("partial {").is_err());
    }

    #[test]
    fn valid_state_round_trip_preserves_multiple_window_labels() {
        let mut windows = BTreeMap::new();
        windows.insert(
            "main".to_string(),
            PersistedWindowState {
                normal: normal(),
                maximized: true,
            },
        );
        windows.insert(
            "future-window".to_string(),
            PersistedWindowState {
                normal: NormalWindowState {
                    offset_x_logical: 300.0,
                    ..normal()
                },
                maximized: false,
            },
        );
        let file = WindowStateFile {
            schema_version: SCHEMA_VERSION,
            windows,
        };
        let content = serde_json::to_string(&file).unwrap();
        let restored = parse_state_content(&content).unwrap();

        assert_eq!(restored, file);
        assert!(restored.windows.contains_key("future-window"));
    }

    #[test]
    fn atomic_write_preserves_regular_target_and_refuses_directory() {
        let directory = test_directory("atomic-basic");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        write_state_file_atomically(&path, b"old").unwrap();
        write_state_file_atomically(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(write_state_file_atomically(&path, b"blocked").is_err());
        assert!(path.is_dir());
        assert!(!directory.join(TEMP_FILE_NAME).exists());
        assert!(!directory.join(BACKUP_FILE_NAME).exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn malformed_and_unsupported_files_remain_byte_for_byte_unchanged() {
        let directory = test_directory("preserve-invalid");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        let main = PersistedWindowState {
            normal: normal(),
            maximized: false,
        };
        for content in [
            b"malformed {".as_slice(),
            br#"{"schemaVersion":9,"windows":{}}"#,
        ] {
            fs::write(&path, content).unwrap();
            assert!(merge_and_write_state(&path, main.clone()).is_err());
            assert_eq!(fs::read(&path).unwrap(), content);
            assert!(!directory.join(TEMP_FILE_NAME).exists());
            assert!(!directory.join(BACKUP_FILE_NAME).exists());
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn missing_state_is_created_and_valid_state_preserves_other_labels() {
        let directory = test_directory("merge-state");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join(FILE_NAME);
        let main = PersistedWindowState {
            normal: normal(),
            maximized: false,
        };
        merge_and_write_state(&path, main.clone()).unwrap();
        let mut existing = load_state_file_at(&path).unwrap().unwrap();
        existing.windows.insert("other".into(), main.clone());
        fs::write(&path, serde_json::to_vec(&existing).unwrap()).unwrap();
        merge_and_write_state(
            &path,
            PersistedWindowState {
                maximized: true,
                ..main
            },
        )
        .unwrap();
        let merged = load_state_file_at(&path).unwrap().unwrap();
        assert!(merged.windows.contains_key("other"));
        assert!(merged.windows[MAIN_WINDOW_LABEL].maximized);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn read_failure_does_not_reach_atomic_writer() {
        let directory = test_directory("read-failure");
        let path = directory.join(FILE_NAME);
        fs::create_dir_all(&path).unwrap();
        assert!(merge_and_write_state(
            &path,
            PersistedWindowState {
                normal: normal(),
                maximized: false,
            }
        )
        .is_err());
        assert!(path.is_dir());
        assert!(!directory.join(TEMP_FILE_NAME).exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn replacement_failure_branches_cleanup_and_rollback_deterministically() {
        let directory = test_directory("replace-failures");
        fs::create_dir_all(&directory).unwrap();
        let final_path = directory.join(FILE_NAME);
        let temp = directory.join(TEMP_FILE_NAME);
        let backup = directory.join(BACKUP_FILE_NAME);

        fs::write(&final_path, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        let error = replace_synced_temp(&final_path, &temp, &backup, |_, _| {
            Err(std::io::Error::other("backup denied"))
        })
        .unwrap_err();
        assert!(error.contains("Previous final remains"));
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "old");
        assert!(!temp.exists());

        fs::write(&temp, "new").unwrap();
        let mut call = 0;
        let error = replace_synced_temp(&final_path, &temp, &backup, |source, target| {
            call += 1;
            if call == 2 {
                Err(std::io::Error::other("install denied"))
            } else {
                fs::rename(source, target)
            }
        })
        .unwrap_err();
        assert!(error.contains("Previous state was restored"));
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "old");
        assert!(!temp.exists());
        assert!(!backup.exists());

        fs::write(&temp, "new").unwrap();
        call = 0;
        let error = replace_synced_temp(&final_path, &temp, &backup, |source, target| {
            call += 1;
            if call >= 2 {
                Err(std::io::Error::other(if call == 2 {
                    "install denied"
                } else {
                    "rollback denied"
                }))
            } else {
                fs::rename(source, target)
            }
        })
        .unwrap_err();
        assert!(error.contains("rollback denied"));
        assert!(!final_path.exists());
        assert_eq!(fs::read_to_string(&backup).unwrap(), "old");
        assert!(!temp.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn replacement_refuses_non_regular_temp_and_backup_artifacts() {
        let directory = test_directory("replace-artifacts");
        fs::create_dir_all(&directory).unwrap();
        let final_path = directory.join(FILE_NAME);
        let temp = directory.join(TEMP_FILE_NAME);
        let backup = directory.join(BACKUP_FILE_NAME);
        fs::create_dir(&temp).unwrap();
        assert!(
            replace_synced_temp(&final_path, &temp, &backup, |source, target| {
                fs::rename(source, target)
            })
            .is_err()
        );
        assert!(temp.is_dir());
        fs::remove_dir(&temp).unwrap();

        fs::write(&final_path, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        fs::create_dir(&backup).unwrap();
        assert!(
            replace_synced_temp(&final_path, &temp, &backup, |source, target| {
                fs::rename(source, target)
            })
            .is_err()
        );
        assert!(backup.is_dir());
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "old");
        assert!(!temp.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn defaults_match_tauri_configuration_contract() {
        assert_eq!(
            (DEFAULT_WIDTH_LOGICAL, DEFAULT_HEIGHT_LOGICAL),
            (1100.0, 720.0)
        );
        assert_eq!((MIN_WIDTH_LOGICAL, MIN_HEIGHT_LOGICAL), (480.0, 320.0));
    }
}
