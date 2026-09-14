//! Installed font families, so the font picker can offer what the OS has (CoreText on macOS,
//! DirectWrite on Windows, fontconfig on Linux) instead of a fixed list.

use font_kit::source::SystemSource;

/// Family names sorted case-insensitively, deduplicated, hidden system faces (leading `.`) dropped.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let mut families = SystemSource::new().all_families().unwrap_or_default();
    families.retain(|name| !name.starts_with('.') && !name.trim().is_empty());
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup();
    families
}

#[cfg(test)]
mod tests {
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
}
