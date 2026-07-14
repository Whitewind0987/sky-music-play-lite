#[tauri::command]
pub fn force_close_app(app: tauri::AppHandle) -> Result<(), String> {
    run_shutdown_sequence(
        crate::experimental_input::stop_sky_window_monitor,
        crate::experimental_input::stop_current_background_playback_for_shutdown,
        || crate::window_state::save_before_exit(&app),
        |source, error| {
            let _ = crate::app_log::append_internal_log(
                &app,
                "warn",
                source,
                "Shutdown step failed",
                Some(serde_json::json!({ "error": error })),
            );
        },
        || app.exit(0),
    );
    Ok(())
}

fn run_shutdown_sequence<M, S, P, L, E>(
    stop_monitor: M,
    stop_playback: S,
    persist: P,
    mut log_failure: L,
    exit: E,
) where
    M: FnOnce() -> Result<(), String>,
    S: FnOnce(),
    P: FnOnce() -> Result<(), String>,
    L: FnMut(&str, &str),
    E: FnOnce(),
{
    if let Err(error) = stop_monitor() {
        log_failure("sky-window-monitor", &error);
    }
    stop_playback();
    if let Err(error) = persist() {
        log_failure("window-state", &error);
    }
    exit();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn successful_shutdown_stops_persists_and_exits_once() {
        let order = RefCell::new(Vec::new());
        run_shutdown_sequence(
            || {
                order.borrow_mut().push("monitor");
                Ok(())
            },
            || order.borrow_mut().push("stop"),
            || {
                order.borrow_mut().push("save");
                Ok(())
            },
            |_, _| order.borrow_mut().push("log"),
            || order.borrow_mut().push("exit"),
        );
        assert_eq!(*order.borrow(), vec!["monitor", "stop", "save", "exit"]);
    }

    #[test]
    fn persistence_failure_is_logged_and_still_exits_once() {
        let order = RefCell::new(Vec::new());
        run_shutdown_sequence(
            || Ok(()),
            || order.borrow_mut().push("stop"),
            || Err("disk full".to_string()),
            |_, error| {
                assert_eq!(error, "disk full");
                order.borrow_mut().push("log");
            },
            || order.borrow_mut().push("exit"),
        );
        assert_eq!(*order.borrow(), vec!["stop", "log", "exit"]);
    }

    #[test]
    fn monitor_failure_still_stops_persists_and_exits() {
        let order = RefCell::new(Vec::new());
        run_shutdown_sequence(
            || Err("join failed".into()),
            || order.borrow_mut().push("stop"),
            || {
                order.borrow_mut().push("save");
                Ok(())
            },
            |source, _| {
                order.borrow_mut().push(if source == "sky-window-monitor" {
                    "monitor-log"
                } else {
                    "log"
                })
            },
            || order.borrow_mut().push("exit"),
        );
        assert_eq!(*order.borrow(), vec!["monitor-log", "stop", "save", "exit"]);
    }
}
