mod app_menu;
mod document_io;
mod font_embed;
mod system_fonts;

use tauri::{AppHandle, Emitter, Manager, RunEvent};

/// Sent to the webview when the user wants to quit; the frontend confirms unsaved work first and
/// then calls `quit_app`.
pub const QUIT_REQUESTED_EVENT: &str = "quit-requested";
/// Sent when the user picks "Check for Updates…" in the native menu; the frontend runs the check.
pub const CHECK_UPDATES_EVENT: &str = "check-updates-requested";

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app_menu::install(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            document_io::read_document,
            document_io::write_document,
            document_io::write_html_export,
            system_fonts::list_system_fonts,
            font_embed::subset_fonts,
            quit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building canvaslide")
        .run(|app, event| {
            // Why: a native quit (Dock, ⌘Q, shutdown) bypasses the window's close-requested hook, so
            // hold the exit and let the frontend decide. `quit_app` exits with an explicit code.
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                if !app.webview_windows().is_empty() {
                    api.prevent_exit();
                    let _ = app.emit(QUIT_REQUESTED_EVENT, ());
                }
            }
        });
}
