import { parseDocumentFile, serializeDocument } from '../../src/shared/canvas/document-file'
import { canvasDocumentSchema } from '../../src/shared/canvas/element-types'

export function encodeDocumentFixture(document: unknown): Buffer {
  return Buffer.from(serializeDocument(canvasDocumentSchema.parse(document)))
}

export function readSavedDocument(bytes: Uint8Array) {
  const result = parseDocumentFile(bytes)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.document
}
