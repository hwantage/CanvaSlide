import { useCallback, useEffect, useMemo } from 'react'
import { documentNameFromPath } from '@shared/canvas/document-file'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import {
  confirmDiscardChanges,
  openDocumentFile,
  saveDocumentFile,
  showErrorMessage
} from '@/platform/document-file-access'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

export type DocumentCommands = {
  newDocument: () => Promise<void>
  openDocument: () => Promise<void>
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

export function useDocumentCommands(): DocumentCommands {
  const save = useCallback(
    (forcePrompt: boolean) =>
      guarded(async () => {
        const state = useDocumentStore.getState()
        const snapshot = state.takeSaveSnapshot()
        const withCamera = { ...snapshot.document, camera: useCameraStore.getState().camera }
        const result = await saveDocumentFile(withCamera, state.filePath, forcePrompt)
        if (result) {
          const name = result.filePath
            ? documentNameFromPath(result.filePath)
            : snapshot.document.name
          useDocumentStore.getState().completeSave(snapshot, result.filePath, name)
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
      openDocument: () =>
        guarded(async () => {
          if (useDocumentStore.getState().dirty && !(await confirmDiscardChanges())) {
            return
          }
          const opened = await openDocumentFile()
          if (!opened) {
            return
          }
          usePresentationStore.getState().exit()
          useDocumentStore.getState().loadDocument(opened.document, opened.filePath)
          // Why: the saved camera may point at empty space; show the whole board instead.
          const camera = useCameraStore.getState()
          camera.setCamera(cameraForOpenedDocument(opened.document, camera.viewport))
        })
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
