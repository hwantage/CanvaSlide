import {
  DOCUMENT_FILE_FILTER,
  documentFileName,
  documentNameFromPath,
  parseDocument,
  serializeDocument
} from '@shared/canvas/document-file'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { isTauriRuntime } from './tauri-runtime'

export type OpenedDocument = { document: CanvasDocument; filePath: string | null }
export type SavedDocument = { filePath: string | null }

/** Tauri: native dialogs + Rust IO. Browser (dev:web): file input + download fallback. */
export async function openDocumentFile(): Promise<OpenedDocument | null> {
  if (isTauriRuntime()) {
    return openWithTauri()
  }
  return openWithBrowser()
}

export async function saveDocumentFile(
  document: CanvasDocument,
  filePath: string | null,
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

async function openWithTauri(): Promise<OpenedDocument | null> {
  const [{ open }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core')
  ])
  const selected = await open({ multiple: false, filters: [DOCUMENT_FILE_FILTER] })
  if (typeof selected !== 'string') {
    return null
  }
  const contents = await invoke<string>('read_document', { path: selected })
  const parsed = parseDocument(contents)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return {
    document: { ...parsed.document, name: documentNameFromPath(selected) },
    filePath: selected
  }
}

async function saveWithTauri(
  document: CanvasDocument,
  contents: string,
  filePath: string | null
): Promise<SavedDocument | null> {
  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core')
  ])
  const target =
    filePath ??
    (await save({ defaultPath: documentFileName(document), filters: [DOCUMENT_FILE_FILTER] }))
  if (!target) {
    return null
  }
  const written = await invoke<string>('write_document', { path: target, contents })
  return { filePath: written }
}

function openWithBrowser(): Promise<OpenedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
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
      resolve({
        document: { ...parsed.document, name: documentNameFromPath(file.name) },
        filePath: null
      })
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
