use super::*;

#[test]
fn only_a_granted_path_is_returned() {
    let files = GrantedFiles::default();
    let picked = PathBuf::from("/tmp/deck.canvaslide");
    let other = FilePath::from_path(Path::new("/tmp/other.canvaslide"));
    assert_eq!(
        files.require(other.clone()),
        Err(GrantError::NotGranted("/tmp/other.canvaslide".into()))
    );
    files.grant(&picked);
    assert_eq!(files.require(FilePath::from_path(&picked)), Ok(picked));
    assert!(files.require(other).is_err());
}

/// Clones share one set: the dialog, launch and recovery code each hold their own handle.
#[test]
fn a_grant_is_seen_through_every_clone() {
    let files = GrantedFiles::default();
    files.clone().grant(Path::new("/tmp/deck.canvaslide"));
    assert!(files.is_granted(Path::new("/tmp/deck.canvaslide")));
}

/// A name that merely looks like the granted one is a different file.
#[test]
fn a_similar_name_is_not_the_granted_file() {
    let files = GrantedFiles::default();
    files.grant(Path::new("/tmp/deck.canvaslide"));
    for near in [
        "/tmp/deck.canvaslide.json",
        "/tmp/Deck.canvaslide",
        "/tmp/../tmp/deck.canvaslide",
        "tmp/deck.canvaslide",
    ] {
        assert!(
            files.require(FilePath::Unicode(near.into())).is_err(),
            "{near}"
        );
    }
}

#[cfg(unix)]
#[test]
fn non_utf8_names_are_matched_by_their_bytes() {
    use std::os::unix::ffi::OsStringExt;
    let files = GrantedFiles::default();
    let exact = PathBuf::from(std::ffi::OsString::from_vec(b"/tmp/deck\xff.json".to_vec()));
    files.grant(&exact);
    let lossy = FilePath::Unicode(exact.to_string_lossy().into_owned());
    assert!(files.require(lossy).is_err());
    let transported: FilePath =
        serde_json::from_str(&serde_json::to_string(&FilePath::from_path(&exact)).unwrap())
            .unwrap();
    assert_eq!(files.require(transported), Ok(exact));
}

#[test]
fn a_handle_for_another_platform_is_rejected() {
    let files = GrantedFiles::default();
    let foreign = if cfg!(windows) {
        serde_json::json!({"encoding":"unix-bytes","bytes":[47],"display":"/"})
    } else {
        serde_json::json!({"encoding":"windows-wide","units":[67],"display":"C"})
    };
    let foreign: FilePath = serde_json::from_value(foreign).unwrap();
    assert!(matches!(
        files.require(foreign),
        Err(GrantError::InvalidPath(_))
    ));
}
