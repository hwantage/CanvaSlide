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

    for (cmd, args) in [("read_document", &read), ("write_document", &write)] {
        assert_eq!(
            invoke(cmd, args.clone()).unwrap_err()["code"],
            "not_granted",
            "{cmd}"
        );
    }
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

#[test]
fn normalizes_bare_and_json_names() {
    assert_eq!(
        normalize_document_path(Path::new("/tmp/deck")),
        PathBuf::from("/tmp/deck.canvaslide")
    );
    assert_eq!(
        normalize_document_path(Path::new("/tmp/deck.json")),
        PathBuf::from("/tmp/deck.canvaslide")
    );
    assert_eq!(
        normalize_document_path(Path::new("/tmp/deck.canvaslide")),
        PathBuf::from("/tmp/deck.canvaslide")
    );
}

#[test]
fn round_trips_a_document() {
    let dir = std::env::temp_dir().join(format!("uc-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = normalize_document_path(&dir.join("doc"));
    let written = write_document_file(&path, r#"{"version":1,"elements":[]}"#).unwrap();
    assert!(written.ends_with("doc.canvaslide"));
    assert_eq!(
        read_document_file(&written).unwrap(),
        r#"{"version":1,"elements":[]}"#
    );
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn writes_html_export_with_forced_extension() {
    let dir = std::env::temp_dir().join(format!("uc-html-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let written = write_html_export_file(&dir.join("deck"), "<!doctype html>").unwrap();
    assert!(written.ends_with("deck.html"));
    assert_eq!(
        std::fs::read_to_string(&written).unwrap(),
        "<!doctype html>"
    );
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn writes_pdf_export_bytes_with_forced_extension() {
    let dir = std::env::temp_dir().join(format!("uc-pdf-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bytes: Vec<u8> = b"%PDF-1.7\n\xe2\xe3\xcf\xd3".to_vec();
    let written = write_pdf_export_file(&dir.join("deck"), &bytes).unwrap();
    assert!(written.ends_with("deck.pdf"));
    assert_eq!(std::fs::read(&written).unwrap(), bytes);
    // A name the save dialog already gave the right extension keeps it, rather than doubling it.
    let kept = write_pdf_export_file(&dir.join("deck.pdf"), &bytes).unwrap();
    assert_eq!(kept, written);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn rejects_a_pdf_export_payload_that_is_not_base64() {
    assert!(matches!(
        decode_pdf_export("not base64!!"),
        Err(DocumentIoError::InvalidBase64(_))
    ));
    assert_eq!(decode_pdf_export("JVBERg==").unwrap(), b"%PDF");
}

#[test]
fn rejects_invalid_json_and_extension() {
    assert!(matches!(
        write_document_file(Path::new("/tmp/x.canvaslide"), "{not json"),
        Err(DocumentIoError::InvalidJson(_))
    ));
    assert!(matches!(
        read_document_file(Path::new("/tmp/x.txt")),
        Err(DocumentIoError::InvalidExtension(_))
    ));
}

/// A document saved under a plain `.json` name opens, so it has to save again where it was.
#[test]
fn a_silent_save_round_trips_a_bare_json_document() {
    let dir = std::env::temp_dir().join(format!("uc-bare-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("deck.json");
    std::fs::write(&path, r#"{"version":1,"elements":[]}"#).unwrap();

    assert_eq!(
        read_document_file(&path).unwrap(),
        r#"{"version":1,"elements":[]}"#
    );
    let written =
        write_document_file(&path, r#"{"version":1,"elements":[],"name":"Edited"}"#).unwrap();

    assert_eq!(written, path);
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        r#"{"version":1,"elements":[],"name":"Edited"}"#
    );
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_silent_save_refuses_a_path_that_is_not_a_document() {
    assert!(matches!(
        write_document_file(Path::new("/tmp/notes.txt"), "{}"),
        Err(DocumentIoError::InvalidExtension(_))
    ));
}

#[test]
fn opens_the_same_extensions_the_dialog_offers() {
    assert!(is_openable_document(Path::new("/tmp/deck.canvaslide")));
    assert!(is_openable_document(Path::new("/tmp/package.json")));
    assert!(!is_openable_document(Path::new("/tmp/notes.txt")));
}

#[test]
fn json_is_saved_as_readable_utf8_without_transport_encoding() {
    let dir = std::env::temp_dir().join(format!("canvaslide-json-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let contents = "{\n  \"version\": 1,\n  \"name\": \"한글 😀\",\n  \"resources\": {}\n}";
    for name in ["deck.canvaslide", "계획 😀.json"] {
        let path = dir.join(name);
        assert_eq!(write_document_file(&path, contents).unwrap(), path);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        assert_eq!(read_document_file(&path).unwrap(), contents);
    }
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn invalid_json_never_replaces_an_existing_document() {
    let dir = std::env::temp_dir().join(format!("canvaslide-bad-json-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("deck.canvaslide");
    std::fs::write(&path, "{}").unwrap();
    for contents in ["{bad json", "canvaslide-zip:UEsDBA==", "PK\u{3}\u{4}"] {
        assert!(write_document_file(&path, contents).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
    }
    std::fs::write(&path, b"PK\x03\x04").unwrap();
    assert!(matches!(
        read_document_file(&path),
        Err(DocumentIoError::InvalidJson(_))
    ));
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn bounds_streamed_input_before_parsing() {
    let json = br#"{"name":"document"}"#;
    assert_eq!(read_document_bytes(&json[..], json.len()).unwrap(), json);
    assert!(matches!(
        read_document_bytes(&json[..], json.len() - 1),
        Err(DocumentIoError::TooLarge)
    ));
}

/// The webview localizes and branches on the code, so each failure must keep its own.
#[test]
fn document_errors_reach_the_webview_as_codes() {
    let not_found = std::io::Error::from(std::io::ErrorKind::NotFound);
    for (error, code, detail) in [
        (
            GrantError::InvalidPath("x".into()).into(),
            "invalid_path",
            "x",
        ),
        (
            GrantError::NotGranted("/tmp/x".into()).into(),
            "not_granted",
            "/tmp/x",
        ),
        (
            DocumentIoError::InvalidExtension("/tmp/x.txt".into()),
            "not_a_document",
            "/tmp/x.txt",
        ),
        (
            DocumentIoError::InvalidJson("x".into()),
            "invalid_document",
            "x",
        ),
        (
            DocumentIoError::InvalidBase64("x".into()),
            "invalid_export",
            "x",
        ),
        (DocumentIoError::TooLarge, "too_large", ""),
        (
            DocumentIoError::Io(not_found),
            "not_found",
            "entity not found",
        ),
    ] {
        assert_eq!(CommandError::from(error), CommandError::new(code, detail));
    }
    let missing = read_document_file(Path::new("/nonexistent-canvaslide-dir/deck.canvaslide"));
    assert_eq!(CommandError::from(missing.unwrap_err()).code, "not_found");
}
