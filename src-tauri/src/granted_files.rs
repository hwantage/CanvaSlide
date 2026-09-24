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
mod tests {
    use super::*;

    #[test]
    fn only_a_granted_path_is_returned() {
        let files = GrantedFiles::default();
        let picked = PathBuf::from("/tmp/deck.canvaslide");
        let other = FilePath::from_path(Path::new("/tmp/other.canvaslide"));
        assert_eq!(
            files.require(other.clone()),
            Err(GrantError::NotGranted("/tmp/other.canvaslide".into()))
        );
        files.grant(&picked);
        assert_eq!(files.require(FilePath::from_path(&picked)), Ok(picked));
        assert!(files.require(other).is_err());
    }

    /// Clones share one set: the dialog, launch and recovery code each hold their own handle.
    #[test]
    fn a_grant_is_seen_through_every_clone() {
        let files = GrantedFiles::default();
        files.clone().grant(Path::new("/tmp/deck.canvaslide"));
        assert!(files.is_granted(Path::new("/tmp/deck.canvaslide")));
    }

    /// A name that merely looks like the granted one is a different file.
    #[test]
    fn a_similar_name_is_not_the_granted_file() {
        let files = GrantedFiles::default();
        files.grant(Path::new("/tmp/deck.canvaslide"));
        for near in [
            "/tmp/deck.canvaslide.json",
            "/tmp/Deck.canvaslide",
            "/tmp/../tmp/deck.canvaslide",
            "tmp/deck.canvaslide",
        ] {
            assert!(
                files.require(FilePath::Unicode(near.into())).is_err(),
                "{near}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn non_utf8_names_are_matched_by_their_bytes() {
        use std::os::unix::ffi::OsStringExt;
        let files = GrantedFiles::default();
        let exact = PathBuf::from(std::ffi::OsString::from_vec(b"/tmp/deck\xff.json".to_vec()));
        files.grant(&exact);
        let lossy = FilePath::Unicode(exact.to_string_lossy().into_owned());
        assert!(files.require(lossy).is_err());
        let transported: FilePath =
            serde_json::from_str(&serde_json::to_string(&FilePath::from_path(&exact)).unwrap())
                .unwrap();
        assert_eq!(files.require(transported), Ok(exact));
    }

    #[test]
    fn a_handle_for_another_platform_is_rejected() {
        let files = GrantedFiles::default();
        let foreign = if cfg!(windows) {
            serde_json::json!({"encoding":"unix-bytes","bytes":[47],"display":"/"})
        } else {
            serde_json::json!({"encoding":"windows-wide","units":[67],"display":"C"})
        };
        let foreign: FilePath = serde_json::from_value(foreign).unwrap();
        assert!(matches!(
            files.require(foreign),
            Err(GrantError::InvalidPath(_))
        ));
    }
}
