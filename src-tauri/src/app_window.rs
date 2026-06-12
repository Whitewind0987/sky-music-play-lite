#[tauri::command]
pub fn force_close_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
