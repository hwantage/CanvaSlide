mod app_menu;
mod document_io;
mod font_embed;
mod launch_document;
mod system_fonts;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

/// Sent to the webview when the user wants to quit; the frontend confirms unsaved work first and
/// then calls `quit_app`.
pub const QUIT_REQUESTED_EVENT: &str = "quit-requested";
/// Sent when the user picks "Check for Updates…" in the native menu; the frontend runs the check.
pub const CHECK_UPDATES_EVENT: &str = "check-updates-requested";

/// Set when a quit request goes out, cleared as soon as the webview answers.
static QUIT_UNANSWERED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Tells the Rust side the webview received the quit request and is handling it.
#[tauri::command]
fn acknowledge_quit() {
    QUIT_UNANSWERED.store(false, Ordering::Relaxed);
}

/// Hands a document from a second launch to the running app: Windows and Linux start a whole new
/// process when one is double-clicked in the shell, and without this the two instances would each
/// hold a copy of the same file and overwrite each other's saves.
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn adopt_second_launch(app: &AppHandle, argv: Vec<String>, _cwd: String) {
    if let Some(window) = app.webview_windows().values().next() {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(path) =
        launch_document::document_path_from_args(argv.into_iter().map(std::ffi::OsString::from))
    {
        launch_document::offer(app, path);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Why: Tauri requires this plugin before every other one, so the duplicate process bows out
    // before it starts building windows.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(adopt_second_launch));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(launch_document::PendingDocument::default())
        .setup(|app| {
            app_menu::install(app)?;
            if let Some(path) = launch_document::document_path_from_args(std::env::args_os()) {
                launch_document::offer(app.handle(), path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            document_io::read_document,
            document_io::write_document,
            document_io::write_html_export,
            system_fonts::list_system_fonts,
            font_embed::subset_fonts,
            launch_document::take_launch_document,
            quit_app,
            acknowledge_quit
        ])
        .build(tauri::generate_context!())
        .expect("error while building canvaslide")
        .run(|app, event| {
            // Why: macOS delivers a double-clicked document here, both at launch and later, while
            // Windows and Linux only ever pass it in `argv`.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = &event {
                launch_document::offer_urls(app, urls);
            }
            // Why: a native quit (Dock, ⌘Q, shutdown) bypasses the window's close-requested hook, so
            // hold the exit and let the frontend decide. `quit_app` exits with an explicit code.
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                // Why: an unanswered previous request means the webview is dead, so stop holding
                // the exit — otherwise a blank webview makes the app impossible to quit.
                if !app.webview_windows().is_empty()
                    && !QUIT_UNANSWERED.swap(true, Ordering::Relaxed)
                {
                    api.prevent_exit();
                    let _ = app.emit(QUIT_REQUESTED_EVENT, ());
                }
            }
        });
}
