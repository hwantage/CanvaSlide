use super::*;

#[test]
fn cancelled_dialog_has_no_path() {
    let granted = GrantedFiles::default();
    assert_eq!(native_selection(None).unwrap(), None);
    assert_eq!(grant_selection(&granted, None), None);
}

#[test]
fn a_picked_path_is_granted_as_handed_out() {
    let granted = GrantedFiles::default();
    let picked = PathBuf::from("/tmp/deck.canvaslide");
    let handed = grant_selection(&granted, Some(picked.clone())).unwrap();
    assert_eq!(granted.require(handed), Ok(picked));
}

#[test]
fn save_as_grants_the_name_it_will_write() {
    let granted = GrantedFiles::default();
    let handed = grant_save_selection(&granted, Some("/tmp/deck".into())).unwrap();
    assert_eq!(
        granted.require(handed),
        Ok(PathBuf::from("/tmp/deck.canvaslide"))
    );
    assert!(!granted.is_granted(std::path::Path::new("/tmp/deck")));
}

#[cfg(unix)]
#[test]
fn dialog_selection_preserves_native_bytes() {
    use std::os::unix::ffi::OsStringExt;
    let path = std::path::PathBuf::from(std::ffi::OsString::from_vec(
        b"/tmp/deck\xff.canvaslide".to_vec(),
    ));
    let granted = GrantedFiles::default();
    let selected = native_selection(Some(DialogPath::Path(path.clone()))).unwrap();
    let handed = grant_selection(&granted, selected).unwrap();
    let received: FilePath =
        serde_json::from_str(&serde_json::to_string(&handed).unwrap()).unwrap();
    assert_eq!(granted.require(received), Ok(path));
}
