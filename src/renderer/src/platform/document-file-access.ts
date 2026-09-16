import {
  DOCUMENT_FILE_EXTENSION,
  documentFileName,
  parseDocument,
  serializeDocument,
  withDocumentName
} from '@shared/canvas/document-file'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
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
  const contents = serializeDocument(document)
  if (isTauriRuntime()) {
    return saveWithTauri(document, contents, forcePrompt ? null : filePath)
  }
  downloadInBrowser(contents, documentFileName(document))
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
  const parsed = parseDocument(contents)
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
  contents: string,
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
    contents,
    // Why: only a name the user just picked may gain the canonical extension. Rewriting the target
    // of a silent save would strand the original file with stale content and clobber whatever
    // already sits at the new name, without the overwrite prompt the dialog would have shown.
    normalizeExtension: filePath === null
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
      const parsed = parseDocument(await file.text())
      if (!parsed.ok) {
        reject(new Error(parsed.error))
        return
      }
      resolve({ document: withDocumentName(parsed.document, file.name), filePath: null })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function downloadInBrowser(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
