import { downloadFile } from './browser-download'
import { isTauriRuntime } from './tauri-runtime'

const HTML_FILTER = { name: 'HTML presentation', extensions: ['html'] }

/** Saves the standalone page; returns the path (Tauri) or null when cancelled. */
export async function saveHtmlExport(html: string, suggestedName: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    downloadFile(html, suggestedName, 'text/html')
    return null
  }
  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core')
  ])
  const target = await save({ defaultPath: suggestedName, filters: [HTML_FILTER] })
  if (!target) {
    return null
  }
  return invoke<string>('write_html_export', { path: target, contents: html })
}
