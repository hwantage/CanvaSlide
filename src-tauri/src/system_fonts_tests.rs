use super::list_system_fonts;

#[test]
fn lists_sorted_unique_families() {
    let fonts = list_system_fonts();
    assert!(!fonts.is_empty(), "a desktop OS ships fonts");
    let lower: Vec<String> = fonts.iter().map(|f| f.to_lowercase()).collect();
    let mut sorted = lower.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(lower, sorted);
    assert!(fonts.iter().all(|f| !f.starts_with('.')));
}
