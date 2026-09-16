//! The document the OS hands the app: a path in `argv` on Windows and Linux, a `RunEvent::Opened`
//! URL on macOS. Held here until the webview is ready to ask for it.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::document_io::is_openable_document;

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

/// Remembers the document and tells the webview, which may or may not be listening yet.
pub fn offer(app: &AppHandle, path: PathBuf) {
    app.state::<PendingDocument>().set(path);
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
pub fn take_launch_document(pending: State<'_, PendingDocument>) -> Option<String> {
    pending
        .take()
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    /// Every case here passes a cwd that must not show up in the answer.
    const ELSEWHERE: &str = "/somewhere/else";

    fn from_args(values: &[&str]) -> Option<PathBuf> {
        document_path_from_args(Path::new(ELSEWHERE), args(values))
    }

    #[test]
    fn finds_the_document_after_the_program_path() {
        assert_eq!(
            from_args(&["/Applications/CanvaSlide.app", "/tmp/deck.canvaslide"]),
            Some(PathBuf::from("/tmp/deck.canvaslide"))
        );
    }

    /// A Windows path only reads as absolute on Windows, so the passthrough is asserted there.
    #[cfg(windows)]
    #[test]
    fn keeps_a_windows_path_as_it_was_given() {
        assert_eq!(
            from_args(&["canvaslide.exe", r"C:\decks\plan.CANVASLIDE"]),
            Some(PathBuf::from(r"C:\decks\plan.CANVASLIDE"))
        );
    }

    /// The argv of a second launch was typed somewhere else; opening the running instance's
    /// same-named file instead would be the wrong document, silently.
    #[test]
    fn resolves_a_relative_path_against_the_caller_directory() {
        assert_eq!(
            from_args(&["canvaslide", "decks/deck.canvaslide"]),
            Some(PathBuf::from("/somewhere/else/decks/deck.canvaslide"))
        );
    }

    #[test]
    fn opens_a_document_saved_under_the_legacy_name() {
        assert_eq!(
            from_args(&["canvaslide", "/tmp/old.canvas.json"]),
            Some(PathBuf::from("/tmp/old.canvas.json"))
        );
    }

    /// The Open dialog reaches a document saved under a plain `.json`; so does a launch.
    #[test]
    fn opens_a_document_saved_under_a_bare_json_name() {
        assert_eq!(
            from_args(&["canvaslide", "/tmp/deck.json"]),
            Some(PathBuf::from("/tmp/deck.json"))
        );
    }

    #[test]
    fn ignores_flags_and_anything_that_is_not_a_document() {
        assert_eq!(from_args(&["canvaslide"]), None);
        assert_eq!(from_args(&["canvaslide", "--devtools", "notes.txt"]), None);
        assert_eq!(
            from_args(&["canvaslide", "--flag", "/tmp/deck.canvaslide"]),
            Some(PathBuf::from("/tmp/deck.canvaslide"))
        );
    }

    /// A single-window app opens one document; the choice of *which* one has to be the first, not
    /// whichever happened to be offered last.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[test]
    fn takes_the_first_file_url_and_skips_the_rest() {
        let urls: Vec<tauri::Url> = [
            "https://example.com/a.canvaslide",
            // Why: "Open With" can hand over anything; skipping it must not cost the real document
            // that follows.
            "file:///tmp/notes.txt",
            "file:///tmp/first.canvaslide",
            "file:///tmp/second.canvaslide",
        ]
        .iter()
        .map(|u| u.parse().unwrap())
        .collect();
        assert_eq!(
            document_path_from_urls(&urls),
            Some(PathBuf::from("/tmp/first.canvaslide"))
        );
        assert_eq!(document_path_from_urls(&[]), None);
    }

    #[test]
    fn hands_the_path_over_exactly_once() {
        let pending = PendingDocument::default();
        pending.set(PathBuf::from("/tmp/deck.canvaslide"));
        assert_eq!(pending.take(), Some(PathBuf::from("/tmp/deck.canvaslide")));
        assert_eq!(pending.take(), None);
    }

    #[test]
    fn the_newest_document_wins_over_one_nobody_took() {
        let pending = PendingDocument::default();
        pending.set(PathBuf::from("/tmp/first.canvaslide"));
        pending.set(PathBuf::from("/tmp/second.canvaslide"));
        assert_eq!(
            pending.take(),
            Some(PathBuf::from("/tmp/second.canvaslide"))
        );
    }
}
