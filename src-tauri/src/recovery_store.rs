//! Owned recovery records; all commands run blocking filesystem work away from the app thread.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs::{File, OpenOptions, TryLockError};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use crate::atomic_file::{atomic_write, durable_rename, sync_directory, sync_file};
use crate::command_error::CommandError;
use crate::file_path::FilePath;
use crate::granted_files::GrantedFiles;

const MAX_SNAPSHOT_BYTES: usize = 256 * 1024 * 1024;
const MAX_STORE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_RECORDS: usize = 1000;
const MAX_SESSION_ID: usize = 128;

#[derive(Debug, thiserror::Error)]
pub enum RecoveryError {
    #[error("invalid recovery session id")]
    InvalidSession,
    #[error("recovery session is not owned")]
    NotOwned,
    #[error("recovery storage size limit exceeded")]
    TooLarge,
    #[error("recovery storage unavailable: {0}")]
    Unavailable(String),
    #[error("invalid recovery snapshot: {0}")]
    InvalidSnapshot(String),
    #[error("recovery snapshot names a file that was not chosen in this session")]
    NotGranted,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
impl From<&RecoveryError> for CommandError {
    fn from(error: &RecoveryError) -> Self {
        match error {
            RecoveryError::InvalidSession | RecoveryError::NotOwned => {
                CommandError::new("recovery_session", error)
            }
            RecoveryError::TooLarge => CommandError::new("recovery_too_large", ""),
            RecoveryError::Unavailable(detail) => CommandError::new("recovery_unavailable", detail),
            RecoveryError::InvalidSnapshot(detail) => CommandError::new("recovery_invalid", detail),
            RecoveryError::NotGranted => CommandError::new("not_granted", ""),
            RecoveryError::Io(error) => CommandError::io(error),
        }
    }
}
impl Serialize for RecoveryError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        CommandError::from(self).serialize(serializer)
    }
}
fn snapshot_path(dir: &Path, id: &str, extension: &str) -> Result<PathBuf, RecoveryError> {
    if id.is_empty()
        || id.len() > MAX_SESSION_ID
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(RecoveryError::InvalidSession);
    }
    Ok(dir.join(format!("{id}.{extension}")))
}
fn open_lock(path: &Path) -> Result<File, RecoveryError> {
    Ok(OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)?)
}
fn namespace_lock(dir: &Path) -> Result<File, RecoveryError> {
    std::fs::create_dir_all(dir)?;
    let file = open_lock(&dir.join(".store.lock"))?;
    file.lock()?;
    Ok(file)
}
#[derive(Default)]
pub struct RecoveryFiles {
    claims: HashMap<String, File>,
}
#[derive(Clone, Default)]
pub struct RecoveryState(Arc<Mutex<RecoveryFiles>>);
impl RecoveryFiles {
    fn claim(&mut self, dir: &Path, id: &str) -> Result<bool, RecoveryError> {
        if self.claims.contains_key(id) {
            return Ok(true);
        }
        let path = snapshot_path(dir, id, "lock")?;
        let _namespace = namespace_lock(dir)?;
        let file = open_lock(&path)?;
        match file.try_lock() {
            Ok(()) => {
                self.claims.insert(id.to_owned(), file);
                Ok(true)
            }
            Err(TryLockError::WouldBlock) => Ok(false),
            Err(TryLockError::Error(e)) => Err(e.into()),
        }
    }
    fn require(&self, id: &str) -> Result<(), RecoveryError> {
        if self.claims.contains_key(id) {
            Ok(())
        } else {
            Err(RecoveryError::NotOwned)
        }
    }
    fn release(&mut self, dir: &Path, id: &str) -> Result<(), RecoveryError> {
        let _namespace = namespace_lock(dir)?;
        if let Some(file) = self.claims.remove(id) {
            drop(file);
            remove_if_present(&snapshot_path(dir, id, "lock")?)?;
        }
        Ok(())
    }
    fn clear(&mut self, dir: &Path, ids: &[String]) -> Result<(), RecoveryError> {
        for id in ids {
            self.require(id)?;
        }
        let _namespace = namespace_lock(dir)?;
        for id in ids {
            remove_if_present(&snapshot_path(dir, id, "json")?)?;
            remove_if_present(&snapshot_path(dir, id, "json.tmp")?)?;
        }
        sync_directory(dir)?;
        Ok(())
    }
    fn write(&self, dir: &Path, id: &str, bytes: &[u8]) -> Result<(), RecoveryError> {
        self.require(id)?;
        let _namespace = namespace_lock(dir)?;
        let target = snapshot_path(dir, id, "json")?;
        let temp = snapshot_path(dir, id, "json.tmp")?;
        let mut size = bytes.len() as u64;
        let mut count = 1;
        for entry in std::fs::read_dir(dir)? {
            let path = entry?.path();
            if path != target
                && path != temp
                && (path.extension().and_then(|s| s.to_str()) == Some("json")
                    || path.to_string_lossy().ends_with(".json.tmp"))
            {
                size = size.saturating_add(path.metadata()?.len());
                count += 1;
            }
        }
        if bytes.len() > MAX_SNAPSHOT_BYTES || size > MAX_STORE_BYTES || count > MAX_RECORDS {
            return Err(RecoveryError::TooLarge);
        }
        Ok(atomic_write(&temp, &target, bytes)?)
    }
}
fn remove_if_present(path: &Path) -> Result<(), std::io::Error> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        result => result,
    }
}
fn read_bytes(path: &Path) -> Result<Vec<u8>, RecoveryError> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take(MAX_SNAPSHOT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(RecoveryError::TooLarge);
    }
    Ok(bytes)
}
fn settle_temp(dir: &Path, id: &str) -> Result<(), RecoveryError> {
    let temp = snapshot_path(dir, id, "json.tmp")?;
    let target = snapshot_path(dir, id, "json")?;
    if !temp.exists() {
        return Ok(());
    }
    let bytes = read_bytes(&temp)?;
    match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(_) => {
            let file = OpenOptions::new().write(true).open(&temp)?;
            sync_file(&file)?;
            drop(file);
            durable_rename(&temp, &target)?;
        }
        Err(error) if error.is_eof() => {
            remove_if_present(&temp)?;
            sync_directory(dir)?;
        }
        Err(_) => {
            return Err(RecoveryError::Unavailable(
                "temporary recovery data cannot be validated".into(),
            ));
        }
    }
    Ok(())
}
fn list_snapshot_sessions(dir: &Path) -> Result<Vec<String>, RecoveryError> {
    let _namespace = namespace_lock(dir)?;
    let mut ids = BTreeSet::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if let Some(id) = name
            .strip_suffix(".json")
            .or_else(|| name.strip_suffix(".json.tmp"))
        {
            if snapshot_path(dir, id, "json").is_ok() {
                ids.insert(id.to_owned());
            }
        } else if let Some(id) = name.strip_suffix(".lock") {
            if snapshot_path(dir, id, "lock").is_ok()
                && !snapshot_path(dir, id, "json")?.exists()
                && !snapshot_path(dir, id, "json.tmp")?.exists()
            {
                let file = open_lock(&path)?;
                if file.try_lock().is_ok() {
                    drop(file);
                    remove_if_present(&path)?;
                }
            }
        }
    }
    Ok(ids.into_iter().collect())
}
fn quarantine_temp(dir: &Path, id: &str) -> Result<String, RecoveryError> {
    let _namespace = namespace_lock(dir)?;
    let target = snapshot_path(dir, id, "json")?;
    if !target.exists() {
        // Without a completed copy, retain the same claimed id for inspection and explicit discard.
        durable_rename(&snapshot_path(dir, id, "json.tmp")?, &target)?;
        return Ok(id.to_owned());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for suffix in 0_u64.. {
        let retained = format!("quarantine-{stamp:x}-{suffix}");
        if ["json", "json.tmp", "lock"]
            .iter()
            .any(|ext| dir.join(format!("{retained}.{ext}")).exists())
        {
            continue;
        }
        // A later cleanup of the restored source must not discard the unreadable alternative.
        durable_rename(
            &snapshot_path(dir, id, "json.tmp")?,
            &snapshot_path(dir, &retained, "json")?,
        )?;
        return Ok(retained);
    }
    unreachable!()
}
fn read_info(dir: &Path, id: &str) -> Result<serde_json::Value, RecoveryError> {
    let temp_error = settle_temp(dir, id).err();
    let path = snapshot_path(dir, id, "json")?;
    let warning = temp_error.map(|error| match quarantine_temp(dir, id) {
        Ok(retained) => format!("{id}: {error}; temporary data retained as {retained}"),
        Err(preserve_error) => format!("{id}: {error}; {preserve_error}"),
    });
    if !path.exists() {
        return warning.map_or(Ok(serde_json::Value::Null), |warning| {
            Err(RecoveryError::Unavailable(warning))
        });
    }
    let parsed: Option<serde_json::Value> = serde_json::from_slice(&read_bytes(&path)?).ok();
    let mut info = match parsed {
        Some(serde_json::Value::Object(mut object)) => {
            if object
                .get("contents")
                .is_some_and(serde_json::Value::is_string)
            {
                object.retain(|key, _| {
                    matches!(
                        key.as_str(),
                        "version" | "file" | "documentName" | "savedAt"
                    )
                });
                serde_json::Value::Object(object)
            } else {
                serde_json::json!({"invalid":true,"version":object.get("version")})
            }
        }
        _ => serde_json::json!({"invalid":true}),
    };
    if let Some(warning) = warning {
        info["temporaryError"] = serde_json::Value::String(warning);
    }
    Ok(info)
}
/// The part of the stored envelope the shell reads: which file the edits came from.
#[derive(Deserialize)]
struct SnapshotSource {
    file: Option<SnapshotFile>,
}
#[derive(Deserialize)]
struct SnapshotFile {
    handle: FilePath,
}
fn snapshot_source(bytes: &[u8]) -> Result<Option<PathBuf>, RecoveryError> {
    let source: SnapshotSource =
        serde_json::from_slice(bytes).map_err(|e| RecoveryError::InvalidSnapshot(e.to_string()))?;
    source
        .file
        .map(|file| {
            file.handle
                .into_path()
                .map_err(RecoveryError::InvalidSnapshot)
        })
        .transpose()
}
/// Why checked on write: reading the copy back grants its file, so it may only name a granted one.
fn require_granted_source(bytes: &[u8], granted: &GrantedFiles) -> Result<(), RecoveryError> {
    // Why here too: an oversized copy is refused anyway, so it is not worth parsing first.
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(RecoveryError::TooLarge);
    }
    match snapshot_source(bytes)? {
        Some(path) if !granted.is_granted(&path) => Err(RecoveryError::NotGranted),
        _ => Ok(()),
    }
}
/// A restored copy saves back to its file, which the session that wrote the copy was granted.
fn grant_snapshot_source(bytes: &[u8], granted: &GrantedFiles) {
    if let Ok(Some(path)) = snapshot_source(bytes) {
        granted.grant(&path);
    }
}
/// Restore reads the copy and grants the file it names, so the restored document saves back to it.
fn read_snapshot_for_restore(
    dir: &Path,
    files: &RecoveryFiles,
    granted: &GrantedFiles,
    id: &str,
) -> Result<Vec<u8>, RecoveryError> {
    files.require(id)?;
    let bytes = read_bytes(&snapshot_path(dir, id, "json")?)?;
    grant_snapshot_source(&bytes, granted);
    Ok(bytes)
}
fn write_granted_snapshot(
    dir: &Path,
    files: &RecoveryFiles,
    granted: &GrantedFiles,
    id: &str,
    bytes: &[u8],
) -> Result<(), RecoveryError> {
    // Why before the parse: a session this process does not own is refused without reading the copy.
    files.require(id)?;
    require_granted_source(bytes, granted)?;
    files.write(dir, id, bytes)
}
async fn blocking<T: Send + 'static>(
    app: AppHandle,
    task: impl FnOnce(&Path, &mut RecoveryFiles) -> Result<T, RecoveryError> + Send + 'static,
) -> Result<T, RecoveryError> {
    let state = app.state::<RecoveryState>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| RecoveryError::Unavailable(e.to_string()))?
            .join("recovery");
        let mut files = state
            .0
            .lock()
            .map_err(|e| RecoveryError::Unavailable(e.to_string()))?;
        task(&dir, &mut files)
    })
    .await
    .map_err(|e| RecoveryError::Unavailable(e.to_string()))?
}
#[tauri::command]
pub async fn recovery_directory(app: AppHandle) -> Result<String, RecoveryError> {
    blocking(app, |dir, _| Ok(dir.to_string_lossy().into_owned())).await
}
#[tauri::command]
pub async fn start_recovery_session(app: AppHandle) -> Result<(), RecoveryError> {
    blocking(app, |dir, files| {
        let ids: Vec<_> = files.claims.keys().cloned().collect();
        for id in ids {
            files.release(dir, &id)?;
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn claim_recovery_session(
    app: AppHandle,
    session_id: String,
) -> Result<bool, RecoveryError> {
    blocking(app, move |dir, files| files.claim(dir, &session_id)).await
}
#[tauri::command]
pub async fn release_recovery_session(
    app: AppHandle,
    session_id: String,
) -> Result<(), RecoveryError> {
    blocking(app, move |dir, files| files.release(dir, &session_id)).await
}
#[tauri::command]
pub async fn list_recovery_sessions(app: AppHandle) -> Result<Vec<String>, RecoveryError> {
    blocking(app, |dir, _| list_snapshot_sessions(dir)).await
}
#[tauri::command]
pub async fn read_recovery_info(
    app: AppHandle,
    session_id: String,
) -> Result<serde_json::Value, RecoveryError> {
    blocking(app, move |dir, files| {
        files.require(&session_id)?;
        read_info(dir, &session_id)
    })
    .await
}
#[tauri::command]
pub async fn read_recovery_snapshot(
    app: AppHandle,
    session_id: String,
) -> Result<tauri::ipc::Response, RecoveryError> {
    let granted = app.state::<GrantedFiles>().inner().clone();
    blocking(app, move |dir, files| {
        read_snapshot_for_restore(dir, files, &granted, &session_id).map(tauri::ipc::Response::new)
    })
    .await
}
#[tauri::command]
pub async fn write_recovery_snapshot(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), RecoveryError> {
    let id = request
        .headers()
        .get("x-recovery-session")
        .and_then(|s| s.to_str().ok())
        .ok_or(RecoveryError::InvalidSession)?
        .to_owned();
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RecoveryError::Unavailable(
            "expected binary snapshot".into(),
        ));
    };
    let bytes = bytes.clone();
    let granted = app.state::<GrantedFiles>().inner().clone();
    blocking(app, move |dir, files| {
        write_granted_snapshot(dir, files, &granted, &id, &bytes)
    })
    .await
}
#[tauri::command]
pub async fn clear_recovery_snapshots(
    app: AppHandle,
    session_ids: Vec<String>,
) -> Result<(), RecoveryError> {
    blocking(app, move |dir, files| files.clear(dir, &session_ids)).await
}

#[cfg(test)]
#[path = "recovery_store_tests.rs"]
mod tests;
