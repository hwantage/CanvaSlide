import { CloudShareError, type SharedSnapshot } from '@shared/cloud-share'
import { fetchCloudShare } from '@/platform/cloud-share'
import { loadReplacement, replaceDocument } from './document-replacement'

export async function loadSharedDocument(
  id: string,
  signal: AbortSignal
): Promise<SharedSnapshot | null> {
  let snapshot = null as SharedSnapshot | null
  const outcome = await replaceDocument({
    onDirty: 'refuse',
    read: async () => {
      snapshot = await fetchCloudShare(id, signal)
      return signal.aborted ? null : { document: snapshot.document, filePath: null }
    },
    load: (opened) => {
      // The presentation document enters its store only after the editor and its input hooks unmount.
      if (snapshot?.access !== 'present') {
        loadReplacement(opened, { camera: 'fit', keepLink: true })
      }
    }
  })
  if (outcome === 'refused' || outcome === 'changed') {
    throw new CloudShareError('changed')
  }
  return outcome === 'replaced' ? snapshot : null
}
