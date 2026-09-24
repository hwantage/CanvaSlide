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
#[path = "system_fonts_tests.rs"]
mod tests;
