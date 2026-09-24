use super::*;

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("canvaslide-atomic-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[test]
fn replaces_the_target_with_the_new_bytes() {
    let dir = temp_dir("replace");
    let temp = dir.join("deck.canvaslide.tmp");
    let target = dir.join("deck.canvaslide");
    std::fs::write(&target, b"old").unwrap();
    atomic_write(&temp, &target, b"new").unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), b"new");
    assert!(!temp.exists());
    std::fs::remove_dir_all(dir).unwrap();
}

/// The rename is what publishes the file, so it must wait until the bytes are on the disk.
#[test]
fn a_failed_sync_never_publishes_the_replacement() {
    let dir = temp_dir("sync-failure");
    let temp = dir.join("a.json.tmp");
    let target = dir.join("a.json");
    std::fs::write(&target, b"old copy").unwrap();
    let result = write_with_sync(&temp, &target, b"replacement", |file| {
        assert_eq!(file.metadata()?.len(), b"replacement".len() as u64);
        assert_eq!(std::fs::read(&target).unwrap(), b"old copy");
        Err(std::io::Error::other("injected synchronization failure"))
    });
    assert!(result.is_err());
    assert_eq!(std::fs::read(&target).unwrap(), b"old copy");
    assert_eq!(std::fs::read(&temp).unwrap(), b"replacement");
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(not(windows))]
#[test]
fn a_bare_file_name_syncs_the_working_directory() {
    assert_eq!(
        parent_directory(Path::new("deck.canvaslide")),
        Path::new(".")
    );
    assert_eq!(
        parent_directory(Path::new("/deck.canvaslide")),
        Path::new("/")
    );
    assert_eq!(
        parent_directory(Path::new("/a/deck.canvaslide")),
        Path::new("/a")
    );
}

#[cfg(not(windows))]
#[test]
fn only_a_volume_that_cannot_sync_directories_is_tolerated() {
    use std::io::{Error, ErrorKind};
    for kind in [
        ErrorKind::Unsupported,
        ErrorKind::InvalidInput,
        ErrorKind::PermissionDenied,
    ] {
        assert!(directory_sync_unavailable(&Error::from(kind)), "{kind:?}");
    }
    assert!(!directory_sync_unavailable(&Error::from_raw_os_error(5))); // EIO
    assert!(!directory_sync_unavailable(&Error::from(
        ErrorKind::NotFound
    )));
}

/// Two exports to one name can overlap; each must publish whole bytes, never an interleaving.
#[test]
fn overlapping_writes_to_one_target_each_publish_whole_bytes() {
    let dir = temp_dir("overlap");
    let temp = dir.join("deck.html.tmp");
    let target = dir.join("deck.html");
    let payloads: Vec<Vec<u8>> = (0..8u8)
        .map(|n| vec![b'a' + n; 64 * 1024 * (usize::from(n) + 1)])
        .collect();
    std::thread::scope(|scope| {
        for payload in &payloads {
            let (temp, target) = (&temp, &target);
            scope.spawn(move || {
                for _ in 0..10 {
                    atomic_write(temp, target, payload).unwrap();
                }
            });
        }
    });
    assert!(payloads.contains(&std::fs::read(&target).unwrap()));
    assert!(!temp.exists());
    std::fs::remove_dir_all(dir).unwrap();
}
