import { ExampleError, fetchExampleDocument } from '@/platform/example-document'
import { replaceDocument } from './document-replacement'

export async function loadExampleDocument(id: string, signal: AbortSignal): Promise<void> {
  const outcome = await replaceDocument({
    onDirty: 'refuse',
    read: async () => {
      const document = await fetchExampleDocument(id, signal)
      return signal.aborted ? null : { document, filePath: null }
    },
    load: { camera: 'fit', keepLink: true }
  })
  if (outcome === 'refused' || outcome === 'changed') {
    throw new ExampleError('changed')
  }
}
