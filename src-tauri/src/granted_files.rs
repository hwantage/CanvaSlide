//! The files the user handed the app this session: picked in a native dialog, opened from the OS, or
//! named by a recovery copy. File commands act only on these, never on a path the webview made up.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::file_path::FilePath;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum GrantError {
    #[error("invalid native path: {0}")]
    InvalidPath(String),
    #[error("file was not chosen in this session: {0}")]
    NotGranted(PathBuf),
}

#[derive(Clone, Default)]
pub struct GrantedFiles(Arc<Mutex<HashSet<PathBuf>>>);

impl GrantedFiles {
    fn files(&self) -> std::sync::MutexGuard<'_, HashSet<PathBuf>> {
        // Why: a poisoned lock only means another thread panicked mid-insert; the set is still usable.
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn grant(&self, path: &Path) {
        self.files().insert(path.to_path_buf());
    }

    pub fn is_granted(&self, path: &Path) -> bool {
        self.files().contains(path)
    }

    /// The native path behind a handle the webview sent back, if the app handed that path out.
    pub fn require(&self, path: FilePath) -> Result<PathBuf, GrantError> {
        let path = path.into_path().map_err(GrantError::InvalidPath)?;
        if self.is_granted(&path) {
            Ok(path)
        } else {
            Err(GrantError::NotGranted(path))
        }
    }
}

#[cfg(test)]
#[path = "granted_files_tests.rs"]
mod tests;
