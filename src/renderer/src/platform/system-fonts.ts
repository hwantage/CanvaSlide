import { isTauriRuntime } from './tauri-runtime'

type LocalFontData = { family: string }

/**
 * Installed font families. Desktop: the Rust side asks the OS (CoreText / DirectWrite /
 * fontconfig). Browser: the Local Font Access API where it exists and is permitted; otherwise
 * an empty list, and the picker offers presets only.
 */
export async function listSystemFonts(): Promise<string[]> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string[]>('list_system_fonts')
  }
  const query = (window as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts
  if (!query) {
    return []
  }
  try {
    const families = new Set((await query.call(window)).map((font) => font.family))
    return [...families].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
