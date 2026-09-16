//! JSON transport for native paths. Display text must never be used to reconstruct an IO path.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum FilePath {
    Unicode(String),
    Encoded(EncodedPath),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "encoding", rename_all = "kebab-case", deny_unknown_fields)]
pub enum EncodedPath {
    UnixBytes { bytes: Vec<u8>, display: String },
    WindowsWide { units: Vec<u16>, display: String },
}

impl FilePath {
    pub fn from_path(path: &Path) -> Self {
        if let Some(path) = path.to_str() {
            return Self::Unicode(path.to_owned());
        }
        let display = path.to_string_lossy().into_owned();
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStrExt;
            Self::Encoded(EncodedPath::UnixBytes {
                bytes: path.as_os_str().as_bytes().to_vec(),
                display,
            })
        }
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            Self::Encoded(EncodedPath::WindowsWide {
                units: path.as_os_str().encode_wide().collect(),
                display,
            })
        }
    }

    pub fn into_path(self) -> Result<PathBuf, String> {
        match self {
            Self::Unicode(path) => Ok(PathBuf::from(path)),
            #[cfg(unix)]
            Self::Encoded(EncodedPath::UnixBytes { bytes, .. }) => {
                use std::os::unix::ffi::OsStringExt;
                Ok(std::ffi::OsString::from_vec(bytes).into())
            }
            #[cfg(windows)]
            Self::Encoded(EncodedPath::WindowsWide { units, .. }) => {
                use std::os::windows::ffi::OsStringExt;
                Ok(std::ffi::OsString::from_wide(&units).into())
            }
            _ => Err("file path encoding does not match this platform".to_owned()),
        }
    }
}

#[cfg(test)]
#[path = "file_path_tests.rs"]
mod tests;
