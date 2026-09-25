use super::*;
fn temp_dir(tag: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../discuss")
        .join(format!("recovery-test-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
}
#[test]
fn a_session_replaces_only_its_own_snapshot() {
    let dir = temp_dir("per-session");
    let mut files = RecoveryFiles::default();
    for id in ["a", "b"] {
        assert!(files.claim(&dir, id).unwrap());
        files.write(&dir, id, id.as_bytes()).unwrap();
    }
    files.write(&dir, "a", b"a2").unwrap();
    assert_eq!(read_bytes(&dir.join("a.json")).unwrap(), b"a2");
    assert_eq!(read_bytes(&dir.join("b.json")).unwrap(), b"b");
    files.clear(&dir, &["a".into()]).unwrap();
    assert_eq!(list_snapshot_sessions(&dir).unwrap(), ["b"]);
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn a_session_id_cannot_name_a_file_outside_the_recovery_directory() {
    let dir = temp_dir("paths");
    let mut files = RecoveryFiles::default();
    for hostile in ["../escape", "a/b", "a\\b", "", "a.b", "with space", "é"] {
        assert!(files.claim(&dir, hostile).is_err());
    }
    assert!(files.claim(&dir, &"x".repeat(129)).is_err());
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn two_native_instances_cannot_claim_read_or_delete_live_work() {
    let dir = temp_dir("claims");
    let mut a = RecoveryFiles::default();
    let mut b = RecoveryFiles::default();
    assert!(a.claim(&dir, "lost").unwrap());
    a.write(&dir, "lost", b"only copy").unwrap();
    assert!(!b.claim(&dir, "lost").unwrap());
    assert!(b.require("lost").is_err());
    assert!(b.clear(&dir, &["lost".into()]).is_err());
    a.release(&dir, "lost").unwrap();
    assert!(b.claim(&dir, "lost").unwrap());
    assert!(!a.claim(&dir, "lost").unwrap());
    assert_eq!(read_bytes(&dir.join("lost.json")).unwrap(), b"only copy");
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn failed_replacement_keeps_the_old_copy() {
    let dir = temp_dir("failure");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "a").unwrap();
    files.write(&dir, "a", b"old copy").unwrap();
    std::fs::create_dir(dir.join("a.json.tmp")).unwrap();
    assert!(files.write(&dir, "a", b"new copy").is_err());
    assert_eq!(read_bytes(&dir.join("a.json")).unwrap(), b"old copy");
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn incomplete_temps_are_removed_and_complete_unknown_temps_are_preserved() {
    let dir = temp_dir("orphans");
    let mut files = RecoveryFiles::default();
    for id in ["partial", "complete"] {
        files.claim(&dir, id).unwrap();
    }
    std::fs::write(dir.join("partial.json.tmp"), b"{\"version\":").unwrap();
    std::fs::write(
        dir.join("complete.json.tmp"),
        br#"{"version":99,"futurePayload":"important"}"#,
    )
    .unwrap();
    assert_eq!(
        list_snapshot_sessions(&dir).unwrap(),
        ["complete", "partial"]
    );
    assert!(read_info(&dir, "partial").unwrap().is_null());
    assert!(!dir.join("partial.json.tmp").exists());
    assert_eq!(read_info(&dir, "complete").unwrap()["version"], 99);
    assert!(dir.join("complete.json").exists());
    assert!(!dir.join("complete.json.tmp").exists());
    let future = br#"{"version":"next","futurePayload":"keep"}"#;
    std::fs::write(dir.join("complete.json.tmp"), future).unwrap();
    read_info(&dir, "complete").unwrap();
    assert_eq!(read_bytes(&dir.join("complete.json")).unwrap(), future);
    std::fs::write(dir.join("complete.json.tmp"), b"unrecognized data").unwrap();
    assert!(read_info(&dir, "complete").unwrap()["temporaryError"].is_string());
    assert_eq!(read_bytes(&dir.join("complete.json")).unwrap(), future);
    assert!(!dir.join("complete.json.tmp").exists());
    let retained = list_snapshot_sessions(&dir)
        .unwrap()
        .into_iter()
        .find(|id| id.starts_with("quarantine-"))
        .unwrap();
    assert_eq!(
        read_bytes(&snapshot_path(&dir, &retained, "json").unwrap()).unwrap(),
        b"unrecognized data"
    );
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn malformed_and_unknown_envelopes_are_not_deleted() {
    let dir = temp_dir("quarantine");
    let mut files = RecoveryFiles::default();
    for (id, contents) in [
        ("invalid", "not json"),
        ("future", "{\"version\":2,\"contents\":\"keep\"}"),
    ] {
        files.claim(&dir, id).unwrap();
        files.write(&dir, id, contents.as_bytes()).unwrap();
        let info = read_info(&dir, id).unwrap();
        assert!(info.get("contents").is_none());
        assert_eq!(
            read_bytes(&dir.join(format!("{id}.json"))).unwrap(),
            contents.as_bytes()
        );
    }
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn clearing_a_directory_that_was_never_written_is_not_an_error() {
    let dir = temp_dir("empty");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "a").unwrap();
    files.clear(&dir, &["a".into()]).unwrap();
    assert!(list_snapshot_sessions(&dir).unwrap().is_empty());
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn quota_refuses_a_new_write_without_evicting_unanswered_work() {
    let dir = temp_dir("quota");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "new").unwrap();
    let old = File::create(dir.join("old.json")).unwrap();
    old.set_len(MAX_STORE_BYTES).unwrap();
    assert!(matches!(
        files.write(&dir, "new", b"copy"),
        Err(RecoveryError::TooLarge)
    ));
    assert_eq!(old.metadata().unwrap().len(), MAX_STORE_BYTES);
    assert!(!dir.join("new.json").exists());
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn dead_empty_lock_files_are_collected_without_unlocking_a_live_session() {
    let dir = temp_dir("stale-locks");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "live").unwrap();
    File::create(dir.join("dead.lock")).unwrap();
    list_snapshot_sessions(&dir).unwrap();
    assert!(dir.join("live.lock").exists());
    assert!(!dir.join("dead.lock").exists());
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn native_claims_are_exclusive_across_processes() {
    let dir = temp_dir("process-locks");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "live").unwrap();
    files.write(&dir, "live", b"only copy").unwrap();
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "recovery_store::tests::native_claim_child_probe",
            "--nocapture",
        ])
        .env("CANVASLIDE_RECOVERY_TEST_DIR", &dir)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(String::from_utf8_lossy(&result.stdout).contains("1 passed"));
    assert_eq!(read_bytes(&dir.join("live.json")).unwrap(), b"only copy");
    std::fs::remove_dir_all(dir).unwrap();
}
#[test]
fn native_claim_child_probe() {
    let Some(path) = std::env::var_os("CANVASLIDE_RECOVERY_TEST_DIR") else {
        return;
    };
    let dir = PathBuf::from(path);
    let mut files = RecoveryFiles::default();
    assert!(!files.claim(&dir, "live").unwrap());
    assert!(files.clear(&dir, &["live".into()]).is_err());
    assert!(files.write(&dir, "live", b"overwrite").is_err());
}
#[test]
fn metadata_scan_returns_only_known_metadata_fields() {
    let dir = temp_dir("metadata");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "a").unwrap();
    let contents = serde_json::json!({
        "version": 1, "file": null, "documentName": "Large deck", "savedAt": 1000,
        "contents": "payload".repeat(100_000), "futurePayload": "extra".repeat(100_000)
    });
    files
        .write(&dir, "a", &serde_json::to_vec(&contents).unwrap())
        .unwrap();
    assert_eq!(
        read_info(&dir, "a").unwrap(),
        serde_json::json!({
            "version": 1, "file": null, "documentName": "Large deck", "savedAt": 1000
        })
    );
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&read_bytes(&dir.join("a.json")).unwrap())
            .unwrap(),
        contents
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn corrupt_temp_only_becomes_a_discardable_quarantined_record() {
    let dir = temp_dir("corrupt-temp-only");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "lost").unwrap();
    let corrupt = b"{\"contents\":\"new revision\0\0\0\0";
    std::fs::write(dir.join("lost.json.tmp"), corrupt).unwrap();
    let info = read_info(&dir, "lost").unwrap();
    assert_eq!(info["invalid"], true);
    assert!(info["temporaryError"].is_string());
    assert!(!dir.join("lost.json.tmp").exists());
    assert_eq!(read_bytes(&dir.join("lost.json")).unwrap(), corrupt);
    files.release(&dir, "lost").unwrap();
    let mut next_launch = RecoveryFiles::default();
    assert_eq!(list_snapshot_sessions(&dir).unwrap(), ["lost"]);
    assert!(next_launch.claim(&dir, "lost").unwrap());
    assert_eq!(
        read_info(&dir, "lost").unwrap(),
        serde_json::json!({"invalid":true})
    );
    assert_eq!(read_bytes(&dir.join("lost.json")).unwrap(), corrupt);
    next_launch.clear(&dir, &["lost".into()]).unwrap();
    next_launch.release(&dir, "lost").unwrap();
    assert!(list_snapshot_sessions(&dir).unwrap().is_empty());
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[test]
fn failed_temp_quarantine_preserves_bytes_and_can_be_retried() {
    use std::os::unix::fs::PermissionsExt;
    let dir = temp_dir("quarantine-retry");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "lost").unwrap();
    let corrupt = b"unrecognized data";
    std::fs::write(dir.join("lost.json.tmp"), corrupt).unwrap();
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
    let failed = read_info(&dir, "lost");
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert!(failed.is_err());
    assert_eq!(read_bytes(&dir.join("lost.json.tmp")).unwrap(), corrupt);
    assert_eq!(read_info(&dir, "lost").unwrap()["invalid"], true);
    assert_eq!(read_bytes(&dir.join("lost.json")).unwrap(), corrupt);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn corrupt_temp_does_not_hide_or_replace_the_completed_copy() {
    let dir = temp_dir("corrupt-temp-fallback");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "lost").unwrap();
    let valid = serde_json::json!({
        "version":1,"file":null,"documentName":"Last valid copy","savedAt":1000,
        "contents":include_str!("../../examples/erd/shop-schema.canvaslide")
    });
    let bytes = serde_json::to_vec(&valid).unwrap();
    files.write(&dir, "lost", &bytes).unwrap();
    let corrupt = b"{\"contents\":\"new revision\0\0\0\0";
    std::fs::write(dir.join("lost.json.tmp"), corrupt).unwrap();
    let info = read_info(&dir, "lost").unwrap();
    assert_eq!(info["documentName"], "Last valid copy");
    assert!(info["temporaryError"]
        .as_str()
        .unwrap()
        .contains("temporary data retained"));
    assert_eq!(read_bytes(&dir.join("lost.json")).unwrap(), bytes);
    let retained = list_snapshot_sessions(&dir)
        .unwrap()
        .into_iter()
        .find(|id| id != "lost")
        .unwrap();
    files.clear(&dir, &["lost".into()]).unwrap();
    files.release(&dir, "lost").unwrap();
    assert!(files.claim(&dir, &retained).unwrap());
    assert_eq!(read_info(&dir, &retained).unwrap()["invalid"], true);
    assert_eq!(
        read_bytes(&snapshot_path(&dir, &retained, "json").unwrap()).unwrap(),
        corrupt
    );
    files.clear(&dir, std::slice::from_ref(&retained)).unwrap();
    files.release(&dir, &retained).unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn oversized_temp_does_not_hide_the_completed_copy() {
    let dir = temp_dir("oversized-temp-fallback");
    std::fs::write(
        dir.join("lost.json"),
        br#"{"version":1,"file":null,"documentName":"old","savedAt":1,"contents":"{}"}"#,
    )
    .unwrap();
    File::create(dir.join("lost.json.tmp"))
        .unwrap()
        .set_len(MAX_SNAPSHOT_BYTES as u64 + 1)
        .unwrap();
    let info = read_info(&dir, "lost").unwrap();
    assert_eq!(info["documentName"], "old");
    assert!(info["temporaryError"].is_string());
    assert_eq!(list_snapshot_sessions(&dir).unwrap().len(), 2);
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[test]
fn unreadable_temp_does_not_hide_the_completed_copy() {
    use std::os::unix::fs::PermissionsExt;
    let dir = temp_dir("unreadable-temp-fallback");
    std::fs::write(
        dir.join("lost.json"),
        br#"{"version":1,"file":null,"documentName":"old","savedAt":1,"contents":"{}"}"#,
    )
    .unwrap();
    let temp = dir.join("lost.json.tmp");
    std::fs::write(&temp, b"unreadable").unwrap();
    std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o000)).unwrap();
    assert!(read_bytes(&temp).is_err());
    let info = read_info(&dir, "lost").unwrap();
    assert_eq!(info["documentName"], "old");
    assert!(info["temporaryError"].is_string());
    assert_eq!(list_snapshot_sessions(&dir).unwrap().len(), 2);
    std::fs::remove_dir_all(dir).unwrap();
}

fn envelope(file: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "version": 1, "file": file, "documentName": "deck", "savedAt": 1, "contents": "{}"
    }))
    .unwrap()
}
fn names_deck() -> Vec<u8> {
    envelope(
        serde_json::json!({"display": "/tmp/deck.canvaslide", "handle": "/tmp/deck.canvaslide"}),
    )
}
#[test]
fn a_copy_may_name_only_a_file_granted_in_this_session() {
    let granted = GrantedFiles::default();
    assert!(matches!(
        require_granted_source(&names_deck(), &granted),
        Err(RecoveryError::NotGranted)
    ));
    assert!(require_granted_source(&envelope(serde_json::Value::Null), &granted).is_ok());
    granted.grant(Path::new("/tmp/deck.canvaslide"));
    assert!(require_granted_source(&names_deck(), &granted).is_ok());
}
/// The webview reads the envelope with `JSON.parse`, which keeps the last of repeated keys.
#[test]
fn a_copy_whose_file_cannot_be_read_unambiguously_is_refused() {
    let granted = GrantedFiles::default();
    granted.grant(Path::new("/tmp/deck.canvaslide"));
    let repeated = br#"{"version":1,"file":{"display":"a","handle":"/tmp/deck.canvaslide"},
        "file":{"display":"b","handle":"/tmp/other.canvaslide"},"documentName":"d","savedAt":1,
        "contents":"{}"}"#;
    for bytes in [
        &repeated[..],
        b"not json",
        br#"{"file":{"display":"a","handle":5}}"#,
        br#"{"file":{"display":"a","handle":"/tmp/deck.canvaslide","handle":"/tmp/x.json"}}"#,
    ] {
        assert!(matches!(
            require_granted_source(bytes, &granted),
            Err(RecoveryError::InvalidSnapshot(_))
        ));
    }
}
#[test]
fn reading_a_copy_back_grants_the_file_it_came_from() {
    let granted = GrantedFiles::default();
    grant_snapshot_source(b"not json", &granted);
    grant_snapshot_source(&envelope(serde_json::Value::Null), &granted);
    assert!(!granted.is_granted(Path::new("/tmp/deck.canvaslide")));
    grant_snapshot_source(&names_deck(), &granted);
    assert!(granted.is_granted(Path::new("/tmp/deck.canvaslide")));
}
#[cfg(unix)]
#[test]
fn a_non_utf8_source_is_granted_by_its_bytes() {
    use std::os::unix::ffi::OsStringExt;
    let path = PathBuf::from(std::ffi::OsString::from_vec(b"/tmp/deck\xff.json".to_vec()));
    let copy = envelope(serde_json::json!({
        "display": path.to_string_lossy(),
        "handle": FilePath::from_path(&path)
    }));
    let granted = GrantedFiles::default();
    grant_snapshot_source(&copy, &granted);
    assert!(granted.is_granted(&path));
    assert!(require_granted_source(&copy, &granted).is_ok());
}
#[test]
fn a_copy_naming_a_file_nobody_chose_is_not_stored() {
    let dir = temp_dir("ungranted-source");
    let mut files = RecoveryFiles::default();
    files.claim(&dir, "a").unwrap();
    let granted = GrantedFiles::default();
    assert!(matches!(
        write_granted_snapshot(&dir, &files, &granted, "a", &names_deck()),
        Err(RecoveryError::NotGranted)
    ));
    assert!(!dir.join("a.json").exists());
    std::fs::remove_dir_all(dir).unwrap();
}
/// The copy outlives the session that chose its file; the next one learns the file by restoring it.
#[test]
fn restoring_a_stored_copy_grants_its_file_to_the_next_session() {
    let dir = temp_dir("restore-grant");
    let mut writer = RecoveryFiles::default();
    writer.claim(&dir, "a").unwrap();
    let chosen = GrantedFiles::default();
    chosen.grant(Path::new("/tmp/deck.canvaslide"));
    write_granted_snapshot(&dir, &writer, &chosen, "a", &names_deck()).unwrap();
    writer.release(&dir, "a").unwrap();

    let next = GrantedFiles::default();
    let mut reader = RecoveryFiles::default();
    assert!(matches!(
        read_snapshot_for_restore(&dir, &reader, &next, "a"),
        Err(RecoveryError::NotOwned)
    ));
    assert!(!next.is_granted(Path::new("/tmp/deck.canvaslide")));
    reader.claim(&dir, "a").unwrap();
    assert_eq!(
        read_snapshot_for_restore(&dir, &reader, &next, "a").unwrap(),
        names_deck()
    );
    assert!(next.is_granted(Path::new("/tmp/deck.canvaslide")));
    std::fs::remove_dir_all(dir).unwrap();
}
/// The webview branches on the code: a full store reads as a quota problem in any language.
#[test]
fn recovery_errors_reach_the_webview_as_codes() {
    #[cfg(unix)]
    let full = std::io::Error::from_raw_os_error(28);
    #[cfg(windows)]
    let full = std::io::Error::from_raw_os_error(112);
    for (error, code) in [
        (RecoveryError::InvalidSession, "recovery_session"),
        (RecoveryError::NotOwned, "recovery_session"),
        (RecoveryError::TooLarge, "recovery_too_large"),
        (
            RecoveryError::Unavailable("x".into()),
            "recovery_unavailable",
        ),
        (
            RecoveryError::InvalidSnapshot("x".into()),
            "recovery_invalid",
        ),
        (RecoveryError::NotGranted, "not_granted"),
        (RecoveryError::Io(full), "storage_full"),
    ] {
        assert_eq!(serde_json::to_value(&error).unwrap()["code"], code);
    }
}
