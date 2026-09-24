//! Canvas document IO. The frontend validates the JSON schema and shared resource references.
//! Native IO preserves bytes and paths and writes atomically.

use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use tauri::State;

use crate::file_path::FilePath;
use crate::granted_files::{GrantError, GrantedFiles};

const MAX_DOCUMENT_BYTES: usize = 256 * 1024 * 1024;

pub const DOCUMENT_EXTENSION: &str = "canvaslide";

#[derive(Debug, thiserror::Error)]
pub enum DocumentIoError {
    #[error(transparent)]
    NotGranted(#[from] GrantError),
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
///
/// Why this runs when the name is picked rather than when it is written: the save command then
/// writes exactly the file the dialog handed out, so no command can reach a file nobody picked.
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

/// Writes the exact path it is given. A silent save (⌘S on an open document) must land on the file
/// it was read from: rewriting the target would leave the original behind holding stale content and
/// would overwrite whatever already sits at the new name, with none of the confirmation the save
/// dialog would have given.
pub fn write_document_file(path: &Path, contents: &str) -> Result<PathBuf, DocumentIoError> {
    let bytes = contents.as_bytes();
    validate_document_bytes(bytes)?;
    // Why the same test as the reader: a document opened from a bare `.json` keeps that path, and
    // refusing it here would make the file readable but impossible to save.
    if !is_openable_document(path) {
        return Err(DocumentIoError::InvalidExtension(path.to_path_buf()));
    }
    let target = path.to_path_buf();
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

/// Why base64 rather than the bytes themselves: the IPC bridge serializes command arguments as
/// JSON, and a byte array would arrive as one JSON number per byte.
pub fn decode_pdf_export(contents_base64: &str) -> Result<Vec<u8>, DocumentIoError> {
    base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| DocumentIoError::InvalidBase64(e.to_string()))
}

pub fn read_granted_document(
    granted: &GrantedFiles,
    path: FilePath,
) -> Result<String, DocumentIoError> {
    read_document_file(&granted.require(path)?)
}

pub fn write_granted_document(
    granted: &GrantedFiles,
    path: FilePath,
    contents: &str,
) -> Result<FilePath, DocumentIoError> {
    write_document_file(&granted.require(path)?, contents).map(|path| FilePath::from_path(&path))
}

#[tauri::command]
pub fn read_document(
    granted: State<'_, GrantedFiles>,
    path: FilePath,
) -> Result<String, DocumentIoError> {
    read_granted_document(&granted, path)
}

#[tauri::command]
pub fn write_document(
    granted: State<'_, GrantedFiles>,
    path: FilePath,
    contents: String,
) -> Result<FilePath, DocumentIoError> {
    write_granted_document(&granted, path, &contents)
}

#[cfg(test)]
#[path = "document_io_tests.rs"]
mod tests;
