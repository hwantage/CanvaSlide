use super::*;

fn through_bridge(path: &Path) -> FilePath {
    serde_json::from_str(&serde_json::to_string(&FilePath::from_path(path)).unwrap()).unwrap()
}

#[test]
fn normalization_preserves_existing_hidden_and_mixed_case_name_behavior() {
    for (name, expected) in [
        (".json", ".canvaslide"),
        (".JSON", ".canvaslide"),
        (".canvas.json", ".canvaslide"),
        (".CANVAS.JSON", ".canvaslide"),
        (".canvas.canvas.json", ".canvas.canvaslide"),
        ("deck.CANVAS.JSON", "deck.canvaslide"),
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
    let selected = dir.join("계획 😀.canvas.json");
    std::fs::write(&selected, r#"{"original":true}"#).unwrap();
    assert_eq!(
        read_document(through_bridge(&selected)).unwrap(),
        r#"{"original":true}"#
    );
    let saved = write_document(
        through_bridge(&selected),
        r#"{"edited":true}"#.into(),
        false,
    )
    .unwrap();
    assert_eq!(saved.into_path().unwrap(), selected);
    let saved_as = write_document(through_bridge(&selected), "{}".into(), true).unwrap();
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

#[cfg(unix)]
#[test]
fn normalization_keeps_non_utf8_names_and_directories() {
    use std::os::unix::ffi::OsStringExt;
    let expected = PathBuf::from(std::ffi::OsString::from_vec(
        b"/tmp/dir\xfe/deck\xff.canvaslide".to_vec(),
    ));
    for suffix in ["", ".json", ".canvas.json", ".CANVAS.JSON", ".canvaslide"] {
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
    for suffix in [".canvaslide", ".canvas.json", ".json"] {
        let mut name = b"deck\xff".to_vec();
        name.extend(suffix.as_bytes());
        let selected = dir.join(std::ffi::OsString::from_vec(name));
        let lossy = PathBuf::from(selected.to_string_lossy().into_owned());
        std::fs::create_dir_all(lossy.parent().unwrap()).unwrap();
        std::fs::write(&selected, r#"{"original":true}"#).unwrap();
        std::fs::write(&lossy, r#"{"different":true}"#).unwrap();

        assert_eq!(
            read_document(through_bridge(&selected)).unwrap(),
            r#"{"original":true}"#
        );
        let saved = write_document(
            through_bridge(&selected),
            r#"{"edited":true}"#.into(),
            false,
        )
        .unwrap();
        assert_eq!(saved.clone().into_path().unwrap(), selected);
        assert_eq!(read_document(saved).unwrap(), r#"{"edited":true}"#);
        assert_eq!(
            std::fs::read_to_string(lossy).unwrap(),
            r#"{"different":true}"#
        );
    }

    for suffix in ["", ".json", ".canvas.json"] {
        let mut name = b"save-as\xff".to_vec();
        name.extend(suffix.as_bytes());
        let selected = dir.join(std::ffi::OsString::from_vec(name));
        let expected = dir.join(std::ffi::OsString::from_vec(
            b"save-as\xff.canvaslide".to_vec(),
        ));
        let lossy = PathBuf::from(expected.to_string_lossy().into_owned());
        std::fs::write(&lossy, "unchanged").unwrap();
        let saved = write_document(through_bridge(&selected), "{}".into(), true).unwrap();
        assert_eq!(saved.clone().into_path().unwrap(), expected);
        let saved: FilePath =
            serde_json::from_str(&serde_json::to_string(&saved).unwrap()).unwrap();
        write_document(saved.clone(), r#"{"savedAgain":true}"#.into(), false).unwrap();
        assert_eq!(read_document(saved).unwrap(), r#"{"savedAgain":true}"#);
        assert_eq!(std::fs::read_to_string(lossy).unwrap(), "unchanged");
    }
    std::fs::remove_dir_all(root).unwrap();
}
