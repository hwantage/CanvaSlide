use super::*;

// Synthetic empty document; this fixture contains no user data.
const ARCHIVE: &str = "UEsDBBQAAAAIAGUkM11/R6fWXQAAAHYAAAANAAAAZG9jdW1lbnQuanNvbkWNMQqAMBAEvxKutgik8w9WlmIRdNGAuUDuEETyd08bu5mdYm86USUVpt6FzhHHDEMaL9YdmhanECUrOJDBKlbvZl7qimoyzSZRBH8y1sTb56Q1siS1i+EdgvetPVBLAQIUAxQAAAAIAGUkM11/R6fWXQAAAHYAAAANAAAAAAAAAAAAAACAAQAAAABkb2N1bWVudC5qc29uUEsFBgAAAAABAAEAOwAAAIgAAAAAAA==";

#[test]
fn archive_bytes_round_trip_through_native_io_and_legacy_paths() {
    let dir = std::env::temp_dir().join(format!("canvaslide-archive-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let contents = format!("{ARCHIVE_TRANSPORT_PREFIX}{ARCHIVE}");
    let original = STANDARD.decode(ARCHIVE).unwrap();
    for name in ["deck.canvaslide", "계획 😀.canvas.json", "deck.json"] {
        let path = dir.join(name);
        let written = write_document_file(&path, &contents, false).unwrap();
        assert_eq!(written, path);
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(read_document_file(&path).unwrap(), contents);
    }
    let saved_as = write_document_file(&dir.join("copy.json"), &contents, true).unwrap();
    assert_eq!(saved_as, dir.join("copy.canvaslide"));
    assert_eq!(std::fs::read(saved_as).unwrap(), original);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn invalid_archive_transport_never_replaces_an_existing_document() {
    let dir = std::env::temp_dir().join(format!("canvaslide-bad-archive-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("deck.canvaslide");
    std::fs::write(&path, "{}").unwrap();
    for contents in ["canvaslide-zip:!", "canvaslide-zip:UEsDBA=="] {
        assert!(write_document_file(&path, contents, false).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
    }
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn legacy_migration_has_a_larger_bounded_input_budget_than_archives() {
    let legacy = br#"{"name":"legacy document"}"#;
    assert_eq!(read_document_bytes(&legacy[..], 16, 32).unwrap(), legacy);
    assert!(matches!(
        read_document_bytes(&legacy[..], 16, 20),
        Err(DocumentIoError::TooLarge)
    ));
    let archive = STANDARD.decode(ARCHIVE).unwrap();
    assert!(matches!(
        read_document_bytes(&archive[..], 16, archive.len()),
        Err(DocumentIoError::TooLarge)
    ));
}
