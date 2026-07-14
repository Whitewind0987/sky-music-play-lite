use super::window::{scan_sky_windows, SkyWindowIdentity, VerifiedSkyWindow};
use super::CandidateWindow;
use serde::Serialize;
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const SKY_WINDOW_LIFECYCLE_EVENT: &str = "sky-window-lifecycle-event";
const POLL_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkyWindowMonitorSnapshot {
    pub revision: u64,
    pub window: Option<CandidateWindow>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkyWindowLifecycleEvent {
    pub revision: u64,
    pub kind: LifecycleKind,
    pub window: Option<CandidateWindow>,
    pub previous_window: Option<CandidateWindow>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LifecycleKind {
    Available,
    Unavailable,
    Replaced,
}

#[derive(Default)]
struct TransitionState {
    revision: u64,
    current: Option<VerifiedSkyWindow>,
    last_error: Option<String>,
}

impl TransitionState {
    fn snapshot(&self) -> SkyWindowMonitorSnapshot {
        SkyWindowMonitorSnapshot {
            revision: self.revision,
            window: self.current.as_ref().map(|v| v.candidate.clone()),
        }
    }
    fn apply_scan(
        &mut self,
        scan: Result<Vec<VerifiedSkyWindow>, String>,
    ) -> Option<SkyWindowLifecycleEvent> {
        let windows = match scan {
            Ok(value) => {
                self.last_error = None;
                value
            }
            Err(error) => {
                self.last_error = Some(error);
                return None;
            }
        };
        let next = select_window(self.current.as_ref().map(|v| &v.identity), windows);
        let same_identity = self
            .current
            .as_ref()
            .zip(next.as_ref())
            .is_some_and(|(a, b)| a.identity == b.identity);
        if same_identity {
            self.current = next;
            return None;
        }
        let previous_window = self.current.as_ref().map(|v| v.candidate.clone());
        let kind = match (&self.current, &next) {
            (None, None) => return None,
            (None, Some(_)) => LifecycleKind::Available,
            (Some(_), None) => LifecycleKind::Unavailable,
            (Some(_), Some(_)) => LifecycleKind::Replaced,
        };
        self.current = next;
        self.revision += 1;
        Some(SkyWindowLifecycleEvent {
            revision: self.revision,
            kind,
            window: self.current.as_ref().map(|v| v.candidate.clone()),
            previous_window,
        })
    }
}

fn select_window(
    previous: Option<&SkyWindowIdentity>,
    mut windows: Vec<VerifiedSkyWindow>,
) -> Option<VerifiedSkyWindow> {
    if let Some(previous) = previous {
        if let Some(index) = windows.iter().position(|item| &item.identity == previous) {
            return Some(windows.remove(index));
        }
    }
    windows.sort_by(|a, b| {
        a.identity
            .process_id
            .cmp(&b.identity.process_id)
            .then_with(|| a.identity.hwnd.cmp(&b.identity.hwnd))
    });
    windows.into_iter().next()
}

struct Worker {
    stop: mpsc::Sender<()>,
    done: mpsc::Receiver<()>,
    join: JoinHandle<()>,
}
struct Runtime {
    state: std::sync::Arc<Mutex<TransitionState>>,
    worker: Option<Worker>,
}
static RUNTIME: OnceLock<Mutex<Option<Runtime>>> = OnceLock::new();
fn runtime() -> &'static Mutex<Option<Runtime>> {
    RUNTIME.get_or_init(|| Mutex::new(None))
}

pub fn start_sky_window_monitor(app: AppHandle) -> Result<(), String> {
    let mut slot = runtime()
        .lock()
        .map_err(|_| "Sky monitor lock is poisoned.".to_string())?;
    if slot.is_some() {
        return Ok(());
    }
    let state = std::sync::Arc::new(Mutex::new(TransitionState::default()));
    let worker_state = state.clone();
    let (stop, receiver) = mpsc::channel();
    let (done_sender, done) = mpsc::channel();
    let join = thread::Builder::new()
        .name("sky-window-monitor".into())
        .spawn(move || {
            loop {
                let scan = scan_sky_windows();
                let scan_error = scan.as_ref().err().cloned();
                let (event, warning, recovered) = worker_state
                    .lock()
                    .map(|mut state| {
                        let previous_error = state.last_error.clone();
                        let event = state.apply_scan(scan);
                        let warning = state
                            .last_error
                            .clone()
                            .filter(|error| previous_error.as_ref() != Some(error));
                        let recovered = previous_error.is_some() && state.last_error.is_none();
                        (event, warning, recovered)
                    })
                    .unwrap_or((None, scan_error, false));
                if let Some(error) = warning {
                    let _ = crate::app_log::append_internal_log(
                        &app,
                        "warn",
                        "sky-window-monitor",
                        "Sky window scan failed; retaining the last valid target",
                        Some(serde_json::json!({ "error": error })),
                    );
                } else if recovered {
                    let _ = crate::app_log::append_internal_log(
                        &app,
                        "info",
                        "sky-window-monitor",
                        "Sky window scanning recovered",
                        None,
                    );
                }
                if let Some(event) = event {
                    let _ = app.emit(SKY_WINDOW_LIFECYCLE_EVENT, event);
                }
                match receiver.recv_timeout(POLL_INTERVAL) {
                    Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            }
            let _ = done_sender.send(());
        })
        .map_err(|error| format!("Failed to spawn Sky monitor: {error}"))?;
    *slot = Some(Runtime {
        state,
        worker: Some(Worker { stop, done, join }),
    });
    Ok(())
}

pub fn stop_sky_window_monitor() -> Result<(), String> {
    let worker = {
        let mut slot = runtime()
            .lock()
            .map_err(|_| "Sky monitor lock is poisoned.".to_string())?;
        slot.as_mut().and_then(|runtime| runtime.worker.take())
    };
    let Some(worker) = worker else {
        return Ok(());
    };
    let _ = worker.stop.send(());
    if worker.done.recv_timeout(Duration::from_secs(2)).is_err() {
        return Err("Timed out waiting for the Sky monitor worker to stop.".to_string());
    }
    worker
        .join
        .join()
        .map_err(|_| "Sky monitor worker panicked during shutdown.".to_string())
}

pub fn get_sky_window_monitor_state() -> Result<SkyWindowMonitorSnapshot, String> {
    let slot = runtime()
        .lock()
        .map_err(|_| "Sky monitor lock is poisoned.".to_string())?;
    let Some(runtime) = slot.as_ref() else {
        return Ok(SkyWindowMonitorSnapshot {
            revision: 0,
            window: None,
        });
    };
    runtime
        .state
        .lock()
        .map(|state| state.snapshot())
        .map_err(|_| "Sky monitor state lock is poisoned.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(hwnd: &str, pid: u32, created: u64, title: &str) -> VerifiedSkyWindow {
        VerifiedSkyWindow {
            identity: SkyWindowIdentity {
                hwnd: hwnd.into(),
                process_id: pid,
                process_creation_time: Some(created),
            },
            candidate: CandidateWindow {
                hwnd: hwnd.into(),
                title: title.into(),
                class_name: "TgcMainWindow".into(),
                process_name: Some("Sky.exe".into()),
                process_id: Some(pid),
            },
        }
    }
    #[test]
    fn lifecycle_transitions_and_revisions() {
        let mut s = TransitionState::default();
        assert!(s.apply_scan(Ok(vec![])).is_none());
        let a = item("1", 1, 1, "A");
        assert_eq!(
            s.apply_scan(Ok(vec![a.clone()])).unwrap().kind,
            LifecycleKind::Available
        );
        assert!(s.apply_scan(Ok(vec![item("1", 1, 1, "renamed")])).is_none());
        assert_eq!(s.revision, 1);
        assert_eq!(
            s.apply_scan(Ok(vec![])).unwrap().kind,
            LifecycleKind::Unavailable
        );
    }
    #[test]
    fn replacement_and_pid_reuse_are_detected() {
        let mut s = TransitionState::default();
        s.apply_scan(Ok(vec![item("1", 1, 1, "A")]));
        assert_eq!(
            s.apply_scan(Ok(vec![item("2", 2, 2, "B")])).unwrap().kind,
            LifecycleKind::Replaced
        );
        assert_eq!(
            s.apply_scan(Ok(vec![item("2", 2, 3, "C")])).unwrap().kind,
            LifecycleKind::Replaced
        );
    }
    #[test]
    fn scan_error_retains_state_and_is_deduplicated() {
        let mut s = TransitionState::default();
        s.apply_scan(Ok(vec![item("1", 1, 1, "A")]));
        assert!(s.apply_scan(Err("denied".into())).is_none());
        assert!(s.apply_scan(Err("denied".into())).is_none());
        assert!(s.current.is_some());
        assert_eq!(s.last_error.as_deref(), Some("denied"));
        s.apply_scan(Ok(vec![item("1", 1, 1, "A")]));
        assert!(s.last_error.is_none());
    }
    #[test]
    fn previous_candidate_wins_otherwise_order_is_stable() {
        let a = item("20", 2, 1, "A");
        let b = item("10", 1, 1, "B");
        assert_eq!(
            select_window(Some(&a.identity), vec![b.clone(), a.clone()]).unwrap(),
            a
        );
        assert_eq!(select_window(None, vec![a, b.clone()]).unwrap(), b);
    }
    #[test]
    fn stop_is_idempotent_without_start() {
        assert!(stop_sky_window_monitor().is_ok());
        assert!(stop_sky_window_monitor().is_ok());
    }
}
