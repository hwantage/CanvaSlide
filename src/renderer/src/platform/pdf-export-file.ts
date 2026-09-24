import { bytesToBase64 } from '@shared/canvas/binary-data'
import { downloadFile } from './browser-download'
import type { FilePath } from './file-path'
import { invokeCommand } from './native-command'
import { isTauriRuntime } from './tauri-runtime'

/** Saves the exported deck; returns the path (Tauri) or null when cancelled or downloaded. */
export async function savePdfExport(
  pdf: Uint8Array<ArrayBuffer>,
  suggestedName: string
): Promise<FilePath | null> {
  if (!isTauriRuntime()) {
    downloadFile(pdf, suggestedName, 'application/pdf')
    return null
  }
  // Why base64: command arguments cross the IPC bridge as JSON, which has no byte-array form.
  return invokeCommand<FilePath | null>('save_pdf_export', {
    defaultName: suggestedName,
    contentsBase64: bytesToBase64(pdf)
  })
}
