use super::*;

fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

/// Every case here passes a cwd that must not show up in the answer.
const ELSEWHERE: &str = "/somewhere/else";

fn from_args(values: &[&str]) -> Option<PathBuf> {
    document_path_from_args(Path::new(ELSEWHERE), args(values))
}

#[test]
fn finds_the_document_after_the_program_path() {
    assert_eq!(
        from_args(&["/Applications/CanvaSlide.app", "/tmp/deck.canvaslide"]),
        Some(PathBuf::from("/tmp/deck.canvaslide"))
    );
}

/// A Windows path only reads as absolute on Windows, so the passthrough is asserted there.
#[cfg(windows)]
#[test]
fn keeps_a_windows_path_as_it_was_given() {
    assert_eq!(
        from_args(&["canvaslide.exe", r"C:\decks\plan.CANVASLIDE"]),
        Some(PathBuf::from(r"C:\decks\plan.CANVASLIDE"))
    );
}

/// The argv of a second launch was typed somewhere else; opening the running instance's
/// same-named file instead would be the wrong document, silently.
#[test]
fn resolves_a_relative_path_against_the_caller_directory() {
    assert_eq!(
        from_args(&["canvaslide", "decks/deck.canvaslide"]),
        Some(PathBuf::from("/somewhere/else/decks/deck.canvaslide"))
    );
}

#[test]
fn opens_a_document_saved_under_the_legacy_name() {
    assert_eq!(
        from_args(&["canvaslide", "/tmp/old.canvas.json"]),
        Some(PathBuf::from("/tmp/old.canvas.json"))
    );
}

/// The Open dialog reaches a document saved under a plain `.json`; so does a launch.
#[test]
fn opens_a_document_saved_under_a_bare_json_name() {
    assert_eq!(
        from_args(&["canvaslide", "/tmp/deck.json"]),
        Some(PathBuf::from("/tmp/deck.json"))
    );
}

#[test]
fn ignores_flags_and_anything_that_is_not_a_document() {
    assert_eq!(from_args(&["canvaslide"]), None);
    assert_eq!(from_args(&["canvaslide", "--devtools", "notes.txt"]), None);
    assert_eq!(
        from_args(&["canvaslide", "--flag", "/tmp/deck.canvaslide"]),
        Some(PathBuf::from("/tmp/deck.canvaslide"))
    );
}

/// A single-window app opens one document; the choice of *which* one has to be the first, not
/// whichever happened to be offered last.
#[cfg(any(target_os = "macos", target_os = "ios"))]
#[test]
fn takes_the_first_file_url_and_skips_the_rest() {
    let urls: Vec<tauri::Url> = [
        "https://example.com/a.canvaslide",
        // Why: "Open With" can hand over anything; skipping it must not cost the real document
        // that follows.
        "file:///tmp/notes.txt",
        "file:///tmp/first.canvaslide",
        "file:///tmp/second.canvaslide",
    ]
    .iter()
    .map(|u| u.parse().unwrap())
    .collect();
    assert_eq!(
        document_path_from_urls(&urls),
        Some(PathBuf::from("/tmp/first.canvaslide"))
    );
    assert_eq!(document_path_from_urls(&[]), None);
}

#[test]
fn hands_the_path_over_exactly_once() {
    let pending = PendingDocument::default();
    pending.set(PathBuf::from("/tmp/deck.canvaslide"));
    assert_eq!(pending.take(), Some(PathBuf::from("/tmp/deck.canvaslide")));
    assert_eq!(pending.take(), None);
}

#[test]
fn the_newest_document_wins_over_one_nobody_took() {
    let pending = PendingDocument::default();
    pending.set(PathBuf::from("/tmp/first.canvaslide"));
    pending.set(PathBuf::from("/tmp/second.canvaslide"));
    assert_eq!(
        pending.take(),
        Some(PathBuf::from("/tmp/second.canvaslide"))
    );
}

#[test]
fn a_received_document_can_be_read_back_through_its_handle() {
    let pending = PendingDocument::default();
    let granted = GrantedFiles::default();
    receive(&pending, &granted, PathBuf::from("/tmp/deck.canvaslide"));
    let handed = pending.take_transport().unwrap();
    assert_eq!(
        granted.require(handed),
        Ok(PathBuf::from("/tmp/deck.canvaslide"))
    );
}

#[test]
fn a_document_the_os_offers_is_granted() {
    use tauri::test::{mock_builder, mock_context, noop_assets};
    let app = mock_builder()
        .manage(PendingDocument::default())
        .manage(GrantedFiles::default())
        .build(mock_context(noop_assets()))
        .unwrap();
    let path = PathBuf::from("/tmp/deck.canvaslide");
    offer(app.handle(), path.clone());
    let handed = app.state::<PendingDocument>().take_transport().unwrap();
    assert_eq!(app.state::<GrantedFiles>().require(handed), Ok(path));
}

#[cfg(unix)]
#[test]
fn launch_args_survive_the_json_bridge() {
    use std::os::unix::ffi::OsStringExt;
    let name = OsString::from_vec(b"deck\xff.canvaslide".to_vec());
    let path = document_path_from_args(Path::new(ELSEWHERE), ["canvaslide".into(), name]).unwrap();
    let pending = PendingDocument::default();
    pending.set(path.clone());
    let json = serde_json::to_string(&pending.take_transport().unwrap()).unwrap();
    let received: FilePath = serde_json::from_str(&json).unwrap();
    assert_eq!(received.into_path().unwrap(), path);
    assert_eq!(pending.take_transport(), None);
}
