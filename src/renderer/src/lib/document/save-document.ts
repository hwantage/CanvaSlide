import { saveDocumentFile } from '@/platform/document-file-access'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'

// Saves share a queue so slow compression cannot overwrite a newer save.
let pendingSave: Promise<unknown> = Promise.resolve()

/** Returns false when the picker is cancelled or the document session has changed. */
export function saveCurrentDocument(forcePrompt = false): Promise<boolean> {
  const session = useDocumentStore.getState().session
  const task = pendingSave.then(async () => {
    const state = useDocumentStore.getState()
    if (state.session !== session) {
      return false
    }
    const snapshot = state.takeSaveSnapshot()
    const withCamera = { ...snapshot.document, camera: useCameraStore.getState().camera }
    const target = { filePath: state.filePath, fileHandle: state.fileHandle }
    const result = await saveDocumentFile(withCamera, target, forcePrompt)
    if (!result) {
      return false
    }
    const current = useDocumentStore.getState()
    current.completeSave(snapshot, result.filePath, result.fileHandle)
    return current.session === session
  })
  pendingSave = task.catch(() => {})
  return task
}
