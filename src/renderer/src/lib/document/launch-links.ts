import { CloudShareError, shareIdFromSearch } from '@shared/cloud-share/share-protocol'
import { createCloudShare } from '@/platform/cloud-share'
import { ExampleError } from '@/platform/example-document'
import { isTauriRuntime } from '@/platform/tauri-runtime'
import { useCameraStore } from '@/store/camera-store'
import { useCloudShareStore } from '@/store/cloud-share-store'
import { useDocumentStore } from '@/store/document-store'
import { useExampleStore } from '@/store/example-store'
import { exampleRequest, shareRequest } from './launch-link-session'
import { loadExampleDocument } from './load-example-document'
import { loadSharedDocument } from './load-shared-document'

export function showShareDialog(): void {
  shareRequest.cancel()
  useCloudShareStore.setState({
    open: true,
    mode: 'publish',
    busy: false,
    url: null,
    error: null,
    access: 'present'
  })
}

export async function publishShare(): Promise<string | null> {
  if (useCloudShareStore.getState().busy) {
    return null
  }
  const request = shareRequest.start()
  useCloudShareStore.setState({ busy: true, error: null, url: null })
  try {
    const document = useDocumentStore.getState().document
    const url = await createCloudShare(
      { ...document, camera: useCameraStore.getState().camera },
      request.signal,
      useCloudShareStore.getState().access
    )
    if (!request.signal.aborted) {
      useCloudShareStore.setState({ busy: false, url })
      return url
    }
  } catch (error) {
    if (!request.signal.aborted) {
      useCloudShareStore.setState({
        busy: false,
        error: error instanceof CloudShareError ? error.code : 'unavailable'
      })
    }
  }
  return null
}

export async function openSharedLink(search: string): Promise<void> {
  const request = shareRequest.start()
  try {
    const id = shareIdFromSearch(search)
    if (id === null) {
      return
    }
    useCloudShareStore.setState({ open: true, mode: 'load', busy: true, url: null, error: null })
    const snapshot = await loadSharedDocument(id, request.signal)
    if (!request.signal.aborted && snapshot) {
      useCloudShareStore.setState({
        open: false,
        busy: false,
        presentation: snapshot.access === 'present' ? snapshot.document : null
      })
    }
  } catch (error) {
    if (!request.signal.aborted) {
      useCloudShareStore.setState({
        open: true,
        mode: 'load',
        url: null,
        busy: false,
        error: error instanceof CloudShareError ? error.code : 'unavailable'
      })
    }
  }
}

export async function openExampleLink(search: string): Promise<void> {
  exampleRequest.cancel()
  const params = new URLSearchParams(search)
  // A cloud link owns its access mode; an example parameter must not redirect that entry.
  if (isTauriRuntime() || params.has('share') || !params.has('example')) {
    useExampleStore.setState({ open: false, busy: false, error: null })
    return
  }
  const request = exampleRequest.start()
  useExampleStore.setState({ open: true, busy: true, error: null })
  try {
    if (params.getAll('example').length !== 1) {
      throw new ExampleError('unknown')
    }
    await loadExampleDocument(params.get('example')!, request.signal)
    if (!request.signal.aborted) {
      useExampleStore.setState({ open: false, busy: false })
    }
  } catch (error) {
    if (!request.signal.aborted) {
      useExampleStore.setState({
        busy: false,
        error: error instanceof ExampleError ? error.code : 'network'
      })
    }
  } finally {
    exampleRequest.finish(request)
  }
}
