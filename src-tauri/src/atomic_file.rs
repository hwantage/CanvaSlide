//! Replaces a file so that a crash or power loss leaves either the old or the new contents in place,
//! never a torn file. Documents, exports and recovery copies all go through here.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};

// Why: two exports to one name can overlap, and they would interleave bytes in their shared temp file.
static BUSY_TEMPS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
static TEMP_RELEASED: Condvar = Condvar::new();

/// Holds a temp path for one write; other writes to the same path wait, unrelated writes do not.
struct TempClaim(PathBuf);

impl TempClaim {
    fn wait_for(temp: &Path) -> Self {
        // Why: a poisoned lock only means another write panicked; the list it guards is still usable.
        let mut busy = BUSY_TEMPS.lock().unwrap_or_else(|e| e.into_inner());
        while busy.iter().any(|held| held == temp) {
            busy = TEMP_RELEASED.wait(busy).unwrap_or_else(|e| e.into_inner());
        }
        busy.push(temp.to_path_buf());
        Self(temp.to_path_buf())
    }
}

impl Drop for TempClaim {
    fn drop(&mut self) {
        let mut busy = BUSY_TEMPS.lock().unwrap_or_else(|e| e.into_inner());
        busy.retain(|held| held != &self.0);
        TEMP_RELEASED.notify_all();
    }
}

/// Writes `temp`, flushes it to the disk, then renames it over `target`. A failure before the rename
/// leaves `target` untouched and `temp` behind for the caller to inspect or retry.
pub fn atomic_write(temp: &Path, target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    write_with_sync(temp, target, bytes, sync_file)
}

pub(crate) fn write_with_sync(
    temp: &Path,
    target: &Path,
    bytes: &[u8],
    synchronize: impl FnOnce(&File) -> std::io::Result<()>,
) -> std::io::Result<()> {
    let _claim = TempClaim::wait_for(temp);
    let mut file = File::create(temp)?;
    file.write_all(bytes)?;
    synchronize(&file)?;
    drop(file);
    durable_rename(temp, target)
}

/// Flushes a file's data and metadata to the storage device, not just to the OS cache.
#[cfg(not(target_vendor = "apple"))]
pub fn sync_file(file: &File) -> std::io::Result<()> {
    file.sync_all()
}

/// Why the fallback: Apple's `sync_all` is `F_FULLFSYNC`, which some volumes (network shares, FAT)
/// refuse; a plain `fsync` is what those volumes offer, so a document saved there is not refused.
#[cfg(target_vendor = "apple")]
pub fn sync_file(file: &File) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;
    extern "C" {
        fn fsync(fd: std::ffi::c_int) -> std::ffi::c_int;
    }
    file.sync_all().or_else(|error| {
        // The descriptor stays open for the duration of this synchronous call.
        if unsafe { fsync(file.as_raw_fd()) } == 0 {
            Ok(())
        } else {
            Err(error)
        }
    })
}

#[cfg(not(windows))]
pub fn durable_rename(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)?;
    match sync_directory(parent_directory(to)) {
        Err(error) if directory_sync_unavailable(&error) => Ok(()),
        result => result,
    }
}

#[cfg(windows)]
pub fn durable_rename(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
    }
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    let from_wide: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to_wide: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    // Both buffers are terminated and live through the synchronous write-through rename.
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    if unsafe { MoveFileExW(from_wide.as_ptr(), to_wide.as_ptr(), flags) } != 0 {
        return Ok(());
    }
    // Why: std's rename adds the `\\?\` prefix long paths need and retries a refused replacement
    // (a read-only target, or one another program holds open) with POSIX semantics.
    std::fs::rename(from, to)
}

/// A bare file name lives in the working directory, which `Path::parent` reports as empty.
#[cfg(not(windows))]
fn parent_directory(path: &Path) -> &Path {
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    }
}

/// Why tolerated: the rename has already happened, and a volume that cannot open or sync a directory
/// (network shares, FAT, write-only folders) must not turn a completed save into a reported failure.
#[cfg(not(windows))]
fn directory_sync_unavailable(error: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    matches!(
        error.kind(),
        ErrorKind::Unsupported | ErrorKind::InvalidInput | ErrorKind::PermissionDenied
    )
}

#[cfg(not(windows))]
pub fn sync_directory(dir: &Path) -> std::io::Result<()> {
    sync_file(&File::open(dir)?)
}

#[cfg(windows)]
pub fn sync_directory(_dir: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
#[path = "atomic_file_tests.rs"]
mod tests;
