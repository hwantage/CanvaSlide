use tauri_plugin_dialog::{DialogExt, FilePath as DialogPath};

use crate::{document_io::DOCUMENT_EXTENSION, file_path::FilePath};

// Why: serializing the plugin's PathBuf directly rejects non-Unicode paths before JS can preserve them.
fn transport_selection(selected: Option<DialogPath>) -> Result<Option<FilePath>, String> {
    selected
        .map(|path| {
            path.into_path()
                .map(|path| FilePath::from_path(&path))
                .map_err(|error| error.to_string())
        })
        .transpose()
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
pub async fn pick_document_path(window: tauri::WebviewWindow) -> Result<Option<FilePath>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transport_selection(
            file_dialog(&window)
                .add_filter("CanvaSlide document", &[DOCUMENT_EXTENSION, "json"])
                .blocking_pick_file(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pick_document_save_path(
    window: tauri::WebviewWindow,
    default_name: String,
) -> Result<Option<FilePath>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transport_selection(
            file_dialog(&window)
                .set_file_name(default_name)
                .add_filter("CanvaSlide document", &[DOCUMENT_EXTENSION])
                .blocking_save_file(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_dialog_has_no_path() {
        assert_eq!(transport_selection(None).unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn dialog_selection_preserves_native_bytes() {
        use std::os::unix::ffi::OsStringExt;
        let path = std::path::PathBuf::from(std::ffi::OsString::from_vec(
            b"/tmp/deck\xff.canvaslide".to_vec(),
        ));
        let selected = transport_selection(Some(DialogPath::Path(path.clone())))
            .unwrap()
            .unwrap();
        assert_eq!(selected.into_path().unwrap(), path);
    }
}
