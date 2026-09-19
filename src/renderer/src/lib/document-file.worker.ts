import { parseDocumentFile } from '@shared/canvas/document-archive'
import { createDocumentArchiveEncoder } from '@shared/canvas/document-archive-encoder'
import { parseDocument } from '@shared/canvas/document-file'
import { base64ToBytes, bytesToBase64 } from '@shared/canvas/binary-data'
import type { DocumentCodecRequest, DocumentCodecResponse } from './document-file-codec'

const TRANSPORT_PREFIX = 'canvaslide-zip:'
let encode = createDocumentArchiveEncoder()

self.onmessage = (event: MessageEvent<DocumentCodecRequest>) => {
  try {
    const request = event.data
    if ('document' in request) {
      const bytes = encode(request.document)
      if (request.kind === 'encode-native') {
        self.postMessage({
          kind: 'encoded-native',
          contents: TRANSPORT_PREFIX + bytesToBase64(bytes)
        } satisfies DocumentCodecResponse)
      } else {
        self.postMessage({ kind: 'encoded', bytes } satisfies DocumentCodecResponse, {
          transfer: [bytes.buffer]
        })
      }
    } else {
      const result =
        request.kind === 'decode'
          ? parseDocumentFile(request.bytes)
          : request.contents.startsWith(TRANSPORT_PREFIX)
            ? parseDocumentFile(base64ToBytes(request.contents.slice(TRANSPORT_PREFIX.length)))
            : parseDocument(request.contents)
      encode = createDocumentArchiveEncoder()
      self.postMessage({ kind: 'decoded', result } satisfies DocumentCodecResponse)
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies DocumentCodecResponse)
  }
}
