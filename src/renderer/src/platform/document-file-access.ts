import {
  decodeDocumentFile,
  encodeDocumentFile,
  decodeNativeDocumentFile,
  encodeNativeDocumentFile
} from '@/lib/document-file-codec'
import {
  DOCUMENT_FILE_EXTENSION,
  documentFileName,
  withDocumentName
} from '@shared/canvas/document-file'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { downloadFile } from './browser-download'
import { displayFilePath, type FilePath } from './file-path'
import { isTauriRuntime } from './tauri-runtime'

export type OpenedDocument = { document: CanvasDocument; filePath: FilePath | null }
export type SavedDocument = { filePath: FilePath | null }

/** Tauri: native dialogs + Rust IO. Browser (dev:web): file input + download fallback. */
export async function openDocumentFile(): Promise<OpenedDocument | null> {
  if (isTauriRuntime()) {
    return openWithTauri()
  }
  return openWithBrowser()
}

export async function saveDocumentFile(
  document: CanvasDocument,
  filePath: FilePath | null,
  forcePrompt = false
): Promise<SavedDocument | null> {
  if (isTauriRuntime()) {
    return saveWithTauri(document, forcePrompt ? null : filePath)
  }
  const contents = await encodeDocumentFile(document)
  downloadFile(contents, documentFileName(document), 'application/json')
  return { filePath: null }
}

export async function confirmDiscardChanges(): Promise<boolean> {
  const question = t('file.discardQuestion')
  if (isTauriRuntime()) {
    const { ask } = await import('@tauri-apps/plugin-dialog')
    return ask(question, { title: t('file.discardTitle'), kind: 'warning' })
  }
  return window.confirm(question)
}

/** The message a thrown value carries; non-Error throws are shown as they are. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Shows whatever was thrown; for the tail of a user-started action that cannot recover. */
export function reportError(error: unknown): Promise<void> {
  return showErrorMessage(errorText(error))
}

export async function showErrorMessage(message: string): Promise<void> {
  if (isTauriRuntime()) {
    const { message: show } = await import('@tauri-apps/plugin-dialog')
    await show(message, { title: 'CanvaSlide', kind: 'error' })
    return
  }
  window.alert(message)
}

/** Opens a path the app was given rather than one the user picked; Tauri only. */
export async function openDocumentAtPath(path: FilePath): Promise<OpenedDocument> {
  const { invoke } = await import('@tauri-apps/api/core')
  const contents = await invoke<string>('read_document', { path })
  const parsed = await decodeNativeDocumentFile(contents)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return { document: withDocumentName(parsed.document, displayFilePath(path)), filePath: path }
}

async function openWithTauri(): Promise<OpenedDocument | null> {
  const { invoke } = await import('@tauri-apps/api/core')
  const selected = await invoke<FilePath | null>('pick_document_path')
  if (selected === null) {
    return null
  }
  return openDocumentAtPath(selected)
}

async function saveWithTauri(
  document: CanvasDocument,
  filePath: FilePath | null
): Promise<SavedDocument | null> {
  const { invoke } = await import('@tauri-apps/api/core')
  const chosen =
    filePath ??
    (await invoke<FilePath | null>('pick_document_save_path', {
      defaultName: documentFileName(document)
    }))
  if (!chosen) {
    return null
  }
  const written = await invoke<FilePath>('write_document', {
    path: chosen,
    contents: await encodeNativeDocumentFile(document)
  })
  return { filePath: written }
}

function openWithBrowser(): Promise<OpenedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `.${DOCUMENT_FILE_EXTENSION},.json`
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        const parsed = await decodeDocumentFile(new Uint8Array(await file.arrayBuffer()))
        if (!parsed.ok) {
          reject(new Error(parsed.error))
          return
        }
        resolve({ document: withDocumentName(parsed.document, file.name), filePath: null })
      } catch (error) {
        reject(error)
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
