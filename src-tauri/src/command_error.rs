//! The error every fallible command hands the webview: a stable `code` the UI localizes and branches
//! on, and the technical `detail` (a path, an OS message) shown beneath the localized message.

use serde::Serialize;

/// Every code a command can return; `native-command.ts` maps each one to a localized message.
pub const CODES: &[&str] = &[
    "invalid_path",
    "not_granted",
    "not_a_document",
    "invalid_document",
    "invalid_export",
    "too_large",
    "not_found",
    "permission_denied",
    "storage_full",
    "io",
    "task_failed",
    "recovery_session",
    "recovery_too_large",
    "recovery_unavailable",
    "recovery_invalid",
    "video_host_unavailable",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub detail: String,
}

impl CommandError {
    pub fn new(code: &'static str, detail: impl ToString) -> Self {
        debug_assert!(CODES.contains(&code), "unlisted command error code {code}");
        Self {
            code,
            detail: detail.to_string(),
        }
    }

    pub fn io(error: &std::io::Error) -> Self {
        Self::new(io_code(error), error)
    }

    /// The blocking task behind an async command ended without an answer.
    fn task_failed(error: impl ToString) -> Self {
        Self::new("task_failed", error)
    }
}

fn io_code(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "not_found",
        std::io::ErrorKind::PermissionDenied => "permission_denied",
        _ if is_storage_full(error) => "storage_full",
        _ => "io",
    }
}

// Why raw codes: `ErrorKind::StorageFull` and `QuotaExceeded` are newer than the minimum Rust version.
fn is_storage_full(error: &std::io::Error) -> bool {
    #[cfg(target_vendor = "apple")]
    const FULL: &[i32] = &[28, 69]; // ENOSPC, EDQUOT
    #[cfg(all(unix, not(target_vendor = "apple")))]
    const FULL: &[i32] = &[28, 122]; // ENOSPC, EDQUOT on Linux
    #[cfg(windows)]
    const FULL: &[i32] = &[39, 112, 1295]; // handle/disk full, ERROR_DISK_QUOTA_EXCEEDED
    #[cfg(not(any(unix, windows)))]
    const FULL: &[i32] = &[];
    error
        .raw_os_error()
        .is_some_and(|code| FULL.contains(&code))
}

/// Runs blocking file or font work on Tauri's blocking pool, so the main thread keeps the UI live.
pub async fn off_main_thread<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(CommandError::task_failed)?
}

#[cfg(test)]
#[path = "command_error_tests.rs"]
mod tests;
