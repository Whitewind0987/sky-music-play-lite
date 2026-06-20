use super::target_window_message::{
    send_window_message_key_down_group, send_window_message_key_up_group,
    validate_window_message_key_group,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BACKGROUND_PLAYBACK_EVENT: &str = "background-playback-event";
const NOTE_HIGHLIGHT_MS: f64 = 300.0;
const PROGRESS_EVENT_INTERVAL_MS: f64 = 150.0;
const TARGET_MESSAGE_METHOD_POST: &str = "post-message";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPlaybackPlanEvent {
    pub time_ms: f64,
    pub keys: Vec<String>,
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
    keys: Vec<String>,
}

#[derive(Debug, Clone)]
struct PlaybackTimeline {
    finish_ms: f64,
    groups: Vec<TimelineGroup>,
    total_ms: f64,
}

#[derive(Debug, Clone)]
struct ScheduledKeyUp {
    deadline_ms: f64,
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

struct BackgroundPlaybackManager {
    current: Option<BackgroundPlaybackSession>,
    next_session_id: u64,
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
    compatibility_profile: String,
    hwnd: String,
    key_hold_ms: f64,
    next_generation: u64,
    next_group_index: usize,
    next_progress_event_ms: f64,
    options: PlaybackOptions,
    position_ms: f64,
    scheduled_key_ups: Vec<ScheduledKeyUp>,
    session_id: u64,
    started_at: Instant,
    state: WorkerPlaybackState,
    timeline: PlaybackTimeline,
}

static BACKGROUND_PLAYBACK_MANAGER: OnceLock<Mutex<BackgroundPlaybackManager>> = OnceLock::new();

pub fn start_background_playback(
    app_handle: AppHandle,
    request: BackgroundPlaybackStartRequest,
) -> Result<BackgroundPlaybackStartResponse, String> {
    let options = PlaybackOptions {
        note_interval_delay_ms: request.note_interval_delay_ms,
        playback_speed: normalize_playback_speed(request.playback_speed)?,
    };
    let timeline = build_timeline(&request.plan, &options)?;

    validate_start_request(&request)?;
    stop_current_session();

    let initial_progress_ms = clamp_progress(
        request.initial_progress_ms.unwrap_or(0.0),
        timeline.total_ms,
    );
    let session_id = next_session_id();
    let (command_tx, command_rx) = mpsc::channel();
    let worker_timeline = timeline.clone();
    let worker = BackgroundPlaybackWorker {
        active_generations: HashMap::new(),
        app_handle,
        command_rx,
        compatibility_profile: request.compatibility_profile,
        hwnd: request.hwnd,
        key_hold_ms: request.key_hold_ms as f64,
        next_generation: 1,
        next_group_index: find_next_group_index(&worker_timeline, initial_progress_ms),
        next_progress_event_ms: initial_progress_ms + PROGRESS_EVENT_INTERVAL_MS,
        options,
        position_ms: initial_progress_ms,
        scheduled_key_ups: Vec::new(),
        session_id,
        started_at: Instant::now(),
        state: WorkerPlaybackState::Playing,
        timeline: worker_timeline,
    };
    let worker_handle = thread::spawn(move || worker.run());

    {
        let mut manager = manager()
            .lock()
            .expect("background playback manager poisoned");
        manager.current = Some(BackgroundPlaybackSession {
            session_id,
            command_tx,
            worker: Some(worker_handle),
        });
    }

    Ok(BackgroundPlaybackStartResponse {
        session_id,
        total_ms: timeline.total_ms,
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
    let session = {
        let mut manager = manager()
            .lock()
            .expect("background playback manager poisoned");

        if !matches!(manager.current.as_ref(), Some(current) if current.session_id == session_id) {
            return Ok(());
        }

        manager.current.take()
    };

    if let Some(session) = session {
        session.stop_and_join();
    }

    Ok(())
}

fn manager() -> &'static Mutex<BackgroundPlaybackManager> {
    BACKGROUND_PLAYBACK_MANAGER.get_or_init(|| {
        Mutex::new(BackgroundPlaybackManager {
            current: None,
            next_session_id: 1,
        })
    })
}

fn next_session_id() -> u64 {
    let mut manager = manager()
        .lock()
        .expect("background playback manager poisoned");
    let session_id = manager.next_session_id;
    manager.next_session_id = manager.next_session_id.saturating_add(1).max(1);
    session_id
}

fn stop_current_session() {
    let session = {
        let mut manager = manager()
            .lock()
            .expect("background playback manager poisoned");
        manager.current.take()
    };

    if let Some(session) = session {
        session.stop_and_join();
    }
}

fn send_command_to_session(session_id: u64, command: PlaybackCommand) -> Result<(), String> {
    let command_tx = {
        let manager = manager()
            .lock()
            .expect("background playback manager poisoned");

        match manager.current.as_ref() {
            Some(session) if session.session_id == session_id => session.command_tx.clone(),
            _ => return Ok(()),
        }
    };

    command_tx
        .send(command)
        .map_err(|_| "Background playback worker is no longer available.".to_string())
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

                if self.position_ms >= self.timeline.total_ms {
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
                self.options = options;
                match build_timeline_from_groups(&self.timeline.groups, &self.options) {
                    Ok(timeline) => {
                        self.timeline = timeline;
                        self.position_ms = clamp_progress(self.position_ms, self.timeline.total_ms);
                        self.next_group_index =
                            find_next_group_index(&self.timeline, self.position_ms);
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

        self.release_due_key_ups(due_position)?;

        while self.next_group_index < self.timeline.groups.len()
            && self.timeline.groups[self.next_group_index].adjusted_start_ms <= due_position
        {
            let group = self.timeline.groups[self.next_group_index].clone();
            self.play_group(&group)?;
            self.next_group_index += 1;
            self.release_due_key_ups(due_position)?;
        }

        if due_position >= self.next_progress_event_ms {
            self.emit_progress();
            self.next_progress_event_ms = due_position + PROGRESS_EVENT_INTERVAL_MS;
        }

        if due_position >= self.timeline.finish_ms {
            self.finish();
        }

        Ok(())
    }

    fn play_group(&mut self, group: &TimelineGroup) -> Result<(), String> {
        let keys = unique_keys(&group.keys);
        let keys_to_release = keys
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

        if let Err(error) = self.send_key_down_group(&keys) {
            let _ = self.send_key_up_group(&keys);
            return Err(error);
        }

        for key in keys {
            let generation = self.next_generation;
            self.next_generation = self.next_generation.saturating_add(1).max(1);
            self.active_generations.insert(key.clone(), generation);
            self.scheduled_key_ups.push(ScheduledKeyUp {
                deadline_ms: group.adjusted_start_ms + self.key_hold_ms,
                generation,
                key,
            });
        }

        Ok(())
    }

    fn release_due_key_ups(&mut self, due_position: f64) -> Result<(), String> {
        let mut due_key_ups = Vec::new();
        let mut pending_key_ups = Vec::new();

        for key_up in self.scheduled_key_ups.drain(..) {
            if key_up.deadline_ms <= due_position {
                due_key_ups.push(key_up);
            } else {
                pending_key_ups.push(key_up);
            }
        }

        self.scheduled_key_ups = pending_key_ups;

        for key_up in due_key_ups {
            if self
                .active_generations
                .get(&key_up.key)
                .is_some_and(|generation| *generation == key_up.generation)
            {
                self.send_key_up_group(std::slice::from_ref(&key_up.key))?;
                self.active_generations.remove(&key_up.key);
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
        self.position_ms = self.timeline.total_ms;
        self.state = WorkerPlaybackState::Stopped;
        self.emit_progress();
        self.emit_event("finished", None, None, None);
        clear_current_session(self.session_id);
    }

    fn stop_without_event(&mut self) {
        self.release_all_active_keys();
        self.state = WorkerPlaybackState::Stopped;
        clear_current_session(self.session_id);
    }

    fn handle_error(&mut self, error: String) {
        self.release_all_active_keys();
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
        let mut deadlines = vec![self.timeline.finish_ms, self.next_progress_event_ms];

        if let Some(group) = self.timeline.groups.get(self.next_group_index) {
            deadlines.push(group.adjusted_start_ms);
        }

        if let Some(key_up_deadline) = self
            .scheduled_key_ups
            .iter()
            .map(|key_up| key_up.deadline_ms)
            .min_by(|left, right| left.total_cmp(right))
        {
            deadlines.push(key_up_deadline);
        }

        deadlines
            .into_iter()
            .min_by(|left, right| left.total_cmp(right))
    }

    fn send_key_down_group(&self, keys: &[String]) -> Result<(), String> {
        send_window_message_key_down_group(
            &self.hwnd,
            keys,
            TARGET_MESSAGE_METHOD_POST,
            &self.compatibility_profile,
        )
    }

    fn send_key_up_group(&self, keys: &[String]) -> Result<(), String> {
        send_window_message_key_up_group(
            &self.hwnd,
            keys,
            TARGET_MESSAGE_METHOD_POST,
            &self.compatibility_profile,
        )
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
            BACKGROUND_PLAYBACK_EVENT,
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

    if matches!(manager.current.as_ref(), Some(current) if current.session_id == session_id) {
        manager.current = None;
    }
}

fn validate_start_request(request: &BackgroundPlaybackStartRequest) -> Result<(), String> {
    if request.plan.is_empty() {
        return Err("Background playback plan must contain at least one event.".to_string());
    }

    if request.key_hold_ms == 0 {
        return Err("Background playback key hold duration must be greater than zero.".to_string());
    }

    for event in &request.plan {
        validate_window_message_key_group(
            &request.hwnd,
            &event.keys,
            TARGET_MESSAGE_METHOD_POST,
            &request.compatibility_profile,
        )?;
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

fn build_timeline(
    plan: &[BackgroundPlaybackPlanEvent],
    options: &PlaybackOptions,
) -> Result<PlaybackTimeline, String> {
    let mut grouped_events = plan.to_vec();
    grouped_events.sort_by(|left, right| left.time_ms.total_cmp(&right.time_ms));

    let mut groups = Vec::<TimelineGroup>::new();

    for event in grouped_events {
        if !event.time_ms.is_finite() {
            return Err("Background playback event time must be finite.".to_string());
        }

        if event.keys.is_empty() {
            return Err("Background playback event must contain at least one key.".to_string());
        }

        if let Some(last_group) = groups.last_mut() {
            if last_group.source_time_ms == event.time_ms {
                last_group.keys.extend(event.keys);
                continue;
            }
        }

        groups.push(TimelineGroup {
            source_time_ms: event.time_ms,
            adjusted_start_ms: 0.0,
            keys: event.keys,
        });
    }

    build_timeline_from_groups(&groups, options)
}

fn build_timeline_from_groups(
    groups: &[TimelineGroup],
    options: &PlaybackOptions,
) -> Result<PlaybackTimeline, String> {
    normalize_playback_speed(options.playback_speed)?;

    if groups.is_empty() {
        return Err("Background playback timeline must contain at least one group.".to_string());
    }

    let mut adjusted_groups = Vec::with_capacity(groups.len());
    let mut adjusted_start_ms = 0.0;
    let mut previous_source_time_ms = 0.0;

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
        adjusted_groups.push(TimelineGroup {
            adjusted_start_ms,
            keys: group.keys.clone(),
            source_time_ms: group.source_time_ms,
        });
    }

    let total_ms = adjusted_groups
        .last()
        .map(|group| group.adjusted_start_ms)
        .unwrap_or(0.0);
    let finish_ms = total_ms + NOTE_HIGHLIGHT_MS / options.playback_speed;

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

fn clamp_progress(progress_ms: f64, total_ms: f64) -> f64 {
    if !progress_ms.is_finite() {
        return 0.0;
    }

    progress_ms.max(0.0).min(total_ms.max(0.0))
}

fn unique_keys(keys: &[String]) -> Vec<String> {
    let mut seen_keys = HashSet::new();
    let mut unique = Vec::new();

    for key in keys {
        if seen_keys.insert(key.clone()) {
            unique.push(key.clone());
        }
    }

    unique
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

    fn plan() -> Vec<BackgroundPlaybackPlanEvent> {
        vec![
            BackgroundPlaybackPlanEvent {
                time_ms: 1000.0,
                keys: vec!["Key3".to_string()],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec!["Key0".to_string()],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec!["Key1".to_string()],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec!["Key2".to_string()],
            },
        ]
    }

    #[test]
    fn timeline_groups_and_orders_events() {
        let timeline = build_timeline(&plan(), &options(0.0, 1.0)).unwrap();

        assert_eq!(timeline.groups.len(), 3);
        assert_eq!(timeline.groups[0].keys, vec!["Key0"]);
        assert_eq!(timeline.groups[1].keys, vec!["Key1", "Key2"]);
        assert_eq!(timeline.groups[2].keys, vec!["Key3"]);
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
        let second = build_timeline_from_groups(&first.groups, &options(50.0, 2.0)).unwrap();

        assert_eq!(find_next_group_index(&second, 300.0), 2);
        assert_eq!(second.total_ms, 600.0);
    }

    #[test]
    fn unique_keys_prevents_duplicate_same_group_downs() {
        assert_eq!(
            unique_keys(&[
                "A".to_string(),
                "A".to_string(),
                "B".to_string(),
                "A".to_string(),
            ]),
            vec!["A".to_string(), "B".to_string()],
        );
    }

    #[test]
    fn stale_release_does_not_match_newer_generation() {
        let mut active = HashMap::from([("A".to_string(), 2_u64)]);
        let stale = ScheduledKeyUp {
            deadline_ms: 10.0,
            generation: 1,
            key: "A".to_string(),
        };

        if active
            .get(&stale.key)
            .is_some_and(|generation| *generation == stale.generation)
        {
            active.remove(&stale.key);
        }

        assert_eq!(active.get("A"), Some(&2));
    }

    #[test]
    fn clamp_progress_handles_invalid_values() {
        assert_eq!(clamp_progress(f64::NAN, 100.0), 0.0);
        assert_eq!(clamp_progress(-1.0, 100.0), 0.0);
        assert_eq!(clamp_progress(150.0, 100.0), 100.0);
    }
}
