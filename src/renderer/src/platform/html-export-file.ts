import { downloadFile } from './browser-download'
import type { FilePath } from './file-path'
import { isTauriRuntime } from './tauri-runtime'

/** Saves the standalone page; returns the path (Tauri) or null when cancelled or downloaded. */
export async function saveHtmlExport(
  html: string,
  suggestedName: string
): Promise<FilePath | null> {
  if (!isTauriRuntime()) {
    downloadFile(html, suggestedName, 'text/html')
    return null
  }
  const { invoke } = await import('@tauri-apps/api/core')
  // Why one command: the shell picks and writes the file, so the webview never names it.
  return invoke<FilePath | null>('save_html_export', { defaultName: suggestedName, contents: html })
}
