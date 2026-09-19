import { CloudShareError, type SharedSnapshot } from '@shared/cloud-share'
import { cameraForOpenedDocument } from '@shared/canvas/frame-fit'
import { fetchCloudShare } from '@/platform/cloud-share'
import { useCameraStore } from '@/store/camera-store'
import { useDocumentStore } from '@/store/document-store'
import { usePresentationStore } from '@/store/presentation-store'

export async function loadSharedDocument(
  id: string,
  signal: AbortSignal
): Promise<SharedSnapshot | null> {
  const before = useDocumentStore.getState()
  if (before.dirty || before.editBaseline) {
    throw new CloudShareError('changed')
  }
  const snapshot = await fetchCloudShare(id, signal)
  if (signal.aborted) {
    return null
  }
  const current = useDocumentStore.getState()
  // A late response must never replace a file opened or edited while the request was pending.
  if (current.session !== before.session || current.document !== before.document) {
    throw new CloudShareError('changed')
  }
  // The presentation document enters its store only after the editor and its input hooks unmount.
  if (snapshot.access === 'present') {
    return snapshot
  }
  const { document } = snapshot
  usePresentationStore.getState().exit()
  current.loadDocument(document, null)
  const camera = useCameraStore.getState()
  camera.setCamera(cameraForOpenedDocument(document, camera.viewport))
  return snapshot
}
