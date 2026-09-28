import {
  decodeDocumentFile,
  encodeDocumentFile,
  decodeNativeDocumentFile,
  encodeNativeDocumentFile
} from '@/lib/workers/document-file-codec'
import {
  DOCUMENT_FILE_EXTENSION,
  documentFileName,
  withDocumentName
} from '@shared/canvas/document-file'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { t } from '@/i18n/ui-strings'
import { downloadFile } from './browser-download'
import { displayFilePath, type FilePath } from './file-path'
import {
  pickFileHandle,
  pickSaveFileHandle,
  readFileHandle,
  supportsFileSystemAccess,
  writeFileHandle,
  type FilePickerType
} from './file-system-access'
import { invokeCommand } from './native-command'
import { isTauriRuntime } from './tauri-runtime'

export type OpenedDocument = {
  document: CanvasDocument
  filePath: FilePath | null
  /** Browser only: the File System Access handle the document was read from, for Save. */
  fileHandle?: FileSystemFileHandle
}
export type SavedDocument = { filePath: FilePath | null; fileHandle?: FileSystemFileHandle }
/** Where the open document lives this session: a native path (Tauri) or a handle (browser). */
export type SaveTarget = { filePath: FilePath | null; fileHandle?: FileSystemFileHandle | null }

/**
 * Mirrors the native dialog filters in `src-tauri/src/document_dialog.rs`; built per call so the
 * label follows the active locale.
 */
function documentFileTypes(extensions: string[]): FilePickerType[] {
  return [
    {
      description: t('file.documentType', { app: 'CanvaSlide' }),
      accept: { 'application/json': extensions.map((extension) => `.${extension}`) }
    }
  ]
}

/**
 * Tauri: native dialogs + Rust IO. Browser: File System Access pickers and handles where the engine
 * has them (Chromium), so Save writes back to the opened file; otherwise a file input and downloads.
 */
export async function openDocumentFile(): Promise<OpenedDocument | null> {
  if (isTauriRuntime()) {
    return openWithTauri()
  }
  return supportsFileSystemAccess() ? openWithFileSystemAccess() : openWithFileInput()
}

/** Null when a picker was dismissed; the document and any earlier file then stay as they were. */
export async function saveDocumentFile(
  document: CanvasDocument,
  target: SaveTarget,
  forcePrompt = false
): Promise<SavedDocument | null> {
  if (isTauriRuntime()) {
    return saveWithTauri(document, forcePrompt ? null : target.filePath)
  }
  if (supportsFileSystemAccess()) {
    return saveWithFileSystemAccess(document, forcePrompt ? null : (target.fileHandle ?? null))
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
  const contents = await invokeCommand<string>('read_document', { path })
  const parsed = await decodeNativeDocumentFile(contents)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return { document: withDocumentName(parsed.document, displayFilePath(path)), filePath: path }
}

async function openWithTauri(): Promise<OpenedDocument | null> {
  const selected = await invokeCommand<FilePath | null>('pick_document_path')
  if (selected === null) {
    return null
  }
  return openDocumentAtPath(selected)
}

async function saveWithTauri(
  document: CanvasDocument,
  filePath: FilePath | null
): Promise<SavedDocument | null> {
  const chosen =
    filePath ??
    (await invokeCommand<FilePath | null>('pick_document_save_path', {
      defaultName: documentFileName(document)
    }))
  if (!chosen) {
    return null
  }
  const written = await invokeCommand<FilePath>('write_document', {
    path: chosen,
    contents: await encodeNativeDocumentFile(document)
  })
  return { filePath: written }
}

/** The handle is attached to the opened document; it becomes the session's only once it is loaded. */
async function openWithFileSystemAccess(): Promise<OpenedDocument | null> {
  const handle = await pickFileHandle(documentFileTypes([DOCUMENT_FILE_EXTENSION, 'json']))
  if (!handle) {
    return null
  }
  const document = await decodeBrowserFile(await readFileHandle(handle), handle.name)
  return { document, filePath: null, fileHandle: handle }
}

/** Save writes back to the handle; Save As, or a document without one, asks where to write. */
async function saveWithFileSystemAccess(
  document: CanvasDocument,
  fileHandle: FileSystemFileHandle | null
): Promise<SavedDocument | null> {
  const target =
    fileHandle ??
    (await pickSaveFileHandle(
      documentFileName(document),
      documentFileTypes([DOCUMENT_FILE_EXTENSION])
    ))
  if (!target) {
    return null
  }
  await writeFileHandle(target, await encodeDocumentFile(document))
  return { filePath: null, fileHandle: target }
}

async function decodeBrowserFile(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string
): Promise<CanvasDocument> {
  const parsed = await decodeDocumentFile(bytes)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return withDocumentName(parsed.document, fileName)
}

function openWithFileInput(): Promise<OpenedDocument | null> {
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
        const bytes = new Uint8Array(await file.arrayBuffer())
        resolve({ document: await decodeBrowserFile(bytes, file.name), filePath: null })
      } catch (error) {
        reject(error)
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
