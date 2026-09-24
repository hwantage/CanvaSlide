//! The document the OS hands the app: a path in `argv` on Windows and Linux, a `RunEvent::Opened`
//! URL on macOS. Held here until the webview is ready to ask for it.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::document_io::is_openable_document;
use crate::file_path::FilePath;
use crate::granted_files::GrantedFiles;

/// Sent when a document arrives while the app is already running; the frontend answers by taking
/// the path with `take_launch_document`.
pub const OPEN_FILE_EVENT: &str = "open-file-requested";

/// The path waiting for the webview, which is not alive yet when the launch path arrives.
#[derive(Default)]
pub struct PendingDocument(Mutex<Option<PathBuf>>);

impl PendingDocument {
    fn set(&self, path: PathBuf) {
        // Why: a poisoned lock only means another thread panicked mid-swap; the slot is still usable.
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(path);
    }

    fn take(&self) -> Option<PathBuf> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    fn take_transport(&self) -> Option<FilePath> {
        self.take().map(|path| FilePath::from_path(&path))
    }
}

/// Picks the document out of a process argv. Flags and anything that is not one of our documents
/// are skipped, so a dev switch never looks like a file. Only the first document counts — the app
/// has a single window, so selecting several and opening them at once cannot be honoured.
///
/// Why `cwd` rather than this process's own: a second launch hands its argv to the running
/// instance, and a relative path there was typed against *that* process's directory. Resolving it
/// here is what stops the running instance opening a same-named file from the wrong place.
///
/// Why `OsString`: `std::env::args()` panics on a path the platform encoding cannot turn into
/// UTF-8, which would crash the app at startup for the very file it was asked to open.
pub fn document_path_from_args<I: IntoIterator<Item = OsString>>(
    cwd: &Path,
    args: I,
) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| !path.to_string_lossy().starts_with('-') && is_openable_document(path))
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
}

/// The OS opening a document is the user's choice of that file, just as a dialog pick is.
fn receive(pending: &PendingDocument, granted: &GrantedFiles, path: PathBuf) {
    granted.grant(&path);
    pending.set(path);
}

/// Remembers the document and tells the webview, which may or may not be listening yet.
pub fn offer<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    receive(
        &app.state::<PendingDocument>(),
        &app.state::<GrantedFiles>(),
        path,
    );
    // Why: the launch path is picked up by the frontend's first drain, so a failed emit (no webview
    // yet) is expected and must not abort startup.
    let _ = app.emit(OPEN_FILE_EVENT, ());
}

/// Picks the document out of the URLs macOS hands over, skipping any that is not a local file.
///
/// Selecting several documents in Finder delivers them all in one event. The app has a single
/// window, so the first one wins and the rest are dropped on purpose: offering each in turn would
/// make the *last* one win, which is not what picking a set of files asks for.
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn document_path_from_urls(urls: &[tauri::Url]) -> Option<PathBuf> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .find(|path| is_openable_document(path))
}

/// macOS never uses `argv`; it hands documents over as file URLs, at launch and while the app runs.
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn offer_urls(app: &AppHandle, urls: &[tauri::Url]) {
    if let Some(path) = document_path_from_urls(urls) {
        offer(app, path);
    }
}

#[tauri::command]
pub fn take_launch_document(pending: State<'_, PendingDocument>) -> Option<FilePath> {
    pending.take_transport()
}

#[cfg(test)]
#[path = "launch_document_tests.rs"]
mod tests;
