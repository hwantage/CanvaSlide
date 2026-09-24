use super::*;

#[test]
fn subsets_an_installed_font_to_a_smaller_valid_opentype_file() {
    let source = SystemSource::new();
    let families = source.all_families().unwrap_or_default();
    let request = families
        .iter()
        .filter(|f| !f.starts_with('.'))
        .map(|family| FontRequest {
            family: family.clone(),
            bold: false,
            text: "Hello 12".to_string(),
        })
        .find_map(|request| embed_one(&source, &request).map(|font| (request, font)));
    let (request, font) = request.expect("some installed font can be subset");
    assert_eq!(font.family, request.family);
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&font.data_base64)
        .unwrap();
    assert_eq!(decoded.len(), font.bytes);
    let parsed = ReadScope::new(&decoded).read::<FontData<'_>>().unwrap();
    let provider = parsed.table_provider(0).unwrap();
    assert!(provider.has_table(tag::CMAP));
    let handle = source
        .select_best_match(
            &[FamilyName::Title(request.family.clone())],
            &Properties::default(),
        )
        .unwrap();
    let (original, _) = font_bytes(&handle).unwrap();
    assert!(font.bytes < original.len());
}

#[test]
fn unknown_family_is_skipped() {
    let fonts = subset_installed_fonts(&[FontRequest {
        family: "No Such Font Family 12345".into(),
        bold: false,
        text: "x".into(),
    }]);
    assert!(fonts.is_empty());
}
