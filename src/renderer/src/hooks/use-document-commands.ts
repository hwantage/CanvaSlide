import { useCallback, useEffect, useMemo } from 'react'
import { createEmptyDocument } from '@shared/canvas/element-types'
import {
  openDocumentAtPath,
  openDocumentFile,
  reportError,
  saveDocumentFile,
  type OpenedDocument
} from '@/platform/document-file-access'
import type { FilePath } from '@/platform/file-path'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { replaceDocument } from '@/lib/document/document-replacement'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

export type DocumentCommands = {
  newDocument: () => Promise<void>
  openDocument: () => Promise<void>
  /** Opens a document the OS handed us, with the same unsaved-work guard as the Open command. */
  openDocumentPath: (path: FilePath) => Promise<void>
  saveDocument: () => Promise<void>
  saveDocumentAs: () => Promise<void>
}

async function guarded(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    await reportError(error)
  }
}

function replaceWith(read: () => Promise<OpenedDocument | null>): Promise<void> {
  return guarded(async () => {
    await replaceDocument({ read, onDirty: 'ask', load: { camera: 'fit' } })
  })
}

// Saves share a queue across hook instances so slow compression cannot overwrite a newer save.
let pendingSave = Promise.resolve()

export function useDocumentCommands(): DocumentCommands {
  const save = useCallback((forcePrompt: boolean) => {
    const session = useDocumentStore.getState().session
    const task = pendingSave.then(() =>
      guarded(async () => {
        const state = useDocumentStore.getState()
        if (state.session !== session) {
          return
        }
        const snapshot = state.takeSaveSnapshot()
        const withCamera = { ...snapshot.document, camera: useCameraStore.getState().camera }
        const result = await saveDocumentFile(withCamera, state.filePath, forcePrompt)
        if (result) {
          useDocumentStore.getState().completeSave(snapshot, result.filePath)
        }
      })
    )
    pendingSave = task.catch(() => {})
    return task
  }, [])

  return useMemo<DocumentCommands>(
    () => ({
      saveDocument: () => save(false),
      saveDocumentAs: () => save(true),
      newDocument: () =>
        replaceWith(async () => ({ document: createEmptyDocument(), filePath: null })),
      openDocument: () => replaceWith(openDocumentFile),
      openDocumentPath: (path: FilePath) => replaceWith(() => openDocumentAtPath(path))
    }),
    [save]
  )
}

/** Mirrors document name + dirty flag into the native window title. */
export function useWindowTitle(): void {
  const name = useDocumentStore((s) => s.document.name)
  const dirty = useDocumentStore((s) => s.dirty)
  useEffect(() => {
    const title = `${dirty ? '• ' : ''}${name} — CanvaSlide`
    document.title = title
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow().setTitle(title)
      )
    }
  }, [name, dirty])
}
