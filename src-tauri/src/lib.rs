#[tauri::command]
fn test_rust_command() -> String {
    "Rust command is working".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![test_rust_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
