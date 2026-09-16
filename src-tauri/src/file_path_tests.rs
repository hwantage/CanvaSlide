use super::*;

fn round_trip(path: &Path) -> FilePath {
    let transport = FilePath::from_path(path);
    let json = serde_json::to_string(&transport).unwrap();
    let decoded: FilePath = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.clone().into_path().unwrap(), path);
    decoded
}

#[test]
fn unicode_and_tag_like_strings_remain_literal() {
    for name in [
        "/tmp/계획 😀.canvaslide",
        "unix-bytes:255.canvaslide",
        r#"{"encoding":"unix-bytes","bytes":[255]}.canvaslide"#,
        r"\\server\share\계획.canvaslide",
        r"\\?\C:\decks\계획.canvaslide",
    ] {
        let transport = round_trip(Path::new(name));
        assert_eq!(transport, FilePath::Unicode(name.to_owned()));
        assert_eq!(serde_json::to_value(transport).unwrap(), name);
    }
}

#[cfg(unix)]
#[test]
fn native_bytes_round_trip_and_display_is_not_an_io_path() {
    use std::os::unix::ffi::OsStringExt;
    let path = PathBuf::from(std::ffi::OsString::from_vec(
        b"/tmp/dir\xfe/deck\xff.canvaslide".to_vec(),
    ));
    let mut transport = round_trip(&path);
    let FilePath::Encoded(EncodedPath::UnixBytes { display, .. }) = &mut transport else {
        panic!("non-Unicode path must be encoded");
    };
    assert!(display.contains('\u{fffd}'));
    *display = "/tmp/another-file.canvaslide".to_owned();
    assert_eq!(transport.into_path().unwrap(), path);
}

#[cfg(windows)]
#[test]
fn unpaired_surrogates_round_trip() {
    use std::os::windows::ffi::OsStringExt;
    let mut units: Vec<u16> = r"C:\decks\deck".encode_utf16().collect();
    units.push(0xd800);
    units.extend(".canvaslide".encode_utf16());
    let path = PathBuf::from(std::ffi::OsString::from_wide(&units));
    assert!(matches!(
        round_trip(&path),
        FilePath::Encoded(EncodedPath::WindowsWide { .. })
    ));
}

#[test]
fn rejects_malformed_transport_instead_of_guessing_a_path() {
    for json in [
        r#"{"encoding":"unknown","bytes":[255],"display":"deck.canvaslide"}"#,
        r#"{"encoding":"unix-bytes","bytes":[256],"display":"deck.canvaslide"}"#,
        r#"{"encoding":"unix-bytes","bytes":[-1],"display":"deck.canvaslide"}"#,
        r#"{"encoding":"unix-bytes","display":"deck.canvaslide"}"#,
        r#"{"encoding":"windows-wide","units":[65536],"display":"deck.canvaslide"}"#,
    ] {
        assert!(serde_json::from_str::<FilePath>(json).is_err(), "{json}");
    }
}

#[test]
fn rejects_another_platform_encoding() {
    #[cfg(unix)]
    let path = EncodedPath::WindowsWide {
        units: vec![0xd800],
        display: "deck.canvaslide".to_owned(),
    };
    #[cfg(windows)]
    let path = EncodedPath::UnixBytes {
        bytes: vec![255],
        display: "deck.canvaslide".to_owned(),
    };
    assert!(FilePath::Encoded(path).into_path().is_err());
}
