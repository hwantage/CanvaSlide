import { createDocumentEncoder } from '@shared/canvas/document-resources'
import { parseDocument, parseDocumentFile } from '@shared/canvas/document-file'
import {
  inspectRecoverySnapshot,
  parseRecoverySnapshot,
  serializeRecoverySnapshot
} from '@shared/canvas/recovery-snapshot'
import type { DocumentCodecRequest, DocumentCodecResponse } from './document-file-codec'

let encode = createDocumentEncoder()

self.onmessage = (event: MessageEvent<DocumentCodecRequest>) => {
  try {
    const request = event.data
    if (request.kind === 'inspect-recovery' || request.kind === 'decode-recovery') {
      let raw: unknown = null
      try {
        raw = JSON.parse(
          typeof request.payload === 'string'
            ? request.payload
            : new TextDecoder('utf-8', { fatal: true }).decode(request.payload)
        )
      } catch {
        /* Invalid data is retained for an explicit decision. */
      }
      const snapshot = parseRecoverySnapshot(raw)
      if (request.kind === 'inspect-recovery') {
        const info = inspectRecoverySnapshot(raw)
        self.postMessage({
          kind: 'inspected-recovery',
          result:
            info.kind === 'valid' && !snapshot
              ? { kind: 'quarantined', version: info.snapshot.version }
              : info
        } satisfies DocumentCodecResponse)
      } else {
        const info = snapshot ? inspectRecoverySnapshot(snapshot) : null
        self.postMessage({
          kind: 'decoded-recovery',
          snapshot: info?.kind === 'valid' ? info.snapshot : null,
          result: snapshot
            ? parseDocument(snapshot.contents)
            : { ok: false, error: 'Invalid recovery snapshot' }
        } satisfies DocumentCodecResponse)
      }
    } else if ('document' in request) {
      const contents = encode(request.document)
      if (request.kind === 'encode-recovery') {
        const bytes = new TextEncoder().encode(
          serializeRecoverySnapshot(request.snapshot, contents)
        )
        self.postMessage({ kind: 'encoded-recovery', bytes } satisfies DocumentCodecResponse, {
          transfer: [bytes.buffer]
        })
      } else if (request.kind === 'encode-native') {
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
