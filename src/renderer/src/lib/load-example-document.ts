import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { ExampleError, fetchExampleDocument } from '@/platform/example-document'
import { useDocumentStore } from '@/store/document-store'
import { useCameraStore } from '@/store/camera-store'
import { usePresentationStore } from '@/store/presentation-store'

export async function loadExampleDocument(id: string, signal: AbortSignal): Promise<void> {
  const before = useDocumentStore.getState()
  if (before.dirty || before.editBaseline) {
    throw new ExampleError('changed')
  }
  let changed = false
  // Latch replacements and edits even if Undo later returns to the original document.
  const unsubscribe = useDocumentStore.subscribe((current) => {
    changed ||=
      current.session !== before.session ||
      current.document !== before.document ||
      !!current.editBaseline
  })
  try {
    const document = await fetchExampleDocument(id, signal)
    if (signal.aborted) {
      return
    }
    if (changed) {
      throw new ExampleError('changed')
    }
    usePresentationStore.getState().exit()
    useDocumentStore.getState().loadDocument(document, null)
    const camera = useCameraStore.getState()
    camera.setCamera(cameraForOpenedDocument(document, camera.viewport))
  } finally {
    unsubscribe()
  }
}
