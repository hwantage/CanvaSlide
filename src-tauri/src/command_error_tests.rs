use super::*;
use std::io::{Error, ErrorKind};

#[test]
fn reaches_the_webview_as_a_code_and_a_detail() {
    assert_eq!(
        serde_json::to_value(CommandError::new("not_found", "deck.canvaslide")).unwrap(),
        serde_json::json!({ "code": "not_found", "detail": "deck.canvaslide" })
    );
}

#[test]
fn io_errors_are_coded_by_what_the_user_can_do_about_them() {
    #[cfg(target_vendor = "apple")]
    let (full, quota) = (28, 69);
    #[cfg(all(unix, not(target_vendor = "apple")))]
    let (full, quota) = (28, 122);
    #[cfg(windows)]
    let (full, quota) = (112, 1295);
    for (error, code) in [
        (Error::from(ErrorKind::NotFound), "not_found"),
        (
            Error::from(ErrorKind::PermissionDenied),
            "permission_denied",
        ),
        (Error::from_raw_os_error(full), "storage_full"),
        (Error::from_raw_os_error(quota), "storage_full"),
        (Error::other("anything else"), "io"),
    ] {
        assert_eq!(CommandError::io(&error).code, code);
    }
}

#[test]
fn codes_are_unique() {
    let mut sorted = CODES.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), CODES.len());
}

#[test]
fn blocking_work_leaves_the_calling_thread_and_a_panic_is_reported() {
    let caller = std::thread::current().id();
    let worker =
        tauri::async_runtime::block_on(off_main_thread(|| Ok(std::thread::current().id())));
    assert_ne!(worker.unwrap(), caller);
    let panicked = tauri::async_runtime::block_on(off_main_thread::<()>(|| panic!("task died")));
    assert_eq!(panicked.unwrap_err().code, "task_failed");
}
