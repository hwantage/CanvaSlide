//! Native file dialogs. Document picks are granted here, and exports are written right after their
//! dialog, so the webview never names a file on its own.

use std::path::PathBuf;

use tauri::State;
use tauri_plugin_dialog::{DialogExt, FilePath as DialogPath};

use crate::command_error::{off_main_thread, CommandError};
use crate::document_io::{
    decode_pdf_export, normalize_document_path, write_html_export_file, write_pdf_export_file,
    DOCUMENT_EXTENSION,
};
use crate::file_path::FilePath;
use crate::granted_files::GrantedFiles;

fn native_selection(selected: Option<DialogPath>) -> Result<Option<PathBuf>, CommandError> {
    selected
        .map(|path| {
            path.into_path()
                .map_err(|error| CommandError::new("invalid_path", error))
        })
        .transpose()
}

// Why: serializing the plugin's PathBuf directly rejects non-Unicode paths before JS can preserve them.
fn grant_selection(granted: &GrantedFiles, selected: Option<PathBuf>) -> Option<FilePath> {
    selected.map(|path| {
        granted.grant(&path);
        FilePath::from_path(&path)
    })
}

/// Save As grants the name the save command will write, so the grant covers exactly that file.
fn grant_save_selection(granted: &GrantedFiles, selected: Option<PathBuf>) -> Option<FilePath> {
    grant_selection(granted, selected.map(|path| normalize_document_path(&path)))
}

fn file_dialog(
    window: &tauri::WebviewWindow,
) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let dialog = window.dialog().file();
    #[cfg(any(windows, target_os = "macos"))]
    let dialog = dialog.set_parent(window);
    dialog
}

#[tauri::command]
pub async fn pick_document_path(
    window: tauri::WebviewWindow,
    granted: State<'_, GrantedFiles>,
) -> Result<Option<FilePath>, CommandError> {
    let granted = granted.inner().clone();
    off_main_thread(move || {
        let selected = native_selection(
            file_dialog(&window)
                .add_filter("CanvaSlide document", &[DOCUMENT_EXTENSION, "json"])
                .blocking_pick_file(),
        )?;
        Ok(grant_selection(&granted, selected))
    })
    .await
}

#[tauri::command]
pub async fn pick_document_save_path(
    window: tauri::WebviewWindow,
    granted: State<'_, GrantedFiles>,
    default_name: String,
) -> Result<Option<FilePath>, CommandError> {
    let granted = granted.inner().clone();
    off_main_thread(move || {
        let selected = native_selection(
            file_dialog(&window)
                .set_file_name(default_name)
                .add_filter("CanvaSlide document", &[DOCUMENT_EXTENSION])
                .blocking_save_file(),
        )?;
        Ok(grant_save_selection(&granted, selected))
    })
    .await
}

fn pick_export_path(
    window: &tauri::WebviewWindow,
    default_name: String,
    filter: &str,
    extension: &str,
) -> Result<Option<PathBuf>, CommandError> {
    native_selection(
        file_dialog(window)
            .set_file_name(default_name)
            .add_filter(filter, &[extension])
            .blocking_save_file(),
    )
}

/// Returns where the export landed, or `None` when the dialog was cancelled.
#[tauri::command]
pub async fn save_html_export(
    window: tauri::WebviewWindow,
    default_name: String,
    contents: String,
) -> Result<Option<FilePath>, CommandError> {
    off_main_thread(move || {
        let Some(path) = pick_export_path(&window, default_name, "HTML presentation", "html")?
        else {
            return Ok(None);
        };
        let written = write_html_export_file(&path, &contents)?;
        Ok(Some(FilePath::from_path(&written)))
    })
    .await
}

#[tauri::command]
pub async fn save_pdf_export(
    window: tauri::WebviewWindow,
    default_name: String,
    contents_base64: String,
) -> Result<Option<FilePath>, CommandError> {
    off_main_thread(move || {
        // Why before the dialog: a payload that cannot be written should not ask for a file name.
        let bytes = decode_pdf_export(&contents_base64)?;
        let Some(path) = pick_export_path(&window, default_name, "PDF document", "pdf")? else {
            return Ok(None);
        };
        let written = write_pdf_export_file(&path, &bytes)?;
        Ok(Some(FilePath::from_path(&written)))
    })
    .await
}

#[cfg(test)]
#[path = "document_dialog_tests.rs"]
mod tests;
