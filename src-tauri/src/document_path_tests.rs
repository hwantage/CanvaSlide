use super::*;

fn granted(paths: &[&Path]) -> GrantedFiles {
    let files = GrantedFiles::default();
    for path in paths {
        files.grant(path);
    }
    files
}

fn through_bridge(path: &Path) -> FilePath {
    serde_json::from_str(&serde_json::to_string(&FilePath::from_path(path)).unwrap()).unwrap()
}

#[test]
fn normalization_preserves_existing_hidden_and_mixed_case_name_behavior() {
    for (name, expected) in [
        (".json", ".canvaslide"),
        (".JSON", ".canvaslide"),
        ("deck.CANVASLIDE", "deck.CANVASLIDE"),
        ("deck.foo", "deck.foo.canvaslide"),
    ] {
        assert_eq!(
            normalize_document_path(Path::new(name)),
            Path::new(expected)
        );
    }
}

#[test]
fn unicode_path_reads_and_saves_through_the_commands() {
    let dir = std::env::temp_dir().join(format!("canvaslide-unicode-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let selected = dir.join("계획 😀.json");
    std::fs::write(&selected, r#"{"original":true}"#).unwrap();
    let save_as = normalize_document_path(&selected);
    let files = granted(&[&selected, &save_as]);
    assert_eq!(
        read_granted_document(&files, through_bridge(&selected)).unwrap(),
        r#"{"original":true}"#
    );
    let saved =
        write_granted_document(&files, through_bridge(&selected), r#"{"edited":true}"#).unwrap();
    assert_eq!(saved.into_path().unwrap(), selected);
    let saved_as = write_granted_document(&files, through_bridge(&save_as), "{}").unwrap();
    assert_eq!(
        saved_as.into_path().unwrap(),
        dir.join("계획 😀.canvaslide")
    );
    assert_eq!(
        std::fs::read_to_string(selected).unwrap(),
        r#"{"edited":true}"#
    );
    std::fs::remove_dir_all(dir).unwrap();
}

/// Only the shell hands out paths; one the webview names on its own is refused before any IO.
#[test]
fn a_path_nobody_picked_is_neither_read_nor_written() {
    let dir = std::env::temp_dir().join(format!("canvaslide-ungranted-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("deck.canvaslide");
    std::fs::write(&path, "{}").unwrap();
    let files = granted(&[&dir.join("picked.canvaslide")]);

    assert!(matches!(
        read_granted_document(&files, through_bridge(&path)),
        Err(DocumentIoError::NotGranted(_))
    ));
    assert!(matches!(
        write_granted_document(&files, through_bridge(&path), r#"{"edited":true}"#),
        Err(DocumentIoError::NotGranted(_))
    ));
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
    let created = dir.join("new.canvaslide");
    assert!(write_granted_document(&files, through_bridge(&created), "{}").is_err());
    assert!(!created.exists());
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[test]
fn normalization_keeps_non_utf8_names_and_directories() {
    use std::os::unix::ffi::OsStringExt;
    let expected = PathBuf::from(std::ffi::OsString::from_vec(
        b"/tmp/dir\xfe/deck\xff.canvaslide".to_vec(),
    ));
    for suffix in ["", ".json", ".JSON", ".canvaslide"] {
        let mut bytes = b"/tmp/dir\xfe/deck\xff".to_vec();
        bytes.extend(suffix.as_bytes());
        let path = PathBuf::from(std::ffi::OsString::from_vec(bytes));
        assert_eq!(normalize_document_path(&path), expected);
    }
}

// macOS filesystems can reject these filenames even though Unix OsString supports the bytes.
#[cfg(target_os = "linux")]
#[test]
fn non_utf8_commands_never_read_or_overwrite_the_lossy_twin() {
    use std::os::unix::ffi::OsStringExt;
    let root = std::env::temp_dir().join(format!("canvaslide-native-{}", std::process::id()));
    let dir = root.join(std::ffi::OsString::from_vec(b"directory\xfe".to_vec()));
    std::fs::create_dir_all(&dir).unwrap();
    for suffix in [".canvaslide", ".json"] {
        let mut name = b"deck\xff".to_vec();
        name.extend(suffix.as_bytes());
        let selected = dir.join(std::ffi::OsString::from_vec(name));
        let lossy = PathBuf::from(selected.to_string_lossy().into_owned());
        std::fs::create_dir_all(lossy.parent().unwrap()).unwrap();
        std::fs::write(&selected, r#"{"original":true}"#).unwrap();
        std::fs::write(&lossy, r#"{"different":true}"#).unwrap();
        let files = granted(&[&selected]);

        assert_eq!(
            read_granted_document(&files, through_bridge(&selected)).unwrap(),
            r#"{"original":true}"#
        );
        let saved = write_granted_document(&files, through_bridge(&selected), r#"{"edited":true}"#)
            .unwrap();
        assert_eq!(saved.clone().into_path().unwrap(), selected);
        assert_eq!(
            read_granted_document(&files, saved).unwrap(),
            r#"{"edited":true}"#
        );
        assert_eq!(
            std::fs::read_to_string(lossy).unwrap(),
            r#"{"different":true}"#
        );
    }

    for suffix in ["", ".json"] {
        let mut name = b"save-as\xff".to_vec();
        name.extend(suffix.as_bytes());
        let selected = dir.join(std::ffi::OsString::from_vec(name));
        let expected = dir.join(std::ffi::OsString::from_vec(
            b"save-as\xff.canvaslide".to_vec(),
        ));
        let lossy = PathBuf::from(expected.to_string_lossy().into_owned());
        std::fs::write(&lossy, "unchanged").unwrap();
        let save_as = normalize_document_path(&selected);
        let files = granted(&[&save_as]);
        let saved = write_granted_document(&files, through_bridge(&save_as), "{}").unwrap();
        assert_eq!(saved.clone().into_path().unwrap(), expected);
        let saved: FilePath =
            serde_json::from_str(&serde_json::to_string(&saved).unwrap()).unwrap();
        write_granted_document(&files, saved.clone(), r#"{"savedAgain":true}"#).unwrap();
        assert_eq!(
            read_granted_document(&files, saved).unwrap(),
            r#"{"savedAgain":true}"#
        );
        assert_eq!(std::fs::read_to_string(lossy).unwrap(), "unchanged");
    }
    std::fs::remove_dir_all(root).unwrap();
}

/// The same refusal through the IPC commands the webview actually calls.
#[test]
fn the_ipc_commands_act_only_on_granted_files() {
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    let dir = std::env::temp_dir().join(format!("canvaslide-ipc-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("deck.canvaslide");
    std::fs::write(&path, "{}").unwrap();
    let files = GrantedFiles::default();
    let app = mock_builder()
        .manage(files.clone())
        .invoke_handler(tauri::generate_handler![read_document, write_document])
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let invoke = |cmd: &str, args: serde_json::Value| {
        get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<serde_json::Value>().unwrap())
    };
    let handle = serde_json::to_value(FilePath::from_path(&path)).unwrap();
    let read = serde_json::json!({ "path": handle });
    let write = serde_json::json!({ "path": handle, "contents": r#"{"edited":true}"# });

    assert!(invoke("read_document", read.clone()).is_err());
    assert!(invoke("write_document", write.clone()).is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");

    files.grant(&path);
    assert_eq!(invoke("read_document", read), Ok(serde_json::json!("{}")));
    assert_eq!(invoke("write_document", write), Ok(handle));
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        r#"{"edited":true}"#
    );
    std::fs::remove_dir_all(dir).unwrap();
}
