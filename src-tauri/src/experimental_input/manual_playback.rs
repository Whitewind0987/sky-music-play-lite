use super::background_playback::{
    clear_current_session, install_manual_session, manual_command_sender_for_current_session,
    next_real_session_id, real_playback_lifecycle, stop_current_session,
    stop_manual_real_playback_session,
};
use super::key_lifecycle::KeyLifecycle;
use super::playback_engine::PlaybackOutput;
use super::prepared_playback_plan::{get_prepared_plan, PreparedPlaybackPlan};
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const MANUAL_PLAYBACK_EVENT: &str = "manual-playback-event";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualBackgroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub hwnd: String,
    pub compatibility_profile: String,
    pub key_hold_ms: u64,
    pub start_group_index: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualForegroundPlaybackPreparedStartRequest {
    pub prepared_plan_id: u64,
    pub key_hold_ms: u64,
    pub start_group_index: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualPlaybackSessionRequest {
    pub session_id: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManualPlaybackStepResponse {
    pub session_id: u64,
    pub group_index: usize,
    pub group_count: usize,
    pub source_time_ms: f64,
    pub total_ms: f64,
    pub has_next_group: bool,
    pub did_advance: bool,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualPlaybackProgress {
    pub current_ms: f64,
    pub total_ms: f64,
    pub group_index: usize,
    pub group_count: usize,
    pub has_next_group: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualPlaybackEvent {
    pub session_id: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<ManualPlaybackProgress>,
    pub state: String,
}

pub(crate) enum ManualPlaybackCommand {
    Step {
        reply: Sender<Result<ManualPlaybackStepResponse, String>>,
    },
    Stop,
}

struct ManualPlaybackCore {
    key_hold_ms: f64,
    key_lifecycle: KeyLifecycle,
    last_group_index: Option<usize>,
    next_group_index: usize,
    output: PlaybackOutput,
    prepared_plan: Arc<PreparedPlaybackPlan>,
    session_id: u64,
    total_ms: f64,
}

struct ManualPlaybackWorker {
    app_handle: Option<AppHandle>,
    command_rx: Receiver<ManualPlaybackCommand>,
    core: ManualPlaybackCore,
    start_rx: Receiver<()>,
}

pub fn start_prepared_manual_background_playback(
    app_handle: AppHandle,
    request: ManualBackgroundPlaybackPreparedStartRequest,
) -> Result<ManualPlaybackStepResponse, String> {
    let prepared_plan = get_prepared_plan(request.prepared_plan_id)?;
    let hwnd = request.hwnd.clone();
    let compatibility_profile = request.compatibility_profile.clone();

    start_manual_playback_from_prepared(
        app_handle,
        prepared_plan,
        request.key_hold_ms,
        request.start_group_index.unwrap_or(0),
        move |keys| PlaybackOutput::prepare_target_window(&hwnd, keys, &compatibility_profile),
    )
}

pub fn start_prepared_manual_foreground_playback(
    app_handle: AppHandle,
    request: ManualForegroundPlaybackPreparedStartRequest,
) -> Result<ManualPlaybackStepResponse, String> {
    let prepared_plan = get_prepared_plan(request.prepared_plan_id)?;

    start_manual_playback_from_prepared(
        app_handle,
        prepared_plan,
        request.key_hold_ms,
        request.start_group_index.unwrap_or(0),
        PlaybackOutput::prepare_foreground,
    )
}

pub fn step_manual_playback(
    request: ManualPlaybackSessionRequest,
) -> Result<ManualPlaybackStepResponse, String> {
    let command_tx = manual_command_sender_for_current_session(request.session_id)
        .ok_or_else(|| "Manual playback session is no longer available.".to_string())?;

    send_step_command(&command_tx)
}

pub fn stop_manual_playback(request: ManualPlaybackSessionRequest) -> Result<(), String> {
    stop_manual_real_playback_session(request.session_id);
    Ok(())
}

fn start_manual_playback_from_prepared<PrepareOutput>(
    app_handle: AppHandle,
    prepared_plan: Arc<PreparedPlaybackPlan>,
    key_hold_ms: u64,
    start_group_index: usize,
    prepare_output: PrepareOutput,
) -> Result<ManualPlaybackStepResponse, String>
where
    PrepareOutput: FnOnce(&[String]) -> Result<PlaybackOutput, String>,
{
    validate_manual_start(key_hold_ms, start_group_index, &prepared_plan)?;
    let total_ms = manual_source_total_ms(&prepared_plan)?;
    let output = prepare_output(&prepared_plan.unique_keys)?;

    let _lifecycle_guard = real_playback_lifecycle()
        .lock()
        .expect("real playback lifecycle poisoned");
    stop_current_session();

    let session_id = next_real_session_id();
    let (command_tx, command_rx) = mpsc::channel();
    let (start_tx, start_rx) = mpsc::channel();
    let worker = ManualPlaybackWorker {
        app_handle: Some(app_handle),
        command_rx,
        core: ManualPlaybackCore::new(
            session_id,
            prepared_plan,
            key_hold_ms as f64,
            start_group_index,
            total_ms,
            output,
        ),
        start_rx,
    };
    let worker_handle = thread::spawn(move || worker.run());

    install_manual_session(session_id, command_tx.clone(), worker_handle);

    if start_tx.send(()).is_err() {
        stop_manual_real_playback_session(session_id);
        return Err("Manual playback worker failed to start.".to_string());
    }

    match send_step_command(&command_tx) {
        Ok(response) => Ok(response),
        Err(error) => {
            stop_manual_real_playback_session(session_id);
            Err(error)
        }
    }
}

fn send_step_command(
    command_tx: &Sender<ManualPlaybackCommand>,
) -> Result<ManualPlaybackStepResponse, String> {
    let (reply_tx, reply_rx) = mpsc::channel();
    command_tx
        .send(ManualPlaybackCommand::Step { reply: reply_tx })
        .map_err(|_| "Manual playback worker is no longer available.".to_string())?;

    reply_rx
        .recv()
        .map_err(|_| "Manual playback worker did not return a Step result.".to_string())?
}

fn validate_manual_start(
    key_hold_ms: u64,
    start_group_index: usize,
    prepared_plan: &PreparedPlaybackPlan,
) -> Result<(), String> {
    if prepared_plan.groups.is_empty() {
        return Err("Manual playback plan must contain at least one group.".to_string());
    }

    if key_hold_ms == 0 {
        return Err("Manual playback key hold duration must be greater than zero.".to_string());
    }

    if start_group_index >= prepared_plan.groups.len() {
        return Err(format!(
            "Manual playback start group index is out of range. index: {start_group_index}, group count: {}",
            prepared_plan.groups.len()
        ));
    }

    Ok(())
}

fn manual_source_total_ms(prepared_plan: &PreparedPlaybackPlan) -> Result<f64, String> {
    let mut total_ms = 0.0_f64;

    for group in prepared_plan.groups.iter() {
        total_ms = total_ms.max(group.source_time_ms);

        for key in group.keys.iter() {
            if let Some(hold_ms) = key.hold_ms {
                total_ms = total_ms.max(group.source_time_ms + hold_ms);
            }
        }
    }

    total_ms = total_ms.max(0.0);
    if !total_ms.is_finite() {
        return Err("Manual playback source timing is not representable.".to_string());
    }
    Duration::try_from_secs_f64(total_ms / 1000.0).map_err(|_| {
        "Manual playback source timing is not representable as a duration.".to_string()
    })?;

    Ok(total_ms)
}

fn manual_effective_hold_ms(explicit_hold_ms: Option<f64>, key_hold_ms: f64) -> f64 {
    explicit_hold_ms.unwrap_or(key_hold_ms)
}

impl ManualPlaybackCore {
    fn new(
        session_id: u64,
        prepared_plan: Arc<PreparedPlaybackPlan>,
        key_hold_ms: f64,
        start_group_index: usize,
        total_ms: f64,
        output: PlaybackOutput,
    ) -> Self {
        Self {
            key_hold_ms,
            key_lifecycle: KeyLifecycle::new(),
            last_group_index: None,
            next_group_index: start_group_index,
            output,
            prepared_plan,
            session_id,
            total_ms,
        }
    }

    fn step(&mut self) -> Result<ManualPlaybackStepResponse, String> {
        self.release_due_key_ups(Instant::now())?;

        if self.next_group_index >= self.prepared_plan.groups.len() {
            return Ok(self.tail_response());
        }

        let group_index = self.next_group_index;
        let group = self.prepared_plan.groups[group_index].clone();
        let keys_with_holds = group
            .keys
            .iter()
            .map(|key| {
                (
                    key.key.clone(),
                    manual_effective_hold_ms(key.hold_ms, self.key_hold_ms),
                )
            })
            .collect::<Vec<_>>();

        self.key_lifecycle
            .trigger_group(&keys_with_holds, &self.output, || {})?;

        self.last_group_index = Some(group_index);
        self.next_group_index += 1;

        Ok(ManualPlaybackStepResponse {
            session_id: self.session_id,
            group_index,
            group_count: self.prepared_plan.groups.len(),
            source_time_ms: group.source_time_ms,
            total_ms: self.total_ms,
            has_next_group: self.next_group_index < self.prepared_plan.groups.len(),
            did_advance: true,
            state: if self.next_group_index < self.prepared_plan.groups.len() {
                "active"
            } else {
                "tail"
            }
            .to_string(),
        })
    }

    fn tail_response(&self) -> ManualPlaybackStepResponse {
        let group_index = self
            .last_group_index
            .expect("manual playback tail requires a played group");
        let group = &self.prepared_plan.groups[group_index];

        ManualPlaybackStepResponse {
            session_id: self.session_id,
            group_index,
            group_count: self.prepared_plan.groups.len(),
            source_time_ms: group.source_time_ms,
            total_ms: self.total_ms,
            has_next_group: false,
            did_advance: false,
            state: "tail".to_string(),
        }
    }

    fn release_due_key_ups(&mut self, now: Instant) -> Result<(), String> {
        self.key_lifecycle.release_due_key_ups(now, &self.output)
    }

    fn release_all_active_keys(&mut self) {
        self.key_lifecycle.release_all_active_keys(&self.output);
    }

    fn next_live_key_up_deadline(&self, now: Instant) -> Option<Instant> {
        self.key_lifecycle.next_live_key_up_deadline(now)
    }

    fn has_active_keys(&self) -> bool {
        self.key_lifecycle.has_active_keys()
    }

    fn should_finish(&self) -> bool {
        self.next_group_index == self.prepared_plan.groups.len()
            && !self.key_lifecycle.has_active_keys()
    }

    fn finished_progress(&self) -> ManualPlaybackProgress {
        ManualPlaybackProgress {
            current_ms: self.total_ms,
            total_ms: self.total_ms,
            group_index: self
                .last_group_index
                .expect("finished manual playback requires a played group"),
            group_count: self.prepared_plan.groups.len(),
            has_next_group: false,
        }
    }
}

impl ManualPlaybackWorker {
    fn run(mut self) {
        if self.start_rx.recv().is_err() {
            self.stop_without_event();
            return;
        }

        loop {
            if let Err(error) = self.core.release_due_key_ups(Instant::now()) {
                self.handle_error(error);
                return;
            }

            if self.core.should_finish() {
                self.finish();
                return;
            }

            let now = Instant::now();
            let command = match self.core.next_live_key_up_deadline(now) {
                Some(deadline) => {
                    let wait = deadline
                        .checked_duration_since(now)
                        .unwrap_or(Duration::ZERO);
                    match self.command_rx.recv_timeout(wait) {
                        Ok(command) => Some(command),
                        Err(RecvTimeoutError::Timeout) => None,
                        Err(RecvTimeoutError::Disconnected) => {
                            self.stop_without_event();
                            return;
                        }
                    }
                }
                None if self.core.has_active_keys() => None,
                None => match self.command_rx.recv() {
                    Ok(command) => Some(command),
                    Err(_) => {
                        self.stop_without_event();
                        return;
                    }
                },
            };

            let Some(command) = command else {
                continue;
            };

            match command {
                ManualPlaybackCommand::Step { reply } => match self.core.step() {
                    Ok(response) => {
                        let _ = reply.send(Ok(response));
                    }
                    Err(error) => {
                        self.handle_error(error.clone());
                        let _ = reply.send(Err(error));
                        return;
                    }
                },
                ManualPlaybackCommand::Stop => {
                    self.stop_without_event();
                    return;
                }
            }
        }
    }

    fn finish(&mut self) {
        self.core.release_all_active_keys();
        let progress = self.core.finished_progress();
        self.emit_event("finished", "finished", None, Some(progress));
        clear_current_session(self.core.session_id);
    }

    fn handle_error(&mut self, error: String) {
        self.core.release_all_active_keys();
        self.emit_event("error", "error", Some(error), None);
        clear_current_session(self.core.session_id);
    }

    fn stop_without_event(&mut self) {
        self.core.release_all_active_keys();
        clear_current_session(self.core.session_id);
    }

    fn emit_event(
        &self,
        event_type: &str,
        state: &str,
        error: Option<String>,
        progress: Option<ManualPlaybackProgress>,
    ) {
        if let Some(app_handle) = &self.app_handle {
            let _ = app_handle.emit(
                MANUAL_PLAYBACK_EVENT,
                ManualPlaybackEvent {
                    session_id: self.core.session_id,
                    event_type: event_type.to_string(),
                    error,
                    progress,
                    state: state.to_string(),
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::playback_engine::TestPlaybackOutputState;
    use super::super::prepared_playback_plan::{PlannedKey, PreparedPlaybackGroup};
    use super::*;
    use std::sync::{Mutex, OnceLock};

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

    fn prepared_plan(groups: Vec<(f64, Vec<PlannedKey>)>) -> Arc<PreparedPlaybackPlan> {
        let groups = groups
            .into_iter()
            .map(|(source_time_ms, keys)| PreparedPlaybackGroup {
                source_time_ms,
                keys: Arc::from(keys),
            })
            .collect::<Vec<_>>();
        let unique_keys = groups
            .iter()
            .flat_map(|group| group.keys.iter().map(|key| key.key.clone()))
            .collect::<Vec<_>>();

        Arc::new(PreparedPlaybackPlan {
            groups: Arc::from(groups),
            unique_keys: Arc::from(unique_keys),
        })
    }

    fn test_core(
        plan: Arc<PreparedPlaybackPlan>,
        key_hold_ms: f64,
    ) -> (ManualPlaybackCore, Arc<Mutex<TestPlaybackOutputState>>) {
        test_core_at(plan, key_hold_ms, 0)
    }

    fn test_core_at(
        plan: Arc<PreparedPlaybackPlan>,
        key_hold_ms: f64,
        start_group_index: usize,
    ) -> (ManualPlaybackCore, Arc<Mutex<TestPlaybackOutputState>>) {
        let total_ms = manual_source_total_ms(&plan).unwrap();
        let output_state = Arc::new(Mutex::new(TestPlaybackOutputState::default()));
        let core = ManualPlaybackCore::new(
            7,
            plan,
            key_hold_ms,
            start_group_index,
            total_ms,
            PlaybackOutput::Test(output_state.clone()),
        );

        (core, output_state)
    }

    fn test_worker_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn chord_is_one_step_and_consecutive_steps_advance_once() {
        let plan = prepared_plan(vec![
            (
                0.0,
                vec![planned_key("A"), planned_key("C"), planned_key("E")],
            ),
            (500.0, vec![planned_key("B")]),
        ]);
        let (mut core, output_state) = test_core(plan, 30.0);

        let first = core.step().unwrap();
        let second = core.step().unwrap();

        assert_eq!(first.group_index, 0);
        assert_eq!(first.group_count, 2);
        assert_eq!(second.group_index, 1);
        assert_eq!(core.next_group_index, 2);
        assert_eq!(
            output_state.lock().unwrap().key_down_groups,
            [
                vec!["A".to_string(), "C".to_string(), "E".to_string()],
                vec!["B".to_string()]
            ]
        );
    }

    #[test]
    fn manual_group_cursor_starts_at_requested_exact_group() {
        let plan = prepared_plan(vec![
            (0.0, vec![planned_key("A")]),
            (500.0, vec![planned_key("B")]),
            (1000.0, vec![planned_key("C")]),
        ]);

        for expected in 0..3 {
            let (mut core, output_state) = test_core_at(plan.clone(), 30.0, expected);
            let response = core.step().unwrap();
            assert_eq!(response.session_id, 7);
            assert_eq!(response.group_index, expected);
            assert_eq!(output_state.lock().unwrap().key_down_groups.len(), 1);
        }
        assert!(validate_manual_start(30, 3, &plan).is_err());
    }

    #[test]
    fn manual_hold_policy_uses_v1_default_and_raw_v2_duration() {
        assert_eq!(manual_effective_hold_ms(None, 30.0), 30.0);
        assert_eq!(manual_effective_hold_ms(Some(2000.0), 30.0), 2000.0);
    }

    #[test]
    fn overlapping_keys_release_independently() {
        let plan = prepared_plan(vec![
            (0.0, vec![held_key("A", 2000.0)]),
            (500.0, vec![held_key("B", 500.0)]),
        ]);
        let (mut core, output_state) = test_core(plan, 30.0);

        core.step().unwrap();
        core.step().unwrap();
        let first_deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();
        core.release_due_key_ups(first_deadline).unwrap();

        assert!(core.key_lifecycle.has_active_keys());
        assert_eq!(
            output_state.lock().unwrap().key_up_groups,
            [vec!["B".to_string()]]
        );

        let second_deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();
        core.release_due_key_ups(second_deadline).unwrap();
        assert!(!core.key_lifecycle.has_active_keys());
    }

    #[test]
    fn same_key_retrigger_uses_shared_generation_protection() {
        let plan = prepared_plan(vec![
            (0.0, vec![held_key("A", 2000.0)]),
            (500.0, vec![held_key("A", 1000.0)]),
        ]);
        let (mut core, output_state) = test_core(plan, 30.0);

        core.step().unwrap();
        core.step().unwrap();

        let state = output_state.lock().unwrap();
        assert_eq!(state.key_down_groups.len(), 2);
        assert_eq!(state.key_up_groups, [vec!["A".to_string()]]);
        drop(state);

        let live_deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();
        core.release_due_key_ups(live_deadline).unwrap();
        assert!(!core.key_lifecycle.has_active_keys());
    }

    #[test]
    fn final_group_enters_tail_and_extra_step_is_idempotent() {
        let plan = prepared_plan(vec![(0.0, vec![held_key("A", 2000.0)])]);
        let (mut core, output_state) = test_core(plan, 30.0);

        let first = core.step().unwrap();
        let extra = core.step().unwrap();

        assert_eq!(first.state, "tail");
        assert!(!first.has_next_group);
        assert!(first.did_advance);
        assert_eq!(extra.state, "tail");
        assert!(!extra.did_advance);
        assert_eq!(extra.group_index, 0);
        assert_eq!(output_state.lock().unwrap().key_down_groups.len(), 1);
        assert!(!core.should_finish());

        let deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();
        core.release_due_key_ups(deadline).unwrap();
        assert!(core.should_finish());
    }

    #[test]
    fn manual_worker_finishes_naturally_after_tail_release() {
        let _guard = test_worker_lock().lock().unwrap();
        let plan = prepared_plan(vec![(0.0, vec![planned_key("A")])]);
        let (core, output_state) = test_core(plan, 1.0);
        let (command_tx, command_rx) = mpsc::channel();
        let (start_tx, start_rx) = mpsc::channel();
        let worker = ManualPlaybackWorker {
            app_handle: None,
            command_rx,
            core,
            start_rx,
        };
        let handle = thread::spawn(move || worker.run());
        start_tx.send(()).unwrap();

        let response = send_step_command(&command_tx).unwrap();
        assert_eq!(response.state, "tail");
        handle.join().unwrap();

        assert_eq!(
            output_state.lock().unwrap().key_up_groups,
            [vec!["A".to_string()]]
        );
    }

    #[test]
    fn released_keys_do_not_finish_while_future_groups_remain() {
        let plan = prepared_plan(vec![
            (0.0, vec![planned_key("A")]),
            (500.0, vec![planned_key("B")]),
        ]);
        let (mut core, _) = test_core(plan, 30.0);

        core.step().unwrap();
        let deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();
        core.release_due_key_ups(deadline).unwrap();

        assert!(!core.key_lifecycle.has_active_keys());
        assert!(!core.should_finish());
        assert_eq!(core.next_group_index, 1);
    }

    #[test]
    fn worker_waits_for_step_after_active_keys_release() {
        let _guard = test_worker_lock().lock().unwrap();
        let plan = prepared_plan(vec![
            (0.0, vec![planned_key("A")]),
            (500.0, vec![planned_key("B")]),
            (1000.0, vec![planned_key("C")]),
        ]);
        let (core, output_state) = test_core(plan, 1.0);
        let (command_tx, command_rx) = mpsc::channel();
        let (start_tx, start_rx) = mpsc::channel();
        let worker = ManualPlaybackWorker {
            app_handle: None,
            command_rx,
            core,
            start_rx,
        };
        let handle = thread::spawn(move || worker.run());
        start_tx.send(()).unwrap();

        let first = send_step_command(&command_tx).unwrap();
        assert_eq!(
            (first.session_id, first.group_index, first.group_count),
            (7, 0, 3)
        );
        assert!(first.has_next_group);
        thread::sleep(Duration::from_millis(10));
        let second = send_step_command(&command_tx).unwrap();
        assert_eq!((second.session_id, second.group_index), (7, 1));
        assert!(second.has_next_group);
        thread::sleep(Duration::from_millis(10));
        let third = send_step_command(&command_tx).unwrap();
        assert_eq!((third.session_id, third.group_index), (7, 2));
        assert!(!third.has_next_group);
        assert_eq!(third.state, "tail");
        handle.join().unwrap();
        assert_eq!(output_state.lock().unwrap().key_up_groups.len(), 3);
    }

    #[test]
    fn stop_releases_active_keys_and_clears_deadlines() {
        let plan = prepared_plan(vec![(0.0, vec![held_key("A", 2000.0)])]);
        let (mut core, output_state) = test_core(plan, 30.0);
        core.step().unwrap();

        core.release_all_active_keys();

        assert!(!core.key_lifecycle.has_active_keys());
        assert!(core.next_live_key_up_deadline(Instant::now()).is_none());
        assert_eq!(
            output_state.lock().unwrap().key_up_groups,
            [vec!["A".to_string()]]
        );
    }

    #[test]
    fn scheduled_release_failure_is_terminal_and_cleanup_remains_possible() {
        let plan = prepared_plan(vec![(0.0, vec![held_key("A", 2000.0)])]);
        let (mut core, output_state) = test_core(plan, 30.0);
        core.step().unwrap();
        output_state.lock().unwrap().next_key_up_error = Some("release failed".to_string());
        let deadline = core.next_live_key_up_deadline(Instant::now()).unwrap();

        assert_eq!(
            core.release_due_key_ups(deadline).unwrap_err(),
            "release failed"
        );
        core.release_all_active_keys();
        assert!(!core.key_lifecycle.has_active_keys());
        assert!(core.next_live_key_up_deadline(Instant::now()).is_none());
    }

    #[test]
    fn worker_scheduled_release_failure_cleans_keys_and_clears_ownership() {
        let _guard = test_worker_lock().lock().unwrap();
        stop_current_session();
        let plan = prepared_plan(vec![(0.0, vec![held_key("A", 1.0)])]);
        let (core, output_state) = test_core(plan, 30.0);
        output_state.lock().unwrap().next_key_up_error = Some("release failed".to_string());
        let (command_tx, command_rx) = mpsc::channel();
        let (start_tx, start_rx) = mpsc::channel();
        let worker = ManualPlaybackWorker {
            app_handle: None,
            command_rx,
            core,
            start_rx,
        };
        let handle = thread::spawn(move || worker.run());
        install_manual_session(7, command_tx.clone(), handle);
        start_tx.send(()).unwrap();

        assert_eq!(send_step_command(&command_tx).unwrap().state, "tail");
        let wait_deadline = Instant::now() + Duration::from_secs(1);
        while manual_command_sender_for_current_session(7).is_some()
            && Instant::now() < wait_deadline
        {
            thread::sleep(Duration::from_millis(1));
        }

        assert!(manual_command_sender_for_current_session(7).is_none());
        let state = output_state.lock().unwrap();
        assert_eq!(state.key_down_groups.len(), 1);
        assert_eq!(state.key_up_groups.len(), 2);
    }

    #[test]
    fn source_total_uses_longest_explicit_end_but_ignores_v1_hold() {
        let v1 = prepared_plan(vec![(1000.0, vec![planned_key("A")])]);
        assert_eq!(manual_source_total_ms(&v1).unwrap(), 1000.0);

        let v2 = prepared_plan(vec![(10000.0, vec![held_key("A", 3000.0)])]);
        assert_eq!(manual_source_total_ms(&v2).unwrap(), 13000.0);

        let mixed = prepared_plan(vec![
            (0.0, vec![held_key("A", 2000.0), planned_key("C")]),
            (1000.0, vec![held_key("B", 5000.0), held_key("D", 500.0)]),
        ]);
        assert_eq!(manual_source_total_ms(&mixed).unwrap(), 6000.0);
    }

    #[test]
    fn queued_worker_steps_consume_consecutive_groups() {
        let _guard = test_worker_lock().lock().unwrap();
        let plan = prepared_plan(vec![
            (0.0, vec![planned_key("A")]),
            (100.0, vec![planned_key("B")]),
            (200.0, vec![planned_key("C")]),
            (300.0, vec![planned_key("D")]),
        ]);
        let (core, output_state) = test_core(plan, 1000.0);
        let (command_tx, command_rx) = mpsc::channel();
        let (start_tx, start_rx) = mpsc::channel();
        let worker = ManualPlaybackWorker {
            app_handle: None,
            command_rx,
            core,
            start_rx,
        };
        let handle = thread::spawn(move || worker.run());
        start_tx.send(()).unwrap();

        let mut replies = Vec::new();
        for _ in 0..4 {
            let (reply_tx, reply_rx) = mpsc::channel();
            command_tx
                .send(ManualPlaybackCommand::Step { reply: reply_tx })
                .unwrap();
            replies.push(reply_rx);
        }

        let indexes = replies
            .into_iter()
            .map(|reply| reply.recv().unwrap().unwrap().group_index)
            .collect::<Vec<_>>();
        assert_eq!(indexes, [0, 1, 2, 3]);

        command_tx.send(ManualPlaybackCommand::Stop).unwrap();
        handle.join().unwrap();
        assert!(!output_state.lock().unwrap().key_up_groups.is_empty());
    }

    #[test]
    fn worker_output_failure_replies_error_cleans_keys_and_clears_ownership() {
        let _guard = test_worker_lock().lock().unwrap();
        stop_current_session();
        let plan = prepared_plan(vec![(0.0, vec![held_key("A", 2000.0)])]);
        let (core, output_state) = test_core(plan, 30.0);
        output_state.lock().unwrap().next_key_down_error = Some("send failed".to_string());
        let (command_tx, command_rx) = mpsc::channel();
        let (start_tx, start_rx) = mpsc::channel();
        let worker = ManualPlaybackWorker {
            app_handle: None,
            command_rx,
            core,
            start_rx,
        };
        let handle = thread::spawn(move || worker.run());
        install_manual_session(7, command_tx.clone(), handle);
        start_tx.send(()).unwrap();

        let error = send_step_command(&command_tx).unwrap_err();

        assert_eq!(error, "send failed");
        assert!(manual_command_sender_for_current_session(7).is_none());
        let state = output_state.lock().unwrap();
        assert_eq!(state.key_down_groups.len(), 1);
        assert_eq!(state.key_up_groups.len(), 1);
    }
}
