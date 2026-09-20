use super::*;

#[test]
fn json_is_saved_as_readable_utf8_without_transport_encoding() {
    let dir = std::env::temp_dir().join(format!("canvaslide-json-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let contents = "{\n  \"version\": 1,\n  \"name\": \"한글 😀\",\n  \"resources\": {}\n}";
    for name in ["deck.canvaslide", "계획 😀.json"] {
        let path = dir.join(name);
        assert_eq!(write_document_file(&path, contents, false).unwrap(), path);
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
        assert!(write_document_file(&path, contents, false).is_err());
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
