#[tauri::command]
pub fn force_close_app(app: tauri::AppHandle) -> Result<(), String> {
    run_shutdown_sequence(
        crate::experimental_input::stop_current_background_playback_for_shutdown,
        || crate::window_state::save_before_exit(&app),
        |error| {
            let _ = crate::app_log::append_internal_log(
                &app,
                "warn",
                "window-state",
                "Window state save failed during shutdown",
                Some(serde_json::json!({ "error": error })),
            );
        },
        || app.exit(0),
    );
    Ok(())
}

fn run_shutdown_sequence<S, P, L, E>(stop_playback: S, persist: P, log_failure: L, exit: E)
where
    S: FnOnce(),
    P: FnOnce() -> Result<(), String>,
    L: FnOnce(&str),
    E: FnOnce(),
{
    stop_playback();
    if let Err(error) = persist() {
        log_failure(&error);
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
            || order.borrow_mut().push("stop"),
            || {
                order.borrow_mut().push("save");
                Ok(())
            },
            |_| order.borrow_mut().push("log"),
            || order.borrow_mut().push("exit"),
        );
        assert_eq!(*order.borrow(), vec!["stop", "save", "exit"]);
    }

    #[test]
    fn persistence_failure_is_logged_and_still_exits_once() {
        let order = RefCell::new(Vec::new());
        run_shutdown_sequence(
            || order.borrow_mut().push("stop"),
            || Err("disk full".to_string()),
            |error| {
                assert_eq!(error, "disk full");
                order.borrow_mut().push("log");
            },
            || order.borrow_mut().push("exit"),
        );
        assert_eq!(*order.borrow(), vec!["stop", "log", "exit"]);
    }
}
