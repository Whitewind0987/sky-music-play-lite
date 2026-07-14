use super::playback_engine::PlaybackOutput;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BACKGROUND_PLAYBACK_EVENT: &str = "background-playback-event";
const FOREGROUND_PLAYBACK_EVENT: &str = "foreground-playback-event";
const NOTE_HIGHLIGHT_MS: f64 = 300.0;
const MAX_EXPLICIT_HOLD_MS: f64 = 60000.0;
const PROGRESS_EVENT_INTERVAL_MS: f64 = 150.0;
const MAX_PREPARED_PLAYBACK_PLANS: usize = 32;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannedKey {
    pub key: String,
    #[serde(default)]
    pub hold_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPlanEvent {
    pub time_ms: f64,
    pub keys: Vec<PlannedKey>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackStartRequest {
    pub hwnd: String,
    pub compatibility_profile: String,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
    pub plan: Vec<BackgroundPlaybackPlanEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparePlanRequest {
    pub plan: Vec<BackgroundPlaybackPlanEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub hwnd: String,
    pub compatibility_profile: String,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub key_hold_ms: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
    pub initial_progress_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackOptionsRequest {
    pub session_id: u64,
    pub note_interval_delay_ms: f64,
    pub playback_speed: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackStartResponse {
    pub session_id: u64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPreparePlanResponse {
    pub prepared_plan_id: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackProgress {
    pub current_ms: f64,
    pub percent: f64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackEvent {
    pub session_id: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<BackgroundPlaybackProgress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
}

#[derive(Debug, Clone)]
struct PlaybackOptions {
    note_interval_delay_ms: f64,
    playback_speed: f64,
}

#[derive(Debug, Clone)]
struct TimelineGroup {
    source_time_ms: f64,
    adjusted_start_ms: f64,
    keys: Arc<[PlannedKey]>,
}

#[derive(Debug, Clone)]
struct PlaybackTimeline {
    finish_ms: f64,
    groups: Vec<TimelineGroup>,
    total_ms: f64,
}

#[derive(Debug, Clone)]
struct OptionUpdateRemap {
    next_group_index: usize,
    segment_ratio: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ScheduledKeyUp {
    deadline_at: Instant,
    generation: u64,
    key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkerPlaybackState {
    Paused,
    Playing,
    Stopped,
}

enum PlaybackCommand {
    Pause,
    Resume,
    Seek(f64),
    Stop,
    UpdateOptions(PlaybackOptions),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlaybackOutputMode {
    Background,
    Foreground,
}

impl PlaybackOutputMode {
    fn event_name(self) -> &'static str {
        match self {
            Self::Background => BACKGROUND_PLAYBACK_EVENT,
            Self::Foreground => FOREGROUND_PLAYBACK_EVENT,
        }
    }

    fn timing_label(self) -> &'static str {
        match self {
            Self::Background => "start_background_playback",
            Self::Foreground => "start_prepared_foreground_playback",
        }
    }

    fn first_key_down_timing_label(self) -> &'static str {
        match self {
            Self::Background => "background worker first key-down",
            Self::Foreground => "foreground worker first key-down",
        }
    }

    fn shared_manager(self) -> &'static Mutex<BackgroundPlaybackManager> {
        let _ = self;
        manager()
    }
}

struct BackgroundPlaybackManager {
    current: Option<BackgroundPlaybackSession>,
    next_session_id: u64,
}

struct PreparedPlaybackPlanCache {
    entries: HashMap<u64, Arc<PreparedPlaybackPlan>>,
    next_plan_id: u64,
    order: VecDeque<u64>,
}

#[derive(Debug)]
struct PreparedPlaybackPlan {
    groups: Arc<[TimelineGroup]>,
    unique_keys: Arc<[String]>,
}

struct BackgroundPlaybackSession {
    session_id: u64,
    command_tx: Sender<PlaybackCommand>,
    worker: Option<JoinHandle<()>>,
}

struct BackgroundPlaybackWorker {
    active_generations: HashMap<String, u64>,
    app_handle: AppHandle,
    command_rx: mpsc::Receiver<PlaybackCommand>,
    key_hold_ms: f64,
    logged_first_key_down: bool,
    next_generation: u64,
    next_group_index: usize,
    next_progress_event_ms: f64,
    options: PlaybackOptions,
    position_ms: f64,
    prepared_plan: Arc<PreparedPlaybackPlan>,
    scheduled_key_ups: Vec<ScheduledKeyUp>,
    session_id: u64,
    start_rx: Receiver<()>,
    started_at: Instant,
    state: WorkerPlaybackState,
    output_mode: PlaybackOutputMode,
    output: PlaybackOutput,
    timeline: PlaybackTimeline,
}

static BACKGROUND_PLAYBACK_MANAGER: OnceLock<Mutex<BackgroundPlaybackManager>> = OnceLock::new();
static BACKGROUND_PLAYBACK_LIFECYCLE: OnceLock<Mutex<()>> = OnceLock::new();
static PREPARED_PLAYBACK_PLAN_CACHE: OnceLock<Mutex<PreparedPlaybackPlanCache>> = OnceLock::new();

pub fn prepare_background_playback_plan(
    request: BackgroundPlaybackPreparePlanRequest,
) -> Result<BackgroundPlaybackPreparePlanResponse, String> {
    let started_at = Instant::now();
    let prepared_plan_id = insert_prepared_plan(build_prepared_plan(&request.plan)?);

    debug_timing(
        "prepare_background_playback_plan",
        started_at,
        &[("source timeline cached", started_at.elapsed())],
    );

    Ok(BackgroundPlaybackPreparePlanResponse { prepared_plan_id })
}

pub fn start_background_playback(
    app_handle: AppHandle,
    request: BackgroundPlaybackStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    let command_started_at = Instant::now();
    let prepared_plan = Arc::new(build_prepared_plan(&request.plan)?);
    let prepared_plan_ready_at = Instant::now();

    start_background_playback_from_groups(
        app_handle,
        BackgroundPlaybackPreparedStartRequest {
            compatibility_profile: request.compatibility_profile,
            hwnd: request.hwnd,
            initial_progress_ms: request.initial_progress_ms,
            key_hold_ms: request.key_hold_ms,
            note_interval_delay_ms: request.note_interval_delay_ms,
            playback_speed: request.playback_speed,
            prepared_plan_id: 0,
        },
        prepared_plan,
        command_started_at,
        prepared_plan_ready_at,
    )
}

pub fn start_prepared_background_playback(
    app_handle: AppHandle,
    request: BackgroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    let command_started_at = Instant::now();
    let prepared_plan = get_prepared_plan(request.prepared_plan_id)?;
    let prepared_plan_ready_at = Instant::now();

    start_background_playback_from_groups(
        app_handle,
        request,
        prepared_plan,
        command_started_at,
        prepared_plan_ready_at,
    )
}

fn start_background_playback_from_groups(
    app_handle: AppHandle,
    request: BackgroundPlaybackPreparedStartRequest,
    prepared_plan: Arc<PreparedPlaybackPlan>,
    command_started_at: Instant,
    prepared_plan_ready_at: Instant,
) -> Result<BackgroundPlaybackStartResponse, String> {
    let hwnd = request.hwnd.clone();
    let compatibility_profile = request.compatibility_profile.clone();

    start_playback_from_prepared(
        app_handle,
        PlaybackStartOptions {
            initial_progress_ms: request.initial_progress_ms,
            key_hold_ms: request.key_hold_ms,
            note_interval_delay_ms: request.note_interval_delay_ms,
            playback_speed: request.playback_speed,
        },
        prepared_plan,
        command_started_at,
        prepared_plan_ready_at,
        PlaybackOutputMode::Background,
        move |keys| PlaybackOutput::prepare_target_window(&hwnd, keys, &compatibility_profile),
    )
}

pub fn start_prepared_foreground_playback(
    app_handle: AppHandle,
    request: ForegroundPlaybackPreparedStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    let command_started_at = Instant::now();
    let prepared_plan = get_prepared_plan(request.prepared_plan_id)?;
    let prepared_plan_ready_at = Instant::now();

    start_playback_from_prepared(
        app_handle,
        PlaybackStartOptions {
            initial_progress_ms: request.initial_progress_ms,
            key_hold_ms: request.key_hold_ms,
            note_interval_delay_ms: request.note_interval_delay_ms,
            playback_speed: request.playback_speed,
        },
        prepared_plan,
        command_started_at,
        prepared_plan_ready_at,
        PlaybackOutputMode::Foreground,
        PlaybackOutput::prepare_foreground,
    )
}

#[derive(Debug, Clone)]
struct PlaybackStartOptions {
    initial_progress_ms: Option<f64>,
    key_hold_ms: u64,
    note_interval_delay_ms: f64,
    playback_speed: f64,
}

fn start_playback_from_prepared<F>(
    app_handle: AppHandle,
    request: PlaybackStartOptions,
    prepared_plan: Arc<PreparedPlaybackPlan>,
    command_started_at: Instant,
    prepared_plan_ready_at: Instant,
    output_mode: PlaybackOutputMode,
    prepare_output: F,
) -> Result<BackgroundPlaybackStartResponse, String>
where
    F: FnOnce(&[String]) -> Result<PlaybackOutput, String>,
{
    let options = PlaybackOptions {
        note_interval_delay_ms: request.note_interval_delay_ms,
        playback_speed: normalize_playback_speed(request.playback_speed)?,
    };
    validate_start_request(request.key_hold_ms, &prepared_plan.groups)?;
    let output = prepare_output(&prepared_plan.unique_keys)?;
    let output_preparation_completed_at = Instant::now();
    let timeline = build_timeline_from_groups(&prepared_plan.groups, &options)?;
    let timeline_completed_at = Instant::now();

    let initial_progress_ms = clamp_progress(
        request.initial_progress_ms.unwrap_or(0.0),
        timeline.total_ms,
    );
    let _lifecycle_guard = lifecycle()
        .lock()
        .expect("background playback lifecycle poisoned");

    stop_current_session();
    let previous_session_stopped_at = Instant::now();

    let session_id = next_session_id(output_mode);
    let (command_tx, command_rx) = mpsc::channel();
    let (start_tx, start_rx) = mpsc::channel();
    let total_ms = timeline.total_ms;
    let worker_timeline = timeline;
    let worker = BackgroundPlaybackWorker {
        active_generations: HashMap::new(),
        app_handle,
        command_rx,
        key_hold_ms: request.key_hold_ms as f64,
        logged_first_key_down: false,
        next_generation: 1,
        next_group_index: find_next_group_index(&worker_timeline, initial_progress_ms),
        next_progress_event_ms: initial_progress_ms + PROGRESS_EVENT_INTERVAL_MS,
        options,
        position_ms: initial_progress_ms,
        prepared_plan,
        scheduled_key_ups: Vec::new(),
        session_id,
        start_rx,
        started_at: Instant::now(),
        state: WorkerPlaybackState::Playing,
        output_mode,
        output,
        timeline: worker_timeline,
    };
    let worker_handle = thread::spawn(move || worker.run());
    let worker_created_at = Instant::now();

    {
        let mut manager = output_mode
            .shared_manager()
            .lock()
            .expect("background playback manager poisoned");
        manager.current = Some(BackgroundPlaybackSession {
            session_id,
            command_tx,
            worker: Some(worker_handle),
        });
    }
    let session_registered_at = Instant::now();

    let _ = start_tx.send(());
    let start_gate_released_at = Instant::now();

    debug_timing(
        output_mode.timing_label(),
        command_started_at,
        &[
            (
                "prepared-plan lookup",
                prepared_plan_ready_at.duration_since(command_started_at),
            ),
            (
                "output preparation",
                output_preparation_completed_at.duration_since(prepared_plan_ready_at),
            ),
            (
                "timeline calculation",
                timeline_completed_at.duration_since(output_preparation_completed_at),
            ),
            (
                "previous session stop/join",
                previous_session_stopped_at.duration_since(timeline_completed_at),
            ),
            (
                "worker creation",
                worker_created_at.duration_since(previous_session_stopped_at),
            ),
            (
                "session registration",
                session_registered_at.duration_since(worker_created_at),
            ),
            (
                "start gate released",
                start_gate_released_at.duration_since(session_registered_at),
            ),
        ],
    );

    Ok(BackgroundPlaybackStartResponse {
        session_id,
        total_ms,
    })
}

pub fn pause_background_playback(session_id: u64) -> Result<(), String> {
    send_command_to_session(session_id, PlaybackCommand::Pause)
}

pub fn resume_background_playback(session_id: u64) -> Result<(), String> {
    send_command_to_session(session_id, PlaybackCommand::Resume)
}

pub fn seek_background_playback(session_id: u64, time_ms: f64) -> Result<(), String> {
    send_command_to_session(session_id, PlaybackCommand::Seek(time_ms))
}

pub fn update_background_playback_options(
    request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    let options = PlaybackOptions {
        note_interval_delay_ms: request.note_interval_delay_ms,
        playback_speed: normalize_playback_speed(request.playback_speed)?,
    };

    send_command_to_session(request.session_id, PlaybackCommand::UpdateOptions(options))
}

pub fn stop_background_playback(session_id: u64) -> Result<(), String> {
    let session = take_session_if_current_from(manager(), session_id);

    if let Some(session) = session {
        session.stop_and_join();
    }

    Ok(())
}

pub fn stop_current_background_playback_for_shutdown() {
    let _lifecycle_guard = lifecycle()
        .lock()
        .expect("background playback lifecycle poisoned");

    stop_current_session();
}

pub fn pause_foreground_playback(session_id: u64) -> Result<(), String> {
    pause_background_playback(session_id)
}

pub fn resume_foreground_playback(session_id: u64) -> Result<(), String> {
    resume_background_playback(session_id)
}

pub fn seek_foreground_playback(session_id: u64, time_ms: f64) -> Result<(), String> {
    seek_background_playback(session_id, time_ms)
}

pub fn stop_foreground_playback(session_id: u64) -> Result<(), String> {
    stop_background_playback(session_id)
}

pub fn update_foreground_playback_options(
    request: BackgroundPlaybackOptionsRequest,
) -> Result<(), String> {
    update_background_playback_options(request)
}

fn manager() -> &'static Mutex<BackgroundPlaybackManager> {
    BACKGROUND_PLAYBACK_MANAGER.get_or_init(|| {
        Mutex::new(BackgroundPlaybackManager {
            current: None,
            next_session_id: 1,
        })
    })
}

fn lifecycle() -> &'static Mutex<()> {
    BACKGROUND_PLAYBACK_LIFECYCLE.get_or_init(|| Mutex::new(()))
}

fn prepared_plan_cache() -> &'static Mutex<PreparedPlaybackPlanCache> {
    PREPARED_PLAYBACK_PLAN_CACHE.get_or_init(|| {
        Mutex::new(PreparedPlaybackPlanCache {
            entries: HashMap::new(),
            next_plan_id: 1,
            order: VecDeque::new(),
        })
    })
}

fn insert_prepared_plan(plan: PreparedPlaybackPlan) -> u64 {
    let mut cache = prepared_plan_cache()
        .lock()
        .expect("prepared playback plan cache poisoned");
    insert_prepared_plan_into_cache(&mut cache, plan, MAX_PREPARED_PLAYBACK_PLANS)
}

fn get_prepared_plan(plan_id: u64) -> Result<Arc<PreparedPlaybackPlan>, String> {
    let mut cache = prepared_plan_cache()
        .lock()
        .expect("prepared playback plan cache poisoned");

    get_prepared_plan_from_cache(&mut cache, plan_id)
}

fn insert_prepared_plan_into_cache(
    cache: &mut PreparedPlaybackPlanCache,
    plan: PreparedPlaybackPlan,
    max_entries: usize,
) -> u64 {
    let plan_id = cache.next_plan_id;

    cache.next_plan_id = cache.next_plan_id.saturating_add(1).max(1);
    cache.entries.insert(plan_id, Arc::new(plan));
    cache.order.push_back(plan_id);

    while cache.entries.len() > max_entries {
        if let Some(expired_plan_id) = cache.order.pop_front() {
            cache.entries.remove(&expired_plan_id);
        } else {
            break;
        }
    }

    plan_id
}

fn get_prepared_plan_from_cache(
    cache: &mut PreparedPlaybackPlanCache,
    plan_id: u64,
) -> Result<Arc<PreparedPlaybackPlan>, String> {
    let plan = cache.entries.get(&plan_id).cloned().ok_or_else(|| {
        format!("Prepared background playback plan is no longer available. id: {plan_id}")
    })?;

    touch_prepared_plan(cache, plan_id);
    Ok(plan)
}

fn touch_prepared_plan(cache: &mut PreparedPlaybackPlanCache, plan_id: u64) {
    if let Some(position) = cache
        .order
        .iter()
        .position(|current_id| *current_id == plan_id)
    {
        cache.order.remove(position);
    }

    cache.order.push_back(plan_id);
}

fn next_session_id(output_mode: PlaybackOutputMode) -> u64 {
    let mut manager = output_mode
        .shared_manager()
        .lock()
        .expect("background playback manager poisoned");
    let session_id = manager.next_session_id;
    manager.next_session_id = manager.next_session_id.saturating_add(1).max(1);
    session_id
}

fn stop_current_session() {
    // Taking the session drops the manager lock before its worker can be joined.
    let session = take_current_session_from(manager());

    if let Some(session) = session {
        session.stop_and_join();
    }
}

fn take_current_session_from(
    manager: &Mutex<BackgroundPlaybackManager>,
) -> Option<BackgroundPlaybackSession> {
    let mut manager = manager
        .lock()
        .expect("background playback manager poisoned");

    take_current_session(&mut manager)
}

fn take_session_if_current_from(
    manager: &Mutex<BackgroundPlaybackManager>,
    session_id: u64,
) -> Option<BackgroundPlaybackSession> {
    let mut manager = manager
        .lock()
        .expect("background playback manager poisoned");

    take_session_if_current(&mut manager, session_id)
}

fn take_current_session(
    manager: &mut BackgroundPlaybackManager,
) -> Option<BackgroundPlaybackSession> {
    manager.current.take()
}

fn take_session_if_current(
    manager: &mut BackgroundPlaybackManager,
    session_id: u64,
) -> Option<BackgroundPlaybackSession> {
    if matches!(manager.current.as_ref(), Some(current) if current.session_id == session_id) {
        return manager.current.take();
    }

    None
}

fn send_command_to_session(session_id: u64, command: PlaybackCommand) -> Result<(), String> {
    let command_tx = {
        let manager = manager()
            .lock()
            .expect("background playback manager poisoned");

        match command_sender_for_current_session(&manager, session_id) {
            Some(command_tx) => command_tx,
            None => return Ok(()),
        }
    };

    command_tx
        .send(command)
        .map_err(|_| "Background playback worker is no longer available.".to_string())
}

fn command_sender_for_current_session(
    manager: &BackgroundPlaybackManager,
    session_id: u64,
) -> Option<Sender<PlaybackCommand>> {
    manager
        .current
        .as_ref()
        .and_then(|session| (session.session_id == session_id).then(|| session.command_tx.clone()))
}

impl BackgroundPlaybackSession {
    fn stop_and_join(mut self) {
        let _ = self.command_tx.send(PlaybackCommand::Stop);

        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl BackgroundPlaybackWorker {
    fn run(mut self) {
        if self.start_rx.recv().is_err() {
            self.stop_without_event();
            return;
        }

        self.started_at = Instant::now();
        self.emit_state("playing");
        self.emit_progress();

        loop {
            if self.state == WorkerPlaybackState::Stopped {
                return;
            }

            if self.state == WorkerPlaybackState::Paused {
                match self.command_rx.recv() {
                    Ok(command) => {
                        if !self.handle_command(command) {
                            return;
                        }
                    }
                    Err(_) => {
                        self.stop_without_event();
                        return;
                    }
                }
                continue;
            }

            self.update_position_from_clock();

            if let Err(error) = self.process_due_events() {
                self.handle_error(error);
                return;
            }

            if self.state == WorkerPlaybackState::Stopped {
                return;
            }

            let wait_duration = self.next_wait_duration();

            match self.command_rx.recv_timeout(wait_duration) {
                Ok(command) => {
                    if !self.handle_command(command) {
                        return;
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    self.stop_without_event();
                    return;
                }
            }
        }
    }

    fn current_position_from_clock(&self) -> f64 {
        if self.state != WorkerPlaybackState::Playing {
            return self.position_ms;
        }

        self.position_ms + self.started_at.elapsed().as_secs_f64() * 1000.0
    }

    fn update_position_from_clock(&mut self) {
        if self.state == WorkerPlaybackState::Playing {
            self.position_ms = self.current_position_from_clock();
            self.started_at = Instant::now();
        }
    }

    fn handle_command(&mut self, command: PlaybackCommand) -> bool {
        match command {
            PlaybackCommand::Pause => {
                if self.state == WorkerPlaybackState::Playing {
                    self.update_position_from_clock();
                    self.release_all_active_keys();
                    self.scheduled_key_ups.clear();
                    self.state = WorkerPlaybackState::Paused;
                    self.emit_state("paused");
                    self.emit_progress();
                }
                true
            }
            PlaybackCommand::Resume => {
                if self.state == WorkerPlaybackState::Paused {
                    self.next_group_index = find_next_group_index(&self.timeline, self.position_ms);
                    self.started_at = Instant::now();
                    self.state = WorkerPlaybackState::Playing;
                    self.emit_state("playing");
                    self.emit_progress();
                }
                true
            }
            PlaybackCommand::Seek(time_ms) => {
                self.update_position_from_clock();
                self.release_all_active_keys();
                self.scheduled_key_ups.clear();
                self.position_ms = clamp_progress(time_ms, self.timeline.total_ms);
                self.next_group_index = find_next_group_index(&self.timeline, self.position_ms);
                self.next_progress_event_ms = self.position_ms + PROGRESS_EVENT_INTERVAL_MS;

                if self.state == WorkerPlaybackState::Playing {
                    self.started_at = Instant::now();
                }

                self.emit_progress();

                if self.position_ms >= self.timeline.finish_ms {
                    self.finish();
                    return false;
                }

                true
            }
            PlaybackCommand::Stop => {
                self.stop_without_event();
                false
            }
            PlaybackCommand::UpdateOptions(options) => {
                self.update_position_from_clock();
                let remap = capture_option_update_remap(
                    &self.timeline,
                    self.position_ms,
                    self.next_group_index,
                );
                self.options = options;
                match build_timeline_from_groups(&self.prepared_plan.groups, &self.options) {
                    Ok(timeline) => {
                        let (next_position_ms, next_group_index) =
                            remap_position_after_options_update(&remap, &timeline);
                        self.timeline = timeline;
                        self.position_ms = next_position_ms;
                        self.next_group_index = next_group_index;
                        self.next_progress_event_ms = self.position_ms + PROGRESS_EVENT_INTERVAL_MS;

                        if self.state == WorkerPlaybackState::Playing {
                            self.started_at = Instant::now();
                        }

                        self.emit_progress();
                    }
                    Err(error) => {
                        self.handle_error(error);
                        return false;
                    }
                }
                true
            }
        }
    }

    fn process_due_events(&mut self) -> Result<(), String> {
        let due_position = self.position_ms;
        let now = Instant::now();

        self.release_due_key_ups(now)?;

        while self.next_group_index < self.timeline.groups.len()
            && self.timeline.groups[self.next_group_index].adjusted_start_ms <= due_position
        {
            let group = self.timeline.groups[self.next_group_index].clone();
            self.play_group(&group)?;
            self.next_group_index += 1;
            self.release_due_key_ups(Instant::now())?;
        }

        if due_position >= self.next_progress_event_ms {
            self.emit_progress();
            self.next_progress_event_ms = due_position + PROGRESS_EVENT_INTERVAL_MS;
        }

        if should_finish_playback(
            due_position,
            self.timeline.finish_ms,
            &self.active_generations,
            &self.scheduled_key_ups,
            Instant::now(),
        ) {
            self.finish();
        }

        Ok(())
    }

    fn play_group(&mut self, group: &TimelineGroup) -> Result<(), String> {
        let key_names = group
            .keys
            .iter()
            .map(|key| key.key.clone())
            .collect::<Vec<_>>();
        let keys_to_release = key_names
            .iter()
            .filter(|key| self.active_generations.contains_key(*key))
            .cloned()
            .collect::<Vec<_>>();

        if !keys_to_release.is_empty() {
            self.send_key_up_group(&keys_to_release)?;
            for key in keys_to_release {
                self.active_generations.remove(&key);
            }
        }

        if let Err(error) = self.send_key_down_group(&key_names) {
            let _ = self.send_key_up_group(&key_names);
            return Err(error);
        }

        if !self.logged_first_key_down {
            self.logged_first_key_down = true;
            debug_timing(
                self.output_mode.first_key_down_timing_label(),
                self.started_at,
                &[("first key-down dispatch", self.started_at.elapsed())],
            );
        }

        for key in group.keys.iter() {
            let generation = self.next_generation;
            self.next_generation = self.next_generation.saturating_add(1).max(1);
            self.active_generations.insert(key.key.clone(), generation);
            self.scheduled_key_ups.push(ScheduledKeyUp {
                deadline_at: key_up_deadline_from_actual_send(
                    Instant::now(),
                    effective_hold_ms(key.hold_ms, self.options.playback_speed, self.key_hold_ms),
                )?,
                generation,
                key: key.key.clone(),
            });
        }

        Ok(())
    }

    fn release_due_key_ups(&mut self, now: Instant) -> Result<(), String> {
        let mut due_key_ups = Vec::new();
        let mut pending_key_ups = Vec::new();

        for key_up in self.scheduled_key_ups.drain(..) {
            if key_up.deadline_at <= now {
                due_key_ups.push(key_up);
            } else {
                pending_key_ups.push(key_up);
            }
        }

        self.scheduled_key_ups = pending_key_ups;

        let keys_to_release = keys_due_for_release(&self.active_generations, &due_key_ups);

        if !keys_to_release.is_empty() {
            self.send_key_up_group(&keys_to_release)?;

            for key in keys_to_release {
                self.active_generations.remove(&key);
            }
        }

        Ok(())
    }

    fn release_all_active_keys(&mut self) {
        if self.active_generations.is_empty() {
            return;
        }

        let keys = self.active_generations.keys().cloned().collect::<Vec<_>>();
        let _ = self.send_key_up_group(&keys);
        self.active_generations.clear();
    }

    fn finish(&mut self) {
        self.release_all_active_keys();
        self.scheduled_key_ups.clear();
        self.position_ms = self.timeline.total_ms;
        self.state = WorkerPlaybackState::Stopped;
        self.emit_progress();
        self.emit_event("finished", None, None, None);
        clear_current_session(self.session_id);
    }

    fn stop_without_event(&mut self) {
        self.release_all_active_keys();
        self.scheduled_key_ups.clear();
        self.state = WorkerPlaybackState::Stopped;
        clear_current_session(self.session_id);
    }

    fn handle_error(&mut self, error: String) {
        self.release_all_active_keys();
        self.scheduled_key_ups.clear();
        self.state = WorkerPlaybackState::Stopped;
        self.emit_event("error", Some(error), None, None);
        clear_current_session(self.session_id);
    }

    fn next_wait_duration(&self) -> Duration {
        let current_position = self.position_ms;
        let next_deadline = self.next_deadline_ms().unwrap_or(current_position);
        let wait_ms = (next_deadline - current_position).max(0.0);

        Duration::from_secs_f64(wait_ms / 1000.0)
    }

    fn next_deadline_ms(&self) -> Option<f64> {
        next_playback_deadline_ms(
            self.position_ms,
            self.timeline.finish_ms,
            self.next_progress_event_ms,
            self.timeline
                .groups
                .get(self.next_group_index)
                .map(|group| group.adjusted_start_ms),
            &self.active_generations,
            &self.scheduled_key_ups,
            Instant::now(),
        )
    }

    fn send_key_down_group(&self, keys: &[String]) -> Result<(), String> {
        self.output.send_key_down_group(keys)
    }

    fn send_key_up_group(&self, keys: &[String]) -> Result<(), String> {
        self.output.send_key_up_group(keys)
    }

    fn emit_state(&self, state: &str) {
        self.emit_event("state", None, None, Some(state.to_string()));
    }

    fn emit_progress(&self) {
        let current_ms = clamp_progress(self.current_position_from_clock(), self.timeline.total_ms);
        let percent = if self.timeline.total_ms > 0.0 {
            current_ms / self.timeline.total_ms * 100.0
        } else {
            0.0
        };

        self.emit_event(
            "progress",
            None,
            Some(BackgroundPlaybackProgress {
                current_ms,
                percent,
                total_ms: self.timeline.total_ms,
            }),
            None,
        );
    }

    fn emit_event(
        &self,
        event_type: &str,
        error: Option<String>,
        progress: Option<BackgroundPlaybackProgress>,
        state: Option<String>,
    ) {
        let _ = self.app_handle.emit(
            self.output_mode.event_name(),
            BackgroundPlaybackEvent {
                session_id: self.session_id,
                event_type: event_type.to_string(),
                error,
                progress,
                state,
            },
        );
    }
}

fn clear_current_session(session_id: u64) {
    let mut manager = manager()
        .lock()
        .expect("background playback manager poisoned");

    if should_clear_current_session(
        manager.current.as_ref().map(|current| current.session_id),
        session_id,
    ) {
        manager.current = None;
    }
}

fn validate_start_request(key_hold_ms: u64, groups: &[TimelineGroup]) -> Result<(), String> {
    if groups.is_empty() {
        return Err("Background playback plan must contain at least one event.".to_string());
    }

    if key_hold_ms == 0 {
        return Err("Background playback key hold duration must be greater than zero.".to_string());
    }

    Ok(())
}

fn normalize_playback_speed(playback_speed: f64) -> Result<f64, String> {
    if !playback_speed.is_finite() || playback_speed <= 0.0 {
        return Err(format!(
            "Background playback speed must be a positive finite number. value: {playback_speed}"
        ));
    }

    Ok(playback_speed)
}

#[cfg(test)]
fn build_timeline(
    plan: &[BackgroundPlaybackPlanEvent],
    options: &PlaybackOptions,
) -> Result<PlaybackTimeline, String> {
    let groups = build_source_groups(plan)?;

    build_timeline_from_groups(&groups, options)
}

fn build_source_groups(plan: &[BackgroundPlaybackPlanEvent]) -> Result<Vec<TimelineGroup>, String> {
    let mut grouped_events = plan.to_vec();
    grouped_events.sort_by(|left, right| left.time_ms.total_cmp(&right.time_ms));

    let mut grouped_keys = Vec::<(f64, Vec<PlannedKey>)>::new();

    for event in grouped_events {
        if !event.time_ms.is_finite() {
            return Err("Background playback event time must be finite.".to_string());
        }

        if event.keys.is_empty() {
            return Err("Background playback event must contain at least one key.".to_string());
        }

        for key in &event.keys {
            if let Some(hold_ms) = key.hold_ms {
                if !hold_ms.is_finite() || hold_ms <= 0.0 || hold_ms > MAX_EXPLICIT_HOLD_MS {
                    return Err(
                        format!(
                            "Background playback key hold duration must be greater than zero and at most {MAX_EXPLICIT_HOLD_MS}ms."
                        ),
                    );
                }
            }
        }

        if let Some((last_time_ms, last_keys)) = grouped_keys.last_mut() {
            if *last_time_ms == event.time_ms {
                last_keys.extend(event.keys);
                continue;
            }
        }

        grouped_keys.push((event.time_ms, event.keys));
    }

    Ok(grouped_keys
        .into_iter()
        .map(|(source_time_ms, keys)| TimelineGroup {
            source_time_ms,
            adjusted_start_ms: 0.0,
            keys: Arc::from(dedupe_planned_keys(keys)),
        })
        .collect())
}

fn dedupe_planned_keys(keys: Vec<PlannedKey>) -> Vec<PlannedKey> {
    let mut deduped = Vec::<PlannedKey>::new();

    for key in keys {
        if let Some(existing) = deduped.iter_mut().find(|entry| entry.key == key.key) {
            existing.hold_ms = match (existing.hold_ms, key.hold_ms) {
                (Some(left), Some(right)) => Some(left.max(right)),
                (None, Some(right)) => Some(right),
                (left, None) => left,
            };
        } else {
            deduped.push(key);
        }
    }

    deduped
}

fn build_prepared_plan(
    plan: &[BackgroundPlaybackPlanEvent],
) -> Result<PreparedPlaybackPlan, String> {
    let groups = build_source_groups(plan)?;
    let unique_keys = unique_timeline_keys(&groups);

    Ok(PreparedPlaybackPlan {
        groups: Arc::from(groups),
        unique_keys: Arc::from(unique_keys),
    })
}

fn build_timeline_from_groups(
    groups: &[TimelineGroup],
    options: &PlaybackOptions,
) -> Result<PlaybackTimeline, String> {
    normalize_playback_speed(options.playback_speed)?;

    if !options.note_interval_delay_ms.is_finite() {
        return Err("Background playback note interval delay must be finite.".to_string());
    }

    if groups.is_empty() {
        return Err("Background playback timeline must contain at least one group.".to_string());
    }

    let mut adjusted_groups = Vec::with_capacity(groups.len());
    let mut adjusted_start_ms = 0.0;
    let mut previous_source_time_ms = 0.0;
    let mut max_explicit_hold_end_ms = 0.0_f64;

    for (index, group) in groups.iter().enumerate() {
        if index == 0 {
            adjusted_start_ms = group.source_time_ms.max(0.0) / options.playback_speed;
        } else {
            let original_gap_ms = group.source_time_ms - previous_source_time_ms;
            adjusted_start_ms += (original_gap_ms / options.playback_speed
                + options.note_interval_delay_ms)
                .max(0.0);
        }

        previous_source_time_ms = group.source_time_ms;

        let group_max_hold_ms = group
            .keys
            .iter()
            .filter_map(|key| key.hold_ms)
            .fold(0.0_f64, f64::max);
        let explicit_hold_end_ms = adjusted_start_ms + group_max_hold_ms / options.playback_speed;

        if !adjusted_start_ms.is_finite() || !explicit_hold_end_ms.is_finite() {
            return Err("Background playback adjusted timing is not representable.".to_string());
        }

        max_explicit_hold_end_ms = max_explicit_hold_end_ms.max(explicit_hold_end_ms);

        adjusted_groups.push(TimelineGroup {
            adjusted_start_ms,
            keys: group.keys.clone(),
            source_time_ms: group.source_time_ms,
        });
    }

    let last_adjusted_start_ms = adjusted_groups
        .last()
        .map(|group| group.adjusted_start_ms)
        .unwrap_or(0.0);
    let total_ms = last_adjusted_start_ms.max(max_explicit_hold_end_ms);
    let finish_ms =
        total_ms.max(last_adjusted_start_ms + NOTE_HIGHLIGHT_MS / options.playback_speed);

    if !total_ms.is_finite() || !finish_ms.is_finite() {
        return Err("Background playback total timing is not representable.".to_string());
    }
    Duration::try_from_secs_f64(finish_ms / 1000.0).map_err(|_| {
        "Background playback finish timing is not representable as a duration.".to_string()
    })?;

    Ok(PlaybackTimeline {
        finish_ms,
        groups: adjusted_groups,
        total_ms,
    })
}

fn find_next_group_index(timeline: &PlaybackTimeline, progress_ms: f64) -> usize {
    let clamped_progress_ms = clamp_progress(progress_ms, timeline.total_ms);

    timeline
        .groups
        .iter()
        .position(|group| {
            if clamped_progress_ms <= 0.0 {
                group.adjusted_start_ms >= clamped_progress_ms
            } else {
                group.adjusted_start_ms > clamped_progress_ms
            }
        })
        .unwrap_or(timeline.groups.len())
}

fn capture_option_update_remap(
    timeline: &PlaybackTimeline,
    position_ms: f64,
    next_group_index: usize,
) -> OptionUpdateRemap {
    let segment_start_ms = segment_start_ms(timeline, next_group_index);
    let segment_end_ms = segment_end_ms(timeline, next_group_index);
    let segment_duration_ms = segment_end_ms - segment_start_ms;
    let segment_ratio = if segment_duration_ms <= 0.0 {
        1.0
    } else {
        ((position_ms - segment_start_ms) / segment_duration_ms).clamp(0.0, 1.0)
    };

    OptionUpdateRemap {
        next_group_index: next_group_index.min(timeline.groups.len()),
        segment_ratio,
    }
}

fn remap_position_after_options_update(
    remap: &OptionUpdateRemap,
    timeline: &PlaybackTimeline,
) -> (f64, usize) {
    let next_group_index = remap.next_group_index.min(timeline.groups.len());
    let segment_start_ms = segment_start_ms(timeline, next_group_index);
    let segment_end_ms = segment_end_ms(timeline, next_group_index);
    let position_ms = segment_start_ms + (segment_end_ms - segment_start_ms) * remap.segment_ratio;

    (
        clamp_playback_position(position_ms, timeline.finish_ms),
        next_group_index,
    )
}

fn segment_start_ms(timeline: &PlaybackTimeline, next_group_index: usize) -> f64 {
    if next_group_index == 0 {
        0.0
    } else if next_group_index <= timeline.groups.len() {
        timeline.groups[next_group_index - 1].adjusted_start_ms
    } else {
        timeline.total_ms
    }
}

fn segment_end_ms(timeline: &PlaybackTimeline, next_group_index: usize) -> f64 {
    if let Some(group) = timeline.groups.get(next_group_index) {
        group.adjusted_start_ms
    } else {
        timeline.finish_ms
    }
}

fn clamp_progress(progress_ms: f64, total_ms: f64) -> f64 {
    if !progress_ms.is_finite() {
        return 0.0;
    }

    progress_ms.max(0.0).min(total_ms.max(0.0))
}

fn clamp_playback_position(position_ms: f64, finish_ms: f64) -> f64 {
    if !position_ms.is_finite() {
        return 0.0;
    }

    position_ms.max(0.0).min(finish_ms.max(0.0))
}

fn key_up_deadline_from_actual_send(sent_at: Instant, key_hold_ms: f64) -> Result<Instant, String> {
    if !key_hold_ms.is_finite() || key_hold_ms <= 0.0 {
        return Err("Effective background playback key hold duration is invalid.".to_string());
    }

    let duration = Duration::try_from_secs_f64(key_hold_ms / 1000.0).map_err(|_| {
        "Effective background playback key hold duration is not representable.".to_string()
    })?;

    sent_at.checked_add(duration).ok_or_else(|| {
        "Effective background playback key hold deadline is not representable.".to_string()
    })
}

fn effective_hold_ms(hold_ms: Option<f64>, playback_speed: f64, key_hold_ms: f64) -> f64 {
    match hold_ms {
        Some(hold) => hold / playback_speed,
        None => key_hold_ms,
    }
}

fn should_apply_key_release(
    active_generations: &HashMap<String, u64>,
    key: &str,
    release_generation: u64,
) -> bool {
    active_generations
        .get(key)
        .is_some_and(|generation| *generation == release_generation)
}

fn is_live_scheduled_key_up(
    active_generations: &HashMap<String, u64>,
    key_up: &ScheduledKeyUp,
) -> bool {
    should_apply_key_release(active_generations, &key_up.key, key_up.generation)
}

fn next_live_key_up_deadline(
    active_generations: &HashMap<String, u64>,
    scheduled_key_ups: &[ScheduledKeyUp],
    now: Instant,
) -> Option<Instant> {
    scheduled_key_ups
        .iter()
        .filter(|key_up| {
            is_live_scheduled_key_up(active_generations, key_up) && key_up.deadline_at > now
        })
        .map(|key_up| key_up.deadline_at)
        .min()
}

fn has_live_future_key_ups(
    active_generations: &HashMap<String, u64>,
    scheduled_key_ups: &[ScheduledKeyUp],
    now: Instant,
) -> bool {
    next_live_key_up_deadline(active_generations, scheduled_key_ups, now).is_some()
}

fn should_finish_playback(
    position_ms: f64,
    finish_ms: f64,
    active_generations: &HashMap<String, u64>,
    scheduled_key_ups: &[ScheduledKeyUp],
    now: Instant,
) -> bool {
    position_ms >= finish_ms && !has_live_future_key_ups(active_generations, scheduled_key_ups, now)
}

fn next_playback_deadline_ms(
    position_ms: f64,
    finish_ms: f64,
    next_progress_event_ms: f64,
    next_group_start_ms: Option<f64>,
    active_generations: &HashMap<String, u64>,
    scheduled_key_ups: &[ScheduledKeyUp],
    now: Instant,
) -> Option<f64> {
    let live_key_up_deadline =
        next_live_key_up_deadline(active_generations, scheduled_key_ups, now);
    let mut deadlines = Vec::new();

    if position_ms < finish_ms {
        deadlines.push(finish_ms);
        deadlines.push(next_progress_event_ms);
        if let Some(group_start_ms) = next_group_start_ms {
            deadlines.push(group_start_ms);
        }
    } else if live_key_up_deadline.is_none() {
        deadlines.push(position_ms);
    }

    if let Some(key_up_deadline) = live_key_up_deadline {
        deadlines.push(
            key_up_deadline
                .checked_duration_since(now)
                .unwrap_or(Duration::ZERO)
                .as_secs_f64()
                * 1000.0
                + position_ms,
        );
    }

    deadlines
        .into_iter()
        .min_by(|left, right| left.total_cmp(right))
}

fn keys_due_for_release(
    active_generations: &HashMap<String, u64>,
    due_key_ups: &[ScheduledKeyUp],
) -> Vec<String> {
    due_key_ups
        .iter()
        .filter(|key_up| {
            should_apply_key_release(active_generations, &key_up.key, key_up.generation)
        })
        .map(|key_up| key_up.key.clone())
        .collect()
}

fn should_clear_current_session(
    current_session_id: Option<u64>,
    finishing_session_id: u64,
) -> bool {
    current_session_id.is_some_and(|session_id| session_id == finishing_session_id)
}

fn unique_timeline_keys(groups: &[TimelineGroup]) -> Vec<String> {
    let mut seen_keys = HashSet::new();
    let mut unique = Vec::new();

    for group in groups {
        for key in group.keys.iter() {
            if seen_keys.insert(key.key.clone()) {
                unique.push(key.key.clone());
            }
        }
    }

    unique
}

fn debug_timing(label: &str, started_at: Instant, phases: &[(&str, Duration)]) {
    #[cfg(debug_assertions)]
    {
        let phase_text = phases
            .iter()
            .map(|(phase, duration)| format!("{phase}={:.2}ms", duration.as_secs_f64() * 1000.0))
            .collect::<Vec<_>>()
            .join(", ");

        eprintln!(
            "[background-playback timing] {label}: total={:.2}ms; {phase_text}",
            started_at.elapsed().as_secs_f64() * 1000.0
        );
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = (label, started_at, phases);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(note_interval_delay_ms: f64, playback_speed: f64) -> PlaybackOptions {
        PlaybackOptions {
            note_interval_delay_ms,
            playback_speed,
        }
    }

    fn planned_key(key: &str) -> PlannedKey {
        PlannedKey {
            key: key.to_string(),
            hold_ms: None,
        }
    }

    fn held_key(key: &str, hold_ms: f64) -> PlannedKey {
        PlannedKey {
            key: key.to_string(),
            hold_ms: Some(hold_ms),
        }
    }

    fn group_key_names(group: &TimelineGroup) -> Vec<String> {
        group.keys.iter().map(|key| key.key.clone()).collect()
    }

    fn plan() -> Vec<BackgroundPlaybackPlanEvent> {
        vec![
            BackgroundPlaybackPlanEvent {
                time_ms: 1000.0,
                keys: vec![planned_key("Key3")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec![planned_key("Key0")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec![planned_key("Key1")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec![planned_key("Key2")],
            },
        ]
    }

    fn test_session(session_id: u64) -> BackgroundPlaybackSession {
        let (command_tx, _command_rx) = mpsc::channel();

        BackgroundPlaybackSession {
            command_tx,
            session_id,
            worker: None,
        }
    }

    fn test_session_with_receiver(
        session_id: u64,
    ) -> (BackgroundPlaybackSession, Receiver<PlaybackCommand>) {
        let (command_tx, command_rx) = mpsc::channel();

        (
            BackgroundPlaybackSession {
                command_tx,
                session_id,
                worker: None,
            },
            command_rx,
        )
    }

    #[test]
    fn timeline_groups_and_orders_events() {
        let timeline = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();

        assert_eq!(timeline.groups.len(), 3);
        assert_eq!(group_key_names(&timeline.groups[0]), ["Key0"]);
        assert_eq!(group_key_names(&timeline.groups[1]), ["Key1", "Key2"]);
        assert_eq!(group_key_names(&timeline.groups[2]), ["Key3"]);
    }

    #[test]
    fn timeline_matches_typescript_duration_semantics() {
        let timeline = build_timeline(&plan(), &options(50.0, 2.0)).unwrap();

        assert_eq!(timeline.groups[0].adjusted_start_ms, 0.0);
        assert_eq!(timeline.groups[1].adjusted_start_ms, 300.0);
        assert_eq!(timeline.groups[2].adjusted_start_ms, 600.0);
        assert_eq!(timeline.total_ms, 600.0);
        assert_eq!(timeline.finish_ms, 750.0);
    }

    #[test]
    fn negative_interval_delay_does_not_create_negative_gaps() {
        let timeline = build_timeline(&plan(), &options(-1000.0, 1.0)).unwrap();

        assert_eq!(timeline.groups[1].adjusted_start_ms, 0.0);
        assert_eq!(timeline.groups[2].adjusted_start_ms, 0.0);
    }

    #[test]
    fn seek_skips_groups_at_or_before_positive_position() {
        let timeline = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();

        assert_eq!(find_next_group_index(&timeline, 0.0), 0);
        assert_eq!(find_next_group_index(&timeline, 500.0), 2);
        assert_eq!(find_next_group_index(&timeline, 750.0), 2);
        assert_eq!(find_next_group_index(&timeline, 1000.0), 3);
    }

    #[test]
    fn option_update_can_preserve_logical_position() {
        let first = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();
        let remap = capture_option_update_remap(&first, 250.0, 1);
        let second = build_timeline_from_groups(&first.groups, &options(50.0, 2.0)).unwrap();
        let (position_ms, next_group_index) = remap_position_after_options_update(&remap, &second);

        assert_eq!(second.total_ms, 600.0);
        assert_eq!(next_group_index, 1);
        assert_eq!(position_ms, 150.0);
    }

    #[test]
    fn speeding_up_mid_gap_does_not_skip_next_group() {
        let first = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();
        let remap = capture_option_update_remap(&first, 250.0, 1);
        let second = build_timeline_from_groups(&first.groups, &options(0.0, 2.0)).unwrap();
        let (position_ms, next_group_index) = remap_position_after_options_update(&remap, &second);

        assert_eq!(next_group_index, 1);
        assert!(position_ms < second.groups[1].adjusted_start_ms);
        assert_eq!(position_ms, 125.0);
    }

    #[test]
    fn slowing_down_mid_gap_does_not_replay_completed_group() {
        let first = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();
        let remap = capture_option_update_remap(&first, 750.0, 2);
        let second = build_timeline_from_groups(&first.groups, &options(0.0, 0.5)).unwrap();
        let (position_ms, next_group_index) = remap_position_after_options_update(&remap, &second);

        assert_eq!(next_group_index, 2);
        assert!(position_ms > second.groups[1].adjusted_start_ms);
        assert!(position_ms < second.groups[2].adjusted_start_ms);
        assert_eq!(position_ms, 1500.0);
    }

    #[test]
    fn interval_change_mid_gap_preserves_pending_group() {
        let first = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();
        let remap = capture_option_update_remap(&first, 750.0, 2);
        let second = build_timeline_from_groups(&first.groups, &options(100.0, 1.0)).unwrap();
        let (position_ms, next_group_index) = remap_position_after_options_update(&remap, &second);

        assert_eq!(next_group_index, 2);
        assert_eq!(position_ms, 900.0);
    }

    #[test]
    fn option_update_preserves_tail_segment_ratio() {
        let first = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();
        let remap = capture_option_update_remap(&first, 1150.0, first.groups.len());
        let second = build_timeline_from_groups(&first.groups, &options(0.0, 2.0)).unwrap();
        let (position_ms, next_group_index) = remap_position_after_options_update(&remap, &second);

        assert_eq!(next_group_index, second.groups.len());
        assert_eq!(position_ms, 575.0);
        assert!(position_ms > second.total_ms);
        assert!(position_ms < second.finish_ms);
    }

    #[test]
    fn build_source_groups_dedupes_same_key_keeping_longest_hold() {
        let groups = build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![
                held_key("y", 500.0),
                planned_key("y"),
                held_key("y", 1500.0),
                planned_key("u"),
            ],
        }])
        .unwrap();

        assert_eq!(groups[0].keys.len(), 2);
        assert_eq!(groups[0].keys[0], held_key("y", 1500.0));
        assert_eq!(groups[0].keys[1], planned_key("u"));
    }

    #[test]
    fn build_source_groups_rejects_invalid_holds() {
        for hold in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let result = build_source_groups(&[BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec![held_key("y", hold)],
            }]);

            assert!(result.is_err(), "hold {hold} should be rejected");
        }
    }

    #[test]
    fn explicit_hold_limit_is_inclusive() {
        assert!(build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![held_key("y", MAX_EXPLICIT_HOLD_MS)],
        }])
        .is_ok());
        assert!(build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![held_key("y", MAX_EXPLICIT_HOLD_MS + 1.0)],
        }])
        .is_err());
    }

    #[test]
    fn negative_interval_keeps_early_long_hold_end() {
        let timeline = build_timeline(
            &[
                BackgroundPlaybackPlanEvent {
                    time_ms: 0.0,
                    keys: vec![held_key("y", 1000.0)],
                },
                BackgroundPlaybackPlanEvent {
                    time_ms: 500.0,
                    keys: vec![planned_key("u")],
                },
            ],
            &options(-200.0, 1.0),
        )
        .unwrap();

        assert_eq!(timeline.groups[1].adjusted_start_ms, 300.0);
        assert_eq!(timeline.total_ms, 1000.0);
        assert_eq!(timeline.finish_ms, 1000.0);
    }

    #[test]
    fn positive_interval_and_speed_use_adjusted_group_hold_ends() {
        for (speed, expected_total) in [(0.5, 2000.0), (1.0, 1000.0), (2.0, 500.0)] {
            let timeline = build_timeline(
                &[
                    BackgroundPlaybackPlanEvent {
                        time_ms: 0.0,
                        keys: vec![held_key("y", 1000.0)],
                    },
                    BackgroundPlaybackPlanEvent {
                        time_ms: 500.0,
                        keys: vec![planned_key("u")],
                    },
                ],
                &options(200.0, speed),
            )
            .unwrap();

            assert_eq!(timeline.total_ms, expected_total);
            assert!(timeline.finish_ms >= timeline.total_ms);
        }
    }

    #[test]
    fn effective_hold_deadline_conversion_fails_without_panicking() {
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::NAN).is_err());
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::INFINITY).is_err());
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::MAX).is_err());
    }

    #[test]
    fn timeline_total_includes_scaled_sustain_tail() {
        let timeline = build_timeline(
            &[
                BackgroundPlaybackPlanEvent {
                    time_ms: 0.0,
                    keys: vec![held_key("y", 5000.0)],
                },
                BackgroundPlaybackPlanEvent {
                    time_ms: 1000.0,
                    keys: vec![planned_key("u")],
                },
            ],
            &options(0.0, 2.0),
        )
        .unwrap();

        assert_eq!(timeline.total_ms, 2500.0);
        assert_eq!(timeline.finish_ms, 2500.0);
    }

    #[test]
    fn timeline_without_holds_keeps_note_highlight_finish() {
        let timeline = build_timeline(
            &[BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec![planned_key("y")],
            }],
            &options(0.0, 1.0),
        )
        .unwrap();

        assert_eq!(timeline.total_ms, 0.0);
        assert_eq!(timeline.finish_ms, NOTE_HIGHLIGHT_MS);
    }

    #[test]
    fn effective_hold_scales_with_playback_speed() {
        assert_eq!(effective_hold_ms(Some(1000.0), 2.0, 40.0), 500.0);
        assert_eq!(effective_hold_ms(Some(1000.0), 0.5, 40.0), 2000.0);
        assert_eq!(effective_hold_ms(None, 2.0, 40.0), 40.0);
    }

    #[test]
    fn stale_release_does_not_match_newer_generation() {
        let active = HashMap::from([("A".to_string(), 2_u64)]);
        let stale = ScheduledKeyUp {
            deadline_at: Instant::now(),
            generation: 1,
            key: "A".to_string(),
        };

        assert!(!should_apply_key_release(
            &active,
            &stale.key,
            stale.generation
        ));
        assert!(should_apply_key_release(&active, "A", 2));
    }

    #[test]
    fn live_future_key_up_prevents_finish_after_timeline_end() {
        let now = Instant::now();
        let active = HashMap::from([("A".to_string(), 2_u64)]);
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: now + Duration::from_millis(1000),
            generation: 2,
            key: "A".to_string(),
        }];

        assert!(has_live_future_key_ups(&active, &scheduled, now));
        assert!(!should_finish_playback(
            500.0, 500.0, &active, &scheduled, now
        ));
    }

    #[test]
    fn stale_generation_key_up_does_not_delay_finish() {
        let now = Instant::now();
        let active = HashMap::from([("A".to_string(), 2_u64)]);
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: now + Duration::from_millis(1000),
            generation: 1,
            key: "A".to_string(),
        }];

        assert!(!has_live_future_key_ups(&active, &scheduled, now));
        assert!(should_finish_playback(
            500.0, 500.0, &active, &scheduled, now
        ));
    }

    #[test]
    fn playback_finishes_immediately_after_final_live_key_up() {
        let deadline = Instant::now();
        let active = HashMap::from([("A".to_string(), 2_u64)]);
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: deadline,
            generation: 2,
            key: "A".to_string(),
        }];

        assert!(should_finish_playback(
            500.0, 500.0, &active, &scheduled, deadline,
        ));
    }

    #[test]
    fn expired_finish_waits_at_live_key_up_without_busy_loop() {
        let now = Instant::now();
        let active = HashMap::from([("A".to_string(), 2_u64)]);
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: now + Duration::from_millis(750),
            generation: 2,
            key: "A".to_string(),
        }];

        assert_eq!(
            next_playback_deadline_ms(500.0, 500.0, 650.0, None, &active, &scheduled, now,),
            Some(1250.0),
        );
    }

    #[test]
    fn option_timeline_updates_do_not_reschedule_existing_key_up() {
        let now = Instant::now();
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: now + Duration::from_millis(2000),
            generation: 1,
            key: "A".to_string(),
        }];
        let original = scheduled.clone();
        let source = build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![held_key("A", 1000.0)],
        }])
        .unwrap();

        let faster = build_timeline_from_groups(&source, &options(0.0, 2.0)).unwrap();
        let slower = build_timeline_from_groups(&source, &options(0.0, 0.5)).unwrap();

        assert_eq!(faster.finish_ms, 500.0);
        assert_eq!(slower.finish_ms, 2000.0);
        assert_eq!(scheduled, original);
        assert!(!should_finish_playback(
            faster.finish_ms,
            faster.finish_ms,
            &HashMap::from([("A".to_string(), 1_u64)]),
            &scheduled,
            now,
        ));
    }

    #[test]
    fn point_note_finish_is_not_delayed_by_expired_key_up() {
        let now = Instant::now();
        let active = HashMap::from([("A".to_string(), 1_u64)]);
        let scheduled = vec![ScheduledKeyUp {
            deadline_at: now - Duration::from_millis(1),
            generation: 1,
            key: "A".to_string(),
        }];

        assert!(should_finish_playback(
            NOTE_HIGHLIGHT_MS,
            NOTE_HIGHLIGHT_MS,
            &active,
            &scheduled,
            now,
        ));
    }

    #[test]
    fn due_releases_are_collected_as_one_output_chord() {
        let active = HashMap::from([("A".to_string(), 1_u64), ("B".to_string(), 2_u64)]);
        let due = vec![
            ScheduledKeyUp {
                deadline_at: Instant::now(),
                generation: 1,
                key: "A".to_string(),
            },
            ScheduledKeyUp {
                deadline_at: Instant::now(),
                generation: 2,
                key: "B".to_string(),
            },
            ScheduledKeyUp {
                deadline_at: Instant::now(),
                generation: 1,
                key: "B".to_string(),
            },
        ];

        assert_eq!(keys_due_for_release(&active, &due), ["A", "B"]);
    }

    #[test]
    fn late_key_down_still_gets_full_hold_duration() {
        let planned_at = Instant::now();
        let actual_sent_at = planned_at + Duration::from_millis(75);
        let deadline = key_up_deadline_from_actual_send(actual_sent_at, 30.0).unwrap();

        assert_eq!(
            deadline.duration_since(actual_sent_at),
            Duration::from_millis(30)
        );
    }

    #[test]
    fn old_session_cannot_clear_newer_current_session() {
        assert!(!should_clear_current_session(Some(2), 1));
        assert!(should_clear_current_session(Some(2), 2));
        assert!(!should_clear_current_session(None, 2));
    }

    #[test]
    fn shutdown_takes_current_session_from_manager() {
        let mut manager = BackgroundPlaybackManager {
            current: Some(test_session(7)),
            next_session_id: 8,
        };
        let session = take_current_session(&mut manager);

        assert_eq!(session.map(|session| session.session_id), Some(7));
        assert!(manager.current.is_none());
    }

    #[test]
    fn targeted_stop_takes_only_matching_current_session() {
        let mut manager = BackgroundPlaybackManager {
            current: Some(test_session(7)),
            next_session_id: 8,
        };

        assert!(take_session_if_current(&mut manager, 6).is_none());
        assert_eq!(
            manager.current.as_ref().map(|session| session.session_id),
            Some(7)
        );

        let session = take_session_if_current(&mut manager, 7);
        assert_eq!(session.map(|session| session.session_id), Some(7));
        assert!(manager.current.is_none());
    }

    #[test]
    fn replacement_takes_the_old_session_before_installing_the_new_one() {
        let manager = Mutex::new(BackgroundPlaybackManager {
            current: Some(test_session(7)),
            next_session_id: 8,
        });

        let old_session = take_current_session_from(&manager);

        assert_eq!(old_session.map(|session| session.session_id), Some(7));
        assert!(manager.lock().unwrap().current.is_none());

        manager.lock().unwrap().current = Some(test_session(8));
        assert_eq!(
            manager
                .lock()
                .unwrap()
                .current
                .as_ref()
                .map(|session| session.session_id),
            Some(8)
        );
    }

    #[test]
    fn taking_a_session_releases_the_manager_lock_before_joining() {
        let manager = Mutex::new(BackgroundPlaybackManager {
            current: Some(test_session(7)),
            next_session_id: 8,
        });

        let old_session = take_current_session_from(&manager);

        assert!(old_session.is_some());
        assert!(manager.try_lock().is_ok());
    }

    #[test]
    fn stale_session_commands_do_not_reach_the_current_session() {
        let (current_session, current_receiver) = test_session_with_receiver(8);
        let manager = BackgroundPlaybackManager {
            current: Some(current_session),
            next_session_id: 9,
        };

        assert!(command_sender_for_current_session(&manager, 7).is_none());

        command_sender_for_current_session(&manager, 8)
            .unwrap()
            .send(PlaybackCommand::Pause)
            .unwrap();

        assert!(matches!(
            current_receiver.try_recv(),
            Ok(PlaybackCommand::Pause)
        ));
    }

    #[test]
    fn foreground_and_background_modes_use_distinct_events_with_the_shared_lifecycle() {
        assert_eq!(
            PlaybackOutputMode::Background.event_name(),
            BACKGROUND_PLAYBACK_EVENT
        );
        assert_eq!(
            PlaybackOutputMode::Foreground.event_name(),
            FOREGROUND_PLAYBACK_EVENT
        );
        assert!(std::ptr::eq(
            PlaybackOutputMode::Background.shared_manager(),
            PlaybackOutputMode::Foreground.shared_manager(),
        ));

        let manager = Mutex::new(BackgroundPlaybackManager {
            current: Some(test_session(7)),
            next_session_id: 8,
        });

        let previous_session = take_current_session_from(&manager);
        assert_eq!(previous_session.map(|session| session.session_id), Some(7));
        manager.lock().unwrap().current = Some(test_session(8));
        assert_eq!(
            manager
                .lock()
                .unwrap()
                .current
                .as_ref()
                .map(|session| session.session_id),
            Some(8)
        );
    }

    #[test]
    fn clamp_progress_handles_invalid_values() {
        assert_eq!(clamp_progress(f64::NAN, 100.0), 0.0);
        assert_eq!(clamp_progress(-1.0, 100.0), 0.0);
        assert_eq!(clamp_progress(150.0, 100.0), 100.0);
    }

    #[test]
    fn prepared_plan_cache_refreshes_lru_access_order() {
        let mut cache = PreparedPlaybackPlanCache {
            entries: HashMap::new(),
            next_plan_id: 1,
            order: VecDeque::new(),
        };
        let first =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);
        let second =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);

        get_prepared_plan_from_cache(&mut cache, first).unwrap();
        let third =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);

        assert!(cache.entries.contains_key(&first));
        assert!(!cache.entries.contains_key(&second));
        assert!(cache.entries.contains_key(&third));
        assert_eq!(
            cache.order.into_iter().collect::<Vec<_>>(),
            vec![first, third]
        );
    }

    #[test]
    fn adjusted_timelines_share_prepared_source_key_arrays() {
        let prepared_plan = build_prepared_plan(&plan()).unwrap();
        let first = build_timeline_from_groups(&prepared_plan.groups, &options(0.0, 1.0)).unwrap();
        let second =
            build_timeline_from_groups(&prepared_plan.groups, &options(50.0, 2.0)).unwrap();

        assert!(Arc::ptr_eq(
            &first.groups[1].keys,
            &prepared_plan.groups[1].keys
        ));
        assert!(Arc::ptr_eq(
            &second.groups[1].keys,
            &prepared_plan.groups[1].keys
        ));
        assert_eq!(group_key_names(&first.groups[1]), ["Key1", "Key2"]);
        assert_eq!(group_key_names(&second.groups[1]), ["Key1", "Key2"]);
        assert_eq!(first.groups[1].adjusted_start_ms, 500.0);
        assert_eq!(second.groups[1].adjusted_start_ms, 300.0);
    }
}
