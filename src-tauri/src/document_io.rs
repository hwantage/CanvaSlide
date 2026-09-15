//! Canvas document file IO. Validation of the JSON shape lives in the frontend (zod);
//! here we only guarantee the bytes are well-formed JSON and the extension is ours.

use std::path::{Path, PathBuf};

use serde::Serialize;

pub const DOCUMENT_EXTENSION: &str = "canvaslide";
/// Documents written before the single-extension move; still readable, never written.
pub const LEGACY_DOCUMENT_EXTENSION: &str = "canvas.json";

#[derive(Debug, thiserror::Error)]
pub enum DocumentIoError {
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

fn has_document_extension(path: &Path) -> bool {
    ends_with_extension(path, DOCUMENT_EXTENSION)
        || ends_with_extension(path, LEGACY_DOCUMENT_EXTENSION)
}

/// Appends the canonical extension when the picker returned a bare name, and rewrites a
/// legacy `.canvas.json` name so that saving an old document migrates it.
pub fn normalize_document_path(path: &Path) -> PathBuf {
    if ends_with_extension(path, DOCUMENT_EXTENSION) {
        return path.to_path_buf();
    }
    let mut name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    // Why: the legacy suffix has to go first, otherwise `.json` leaves a dangling `.canvas`.
    for suffix in [format!(".{LEGACY_DOCUMENT_EXTENSION}"), ".json".to_owned()] {
        if name.to_ascii_lowercase().ends_with(&suffix) {
            name.truncate(name.len() - suffix.len());
            break;
        }
    }
    path.with_file_name(format!("{name}.{DOCUMENT_EXTENSION}"))
}

pub fn read_document_file(path: &Path) -> Result<String, DocumentIoError> {
    if !has_document_extension(path) {
        return Err(DocumentIoError::InvalidExtension(path.to_path_buf()));
    }
    let contents = std::fs::read_to_string(path)?;
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| DocumentIoError::InvalidJson(e.to_string()))?;
    Ok(contents)
}

pub fn write_document_file(path: &Path, contents: &str) -> Result<PathBuf, DocumentIoError> {
    serde_json::from_str::<serde_json::Value>(contents)
        .map_err(|e| DocumentIoError::InvalidJson(e.to_string()))?;
    let target = normalize_document_path(path);
    // Why: write to a sibling temp file then rename so a crash never truncates the user's document.
    let tmp = target.with_extension(format!("{DOCUMENT_EXTENSION}.tmp"));
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
pub fn read_document(path: String) -> Result<String, DocumentIoError> {
    read_document_file(Path::new(&path))
}

#[tauri::command]
pub fn write_document(path: String, contents: String) -> Result<String, DocumentIoError> {
    write_document_file(Path::new(&path), &contents).map(|p| p.to_string_lossy().into_owned())
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
        let written = write_document_file(&path, r#"{"version":1,"elements":[]}"#).unwrap();
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
            write_document_file(Path::new("/tmp/x"), "{not json"),
            Err(DocumentIoError::InvalidJson(_))
        ));
        assert!(matches!(
            read_document_file(Path::new("/tmp/x.txt")),
            Err(DocumentIoError::InvalidExtension(_))
        ));
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
