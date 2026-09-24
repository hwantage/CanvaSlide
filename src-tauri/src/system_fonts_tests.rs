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
