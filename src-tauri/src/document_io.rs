//! Canvas document file IO. Validation of the JSON shape lives in the frontend (zod);
//! here we only guarantee the bytes are well-formed JSON and the extension is ours.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::file_path::FilePath;

pub const DOCUMENT_EXTENSION: &str = "canvaslide";
/// Documents written before the single-extension move. They open and save in place; only the save
/// dialog ("Save as…") migrates one to `DOCUMENT_EXTENSION`.
pub const LEGACY_DOCUMENT_EXTENSION: &str = "canvas.json";

#[derive(Debug, thiserror::Error)]
pub enum DocumentIoError {
    #[error("invalid native path: {0}")]
    InvalidPath(String),
    #[error("path is not a canvas document: {0}")]
    InvalidExtension(PathBuf),
    #[error("document is not valid JSON: {0}")]
    InvalidJson(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

// Why: Tauri commands need a serializable error; the frontend shows `message` verbatim.
impl Serialize for DocumentIoError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

fn ends_with_extension(path: &Path, extension: &str) -> bool {
    path.to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(&format!(".{extension}"))
}

pub fn has_document_extension(path: &Path) -> bool {
    ends_with_extension(path, DOCUMENT_EXTENSION)
        || ends_with_extension(path, LEGACY_DOCUMENT_EXTENSION)
}

/// True for everything the Open dialog lets the user pick. A bare `.json` is in there because native
/// dialogs match only the last segment, so a legacy `.canvas.json` can only be offered as `json`;
/// the shape is validated right after, first here as JSON and then in the frontend by zod.
pub fn is_openable_document(path: &Path) -> bool {
    has_document_extension(path) || ends_with_extension(path, "json")
}

/// Appends the canonical extension when the save dialog returned a bare name, and rewrites a legacy
/// `.canvas.json` or bare `.json` name so that "Save as…" migrates an old document. Only ever
/// applied to a name the user just picked — see `write_document_file`.
pub fn normalize_document_path(path: &Path) -> PathBuf {
    if ends_with_extension(path, DOCUMENT_EXTENSION) {
        return path.to_path_buf();
    }
    let mut name = PathBuf::from(path.file_name().unwrap_or_default());
    // Strip ASCII suffixes with native path operations so the remaining filename stays lossless.
    if ends_with_extension(&name, "json") {
        if name.as_os_str().eq_ignore_ascii_case(".json") {
            name.clear();
        } else {
            name = name.file_stem().unwrap_or_default().into();
        }
        if ends_with_extension(path, LEGACY_DOCUMENT_EXTENSION) {
            if name.as_os_str().eq_ignore_ascii_case(".canvas") {
                name.clear();
            } else {
                name = name.file_stem().unwrap_or_default().into();
            }
        }
    }
    let mut name = name.into_os_string();
    name.push(format!(".{DOCUMENT_EXTENSION}"));
    path.with_file_name(name)
}

pub fn read_document_file(path: &Path) -> Result<String, DocumentIoError> {
    if !is_openable_document(path) {
        return Err(DocumentIoError::InvalidExtension(path.to_path_buf()));
    }
    let contents = std::fs::read_to_string(path)?;
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| DocumentIoError::InvalidJson(e.to_string()))?;
    Ok(contents)
}

/// `normalize_extension` is set only for a name the user just picked in the save dialog. A silent
/// save (⌘S on an open document) must land on the exact file it was read from: rewriting the target
/// would leave the original behind holding stale content and would overwrite whatever already sits
/// at the new name, with none of the confirmation the save dialog would have given.
pub fn write_document_file(
    path: &Path,
    contents: &str,
    normalize_extension: bool,
) -> Result<PathBuf, DocumentIoError> {
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|e| DocumentIoError::InvalidJson(e.to_string()))?;
    let target = if normalize_extension {
        normalize_document_path(path)
    } else if is_openable_document(path) {
        // Why the same test as the reader: a document opened from a bare `.json` keeps that path,
        // and refusing it here would make the file readable but impossible to save.
        path.to_path_buf()
    } else {
        return Err(DocumentIoError::InvalidExtension(path.to_path_buf()));
    };
    // Why: write to a sibling temp file then rename so a crash never truncates the user's document.
    // Why append rather than `with_extension`: a legacy `deck.canvas.json` would lose its `.json`.
    let mut tmp = target.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}

