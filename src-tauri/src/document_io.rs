//! Canvas document IO. The frontend validates the JSON schema and shared resource references.
//! Native IO preserves bytes and paths and writes atomically.

use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use crate::file_path::FilePath;

const MAX_DOCUMENT_BYTES: usize = 256 * 1024 * 1024;

pub const DOCUMENT_EXTENSION: &str = "canvaslide";

#[derive(Debug, thiserror::Error)]
pub enum DocumentIoError {
    #[error("invalid native path: {0}")]
    InvalidPath(String),
    #[error("path is not a canvas document: {0}")]
    InvalidExtension(PathBuf),
    #[error("document is not valid JSON: {0}")]
    InvalidJson(String),
    #[error("export payload is not valid base64: {0}")]
    InvalidBase64(String),
    #[error("document exceeds file size limit")]
    TooLarge,
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
}

/// Accept plain `.json` files authored in a text editor as well as the canonical extension.
pub fn is_openable_document(path: &Path) -> bool {
    has_document_extension(path) || ends_with_extension(path, "json")
}

/// Normalize only a name explicitly picked in Save As; silent saves retain their exact path.
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
    }
    let mut name = name.into_os_string();
    name.push(format!(".{DOCUMENT_EXTENSION}"));
    path.with_file_name(name)
}

fn validate_document_bytes(bytes: &[u8]) -> Result<(), DocumentIoError> {
    if bytes.len() > MAX_DOCUMENT_BYTES {
        return Err(DocumentIoError::TooLarge);
    }
    serde_json::from_slice::<serde_json::Value>(bytes)
        .map_err(|e| DocumentIoError::InvalidJson(e.to_string()))?;
    Ok(())
}

fn read_document_bytes(reader: impl Read, limit: usize) -> Result<Vec<u8>, DocumentIoError> {
    let mut bytes = Vec::new();
    reader
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(DocumentIoError::TooLarge);
    }
    Ok(bytes)
}

pub fn read_document_file(path: &Path) -> Result<String, DocumentIoError> {
    if !is_openable_document(path) {
        return Err(DocumentIoError::InvalidExtension(path.to_path_buf()));
    }
    let bytes = read_document_bytes(std::fs::File::open(path)?, MAX_DOCUMENT_BYTES)?;
    validate_document_bytes(&bytes)?;
    String::from_utf8(bytes).map_err(|e| DocumentIoError::InvalidJson(e.to_string()))
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
    let bytes = contents.as_bytes();
    validate_document_bytes(bytes)?;
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
    let mut tmp = target.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}

/// An export lands on the extension its format dictates, whatever name the save dialog returned,
/// and goes through a sibling temp file so a crash never leaves a half-written export behind.
fn write_export_file(
    path: &Path,
    extension: &str,
    bytes: &[u8],
) -> Result<PathBuf, DocumentIoError> {
    let target = if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(extension))
    {
        path.to_path_buf()
    } else {
        path.with_extension(extension)
    };
    let tmp = target.with_extension(format!("{extension}.tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}

pub fn write_html_export_file(path: &Path, contents: &str) -> Result<PathBuf, DocumentIoError> {
    write_export_file(path, "html", contents.as_bytes())
}

pub fn write_pdf_export_file(path: &Path, bytes: &[u8]) -> Result<PathBuf, DocumentIoError> {
    write_export_file(path, "pdf", bytes)
}

#[tauri::command]
pub fn write_html_export(path: String, contents: String) -> Result<String, DocumentIoError> {
    write_html_export_file(Path::new(&path), &contents).map(|p| p.to_string_lossy().into_owned())
}

/// Why base64 rather than the bytes themselves: the IPC bridge serializes command arguments as
/// JSON, and a byte array would arrive as one JSON number per byte.
#[tauri::command]
pub fn write_pdf_export(path: String, contents_base64: String) -> Result<String, DocumentIoError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| DocumentIoError::InvalidBase64(e.to_string()))?;
    write_pdf_export_file(Path::new(&path), &bytes).map(|p| p.to_string_lossy().into_owned())
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
    fn normalizes_bare_and_json_names() {
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck")),
            PathBuf::from("/tmp/deck.canvaslide")
        );
        assert_eq!(
            normalize_document_path(Path::new("/tmp/deck.json")),
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
    fn writes_pdf_export_bytes_with_forced_extension() {
        let dir = std::env::temp_dir().join(format!("uc-pdf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bytes: Vec<u8> = b"%PDF-1.7\n\xe2\xe3\xcf\xd3".to_vec();
        let written = write_pdf_export_file(&dir.join("deck"), &bytes).unwrap();
        assert!(written.ends_with("deck.pdf"));
        assert_eq!(std::fs::read(&written).unwrap(), bytes);
        // A name the save dialog already gave the right extension keeps it, rather than doubling it.
        let kept = write_pdf_export_file(&dir.join("deck.pdf"), &bytes).unwrap();
        assert_eq!(kept, written);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rejects_a_pdf_export_payload_that_is_not_base64() {
        assert!(matches!(
            write_pdf_export("/tmp/x.pdf".into(), "not base64!!".into()),
            Err(DocumentIoError::InvalidBase64(_))
        ));
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
        let written = write_document_file(
            &path,
            r#"{"version":1,"elements":[],"name":"Edited"}"#,
            false,
        )
        .unwrap();

        assert_eq!(written, path);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            r#"{"version":1,"elements":[],"name":"Edited"}"#
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

    #[test]
    fn opens_the_same_extensions_the_dialog_offers() {
        assert!(is_openable_document(Path::new("/tmp/deck.canvaslide")));
        assert!(is_openable_document(Path::new("/tmp/package.json")));
        assert!(!is_openable_document(Path::new("/tmp/notes.txt")));
    }
}

#[cfg(test)]
#[path = "document_path_tests.rs"]
mod path_tests;

#[cfg(test)]
#[path = "document_json_tests.rs"]
mod json_tests;
