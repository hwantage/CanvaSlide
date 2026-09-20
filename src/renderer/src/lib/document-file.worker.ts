import { createDocumentEncoder } from '@shared/canvas/document-resources'
import { parseDocument, parseDocumentFile } from '@shared/canvas/document-file'
import type { DocumentCodecRequest, DocumentCodecResponse } from './document-file-codec'

let encode = createDocumentEncoder()

self.onmessage = (event: MessageEvent<DocumentCodecRequest>) => {
  try {
    const request = event.data
    if ('document' in request) {
      const contents = encode(request.document)
      if (request.kind === 'encode-native') {
        self.postMessage({
          kind: 'encoded-native',
          contents
        } satisfies DocumentCodecResponse)
      } else {
        const bytes = new TextEncoder().encode(contents)
        self.postMessage({ kind: 'encoded', bytes } satisfies DocumentCodecResponse, {
          transfer: [bytes.buffer]
        })
      }
    } else {
      const result =
        request.kind === 'decode'
          ? parseDocumentFile(request.bytes)
          : parseDocument(request.contents)
      encode = createDocumentEncoder()
      self.postMessage({ kind: 'decoded', result } satisfies DocumentCodecResponse)
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies DocumentCodecResponse)
  }
}
