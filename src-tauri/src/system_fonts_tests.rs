use super::installed_families;

#[test]
fn lists_sorted_unique_families() {
    let fonts = installed_families();
    assert!(!fonts.is_empty(), "a desktop OS ships fonts");
    let lower: Vec<String> = fonts.iter().map(|f| f.to_lowercase()).collect();
    let mut sorted = lower.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(lower, sorted);
    assert!(fonts.iter().all(|f| !f.starts_with('.')));
}

/// The command answers through the shared blocking helper, so a failed task is a coded error.
#[test]
fn the_command_lists_the_same_families() {
    let listed = tauri::async_runtime::block_on(super::list_system_fonts()).unwrap();
    assert_eq!(listed, installed_families());
}
