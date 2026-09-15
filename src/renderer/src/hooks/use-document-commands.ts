import { useCallback, useEffect, useMemo } from 'react'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import {
  confirmDiscardChanges,
  openDocumentAtPath,
  openDocumentFile,
  saveDocumentFile,
  showErrorMessage,
  type OpenedDocument
} from '@/platform/document-file-access'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

export type DocumentCommands = {
  newDocument: () => Promise<void>
  openDocument: () => Promise<void>
  /** Opens a document the OS handed us, with the same unsaved-work guard as the Open command. */
  openDocumentPath: (path: string) => Promise<void>
  saveDocument: () => Promise<void>
  saveDocumentAs: () => Promise<void>
}

async function guarded(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    await showErrorMessage(error instanceof Error ? error.message : String(error))
  }
}

/** Shared by the Open command and by a document handed to us: confirm, load, then frame it. */
async function openInto(read: () => Promise<OpenedDocument | null>): Promise<void> {
  if (useDocumentStore.getState().dirty && !(await confirmDiscardChanges())) {
    return
  }
  const opened = await read()
  if (!opened) {
    return
  }
  usePresentationStore.getState().exit()
  useDocumentStore.getState().loadDocument(opened.document, opened.filePath)
  // Why: the saved camera may point at empty space; show the whole board instead.
  const camera = useCameraStore.getState()
  camera.setCamera(cameraForOpenedDocument(opened.document, camera.viewport))
}

export function useDocumentCommands(): DocumentCommands {
  const save = useCallback(
    (forcePrompt: boolean) =>
      guarded(async () => {
        const state = useDocumentStore.getState()
        const snapshot = state.takeSaveSnapshot()
        const withCamera = { ...snapshot.document, camera: useCameraStore.getState().camera }
        const result = await saveDocumentFile(withCamera, state.filePath, forcePrompt)
        if (result) {
          useDocumentStore.getState().completeSave(snapshot, result.filePath)
        }
      }),
    []
  )

  return useMemo<DocumentCommands>(
    () => ({
      saveDocument: () => save(false),
      saveDocumentAs: () => save(true),
      newDocument: () =>
        guarded(async () => {
          if (useDocumentStore.getState().dirty && !(await confirmDiscardChanges())) {
            return
          }
          usePresentationStore.getState().exit()
          useDocumentStore.getState().newDocument()
          useCameraStore.getState().setCamera({ x: 0, y: 0, zoom: 1 })
        }),
      openDocument: () => guarded(() => openInto(openDocumentFile)),
      openDocumentPath: (path: string) => guarded(() => openInto(() => openDocumentAtPath(path)))
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
