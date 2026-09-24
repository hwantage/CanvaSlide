import type { EmbeddedFont, FontRequest } from '@shared/canvas/font-embedding'
import { invokeCommand } from './native-command'
import { isTauriRuntime } from './tauri-runtime'

/** Subsets installed fonts through the Rust side; the browser build has no font files to read. */
export function canEmbedFonts(): boolean {
  return isTauriRuntime()
}

export async function subsetFonts(requests: readonly FontRequest[]): Promise<EmbeddedFont[]> {
  if (!isTauriRuntime() || requests.length === 0) {
    return []
  }
  return invokeCommand<EmbeddedFont[]>('subset_fonts', { requests })
}
