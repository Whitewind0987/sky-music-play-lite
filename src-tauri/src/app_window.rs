#[tauri::command]
pub fn force_close_app(app: tauri::AppHandle) -> Result<(), String> {
    crate::experimental_input::stop_current_background_playback_for_shutdown();
    app.exit(0);
    Ok(())
}
