import { bytesToBase64 } from '@shared/canvas/binary-data'
import { downloadFile } from './browser-download'
import { isTauriRuntime } from './tauri-runtime'

const PDF_FILTER = { name: 'PDF document', extensions: ['pdf'] }

/** Saves the exported deck; returns the path (Tauri) or null when cancelled or downloaded. */
export async function savePdfExport(
  pdf: Uint8Array<ArrayBuffer>,
  suggestedName: string
): Promise<string | null> {
  if (!isTauriRuntime()) {
    downloadFile(pdf, suggestedName, 'application/pdf')
    return null
  }
  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core')
  ])
  const target = await save({ defaultPath: suggestedName, filters: [PDF_FILTER] })
  if (!target) {
    return null
  }
  // Why base64: command arguments cross the IPC bridge as JSON, which has no byte-array form.
  return invoke<string>('write_pdf_export', { path: target, contentsBase64: bytesToBase64(pdf) })
}
