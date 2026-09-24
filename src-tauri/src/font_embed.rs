//! Subsets installed fonts to the characters a document uses so the HTML export can embed them
//! as `@font-face` and look the same on machines without the font.

use std::collections::BTreeSet;
use std::fs;

use allsorts::binary::read::ReadScope;
use allsorts::font::{Font, MatchingPresentation};
use allsorts::font_data::FontData;
use allsorts::subset::{subset, CmapTarget, SubsetProfile};
use allsorts::tables::FontTableProvider;
use allsorts::tag;
use base64::Engine;
use font_kit::family_name::FamilyName;
use font_kit::handle::Handle;
use font_kit::properties::{Properties, Weight};
use font_kit::source::SystemSource;
use serde::{Deserialize, Serialize};

use crate::command_error::{off_main_thread, CommandError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontRequest {
    pub family: String,
    pub bold: bool,
    /// Every character that must render in this face (duplicates are fine).
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedFont {
    pub family: String,
    /// The weight of the face that was actually found (a bold request may land on 400).
    pub weight: u16,
    /// CSS `format()` hint: `truetype` or `opentype` (CFF outlines).
    pub format: String,
    pub bytes: usize,
    pub data_base64: String,
}

fn font_bytes(handle: &Handle) -> Option<(Vec<u8>, u32)> {
    match handle {
        Handle::Path { path, font_index } => Some((fs::read(path).ok()?, *font_index)),
        Handle::Memory { bytes, font_index } => Some((bytes.to_vec(), *font_index)),
    }
}

/// Keeps `.notdef` plus the glyphs for `text`; output is a valid OpenType font with a Unicode cmap.
pub fn subset_font(data: &[u8], index: u32, text: &str) -> Result<(Vec<u8>, bool), String> {
    let scope = ReadScope::new(data);
    let font_data = scope
        .read::<FontData<'_>>()
        .map_err(|error| format!("parse: {error}"))?;
    let provider = font_data
        .table_provider(index as usize)
        .map_err(|error| format!("table provider: {error}"))?;
    let is_cff = provider.has_table(tag::CFF);
    let mut font = Font::new(provider).map_err(|error| format!("font: {error}"))?;
    let mut glyphs: BTreeSet<u16> = BTreeSet::from([0]);
    for ch in text.chars() {
        let (glyph, _) = font.lookup_glyph_index(ch, MatchingPresentation::NotRequired, None);
        if glyph != 0 {
            glyphs.insert(glyph);
        }
    }
    let ids: Vec<u16> = glyphs.into_iter().collect();
    let bytes = subset(
        &font.font_table_provider,
        &ids,
        &SubsetProfile::Minimal,
        CmapTarget::Unicode,
    )
    .map_err(|error| format!("subset: {error}"))?;
    Ok((bytes, is_cff))
}

fn embed_one(source: &SystemSource, request: &FontRequest) -> Option<EmbeddedFont> {
    let properties = Properties {
        weight: if request.bold {
            Weight::BOLD
        } else {
            Weight::NORMAL
        },
        ..Properties::default()
    };
    let handle = source
        .select_best_match(&[FamilyName::Title(request.family.clone())], &properties)
        .ok()?;
    let loaded = handle.load().ok()?;
    // Why: font-kit may fall back to another family; never embed a font the user did not pick.
    if loaded.family_name() != request.family {
        return None;
    }
    let (data, index) = font_bytes(&handle)?;
    let (bytes, is_cff) = subset_font(&data, index, &request.text).ok()?;
    Some(EmbeddedFont {
        family: request.family.clone(),
        weight: loaded.properties().weight.0.round() as u16,
        format: if is_cff { "opentype" } else { "truetype" }.to_string(),
        bytes: bytes.len(),
        data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

/// Fonts that cannot be found, read or subset are skipped; the export then falls back for them.
fn subset_installed_fonts(requests: &[FontRequest]) -> Vec<EmbeddedFont> {
    let source = SystemSource::new();
    requests
        .iter()
        .filter_map(|request| embed_one(&source, request))
        .collect()
}

/// Runs on the blocking pool: subsetting reads and parses whole font files.
#[tauri::command]
pub async fn subset_fonts(requests: Vec<FontRequest>) -> Result<Vec<EmbeddedFont>, CommandError> {
    off_main_thread(move || Ok(subset_installed_fonts(&requests))).await
}

#[cfg(test)]
#[path = "font_embed_tests.rs"]
mod tests;