pub fn write_html_export_file(path: &Path, contents: &str) -> Result<PathBuf, DocumentIoError> {
    let target = if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("html"))
    {
        path.to_path_buf()
    } else {
        path.with_extension("html")
    };
    let tmp = target.with_extension("html.tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}

#[tauri::command]
pub fn write_html_export(path: String, contents: String) -> Result<String, DocumentIoError> {
    write_html_export_file(Path::new(&path), &contents).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_document(path: FilePath) -> Result<String, DocumentIoError> {
    read_document_file(&path.into_path().map_err(DocumentIoError::InvalidPath)?)
}

#[tauri::command]
pub fn write_document(
    path: FilePath,
    contents: String,
    normalize_extension: bool,
) -> Result<FilePath, DocumentIoError> {
    let path = path.into_path().map_err(DocumentIoError::InvalidPath)?;
    write_document_file(&path, &contents, normalize_extension)
        .map(|path| FilePath::from_path(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_bare_json_and_legacy_names() {
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck.json")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck.canvas.json")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck.canvaslide")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
    }

    #[test]
    fn round_trips_a_document() {
        let dir = std::env::temp_dir().join(format!("uc-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc");
        let written = write_document_file(&path, r#"{"version":1,"elements":[]}"#, true).unwrap();
        assert!(written.ends_with("doc.canvaslide"));
        assert_eq!(
            read_document_file(&written).unwrap(),
            r#"{"version":1,"elements":[]}"#
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn writes_html_export_with_forced_extension() {
        let dir = std::env::temp_dir().join(format!("uc-html-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let written = write_html_export_file(&dir.join("deck"), "<!doctype html>").unwrap();
        assert!(written.ends_with("deck.html"));
        assert_eq!(
            std::fs::read_to_string(&written).unwrap(),
            "<!doctype html>"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rejects_invalid_json_and_extension() {
        assert!(matches!(
            write_document_file(Path::new("/tmp/x"), "{not json", true),
            Err(DocumentIoError::InvalidJson(_))
        ));
        assert!(matches!(
            read_document_file(Path::new("/tmp/x.txt")),
            Err(DocumentIoError::InvalidExtension(_))
        ));
    }

    /// A silent save must never move the document: the old file would keep the pre-edit content and
    /// anything already sitting at the new name would be overwritten without a word.
    #[test]
    fn a_silent_save_keeps_a_legacy_document_where_it_is() {
        let dir = std::env::temp_dir().join(format!("uc-silent-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let legacy = dir.join("deck.canvas.json");
        std::fs::write(&legacy, r#"{"version":1,"elements":[]}"#).unwrap();

        let written =
            write_document_file(&legacy, r#"{"version":2,"elements":[]}"#, false).unwrap();

        assert_eq!(written, legacy);
        assert_eq!(
            std::fs::read_to_string(&legacy).unwrap(),
            r#"{"version":2,"elements":[]}"#
        );
        assert!(!dir.join("deck.canvaslide").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// The save dialog is the one place a legacy name may be migrated.
    #[test]
    fn save_as_migrates_a_legacy_name() {
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck.canvas.json")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
    }

    /// A document saved under a plain `.json` name opens, so it has to save again where it was.
    #[test]
    fn a_silent_save_round_trips_a_bare_json_document() {
        let dir = std::env::temp_dir().join(format!("uc-bare-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("deck.json");
        std::fs::write(&path, r#"{"version":1,"elements":[]}"#).unwrap();

        assert_eq!(
            read_document_file(&path).unwrap(),
            r#"{"version":1,"elements":[]}"#
        );
        let written = write_document_file(&path, r#"{"version":2,"elements":[]}"#, false).unwrap();

        assert_eq!(written, path);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            r#"{"version":2,"elements":[]}"#
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_silent_save_refuses_a_path_that_is_not_a_document() {
        assert!(matches!(
            write_document_file(Path::new("/tmp/notes.txt"), "{}", false),
            Err(DocumentIoError::InvalidExtension(_))
        ));
    }

    /// The Open dialog offers bare `.json` so legacy documents are reachable; the reader has to
    /// accept the same set, or picking one raises a raw "not a canvas document" path instead.
    #[test]
    fn opens_the_same_extensions_the_dialog_offers() {
        assert!(is_openable_document(Path::new("/tmp/deck.canvaslide")));
        assert!(is_openable_document(Path::new("/tmp/deck.canvas.json")));
        assert!(is_openable_document(Path::new("/tmp/package.json")));
        assert!(!is_openable_document(Path::new("/tmp/notes.txt")));
    }

    #[test]
    fn reads_a_legacy_document() {
        let dir = std::env::temp_dir().join(format!("uc-legacy-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.canvas.json");
        std::fs::write(&path, r#"{"version":1,"elements":[]}"#).unwrap();
        assert_eq!(
            read_document_file(&path).unwrap(),
            r#"{"version":1,"elements":[]}"#
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(test)]
#[path = "document_path_tests.rs"]
mod path_tests;
