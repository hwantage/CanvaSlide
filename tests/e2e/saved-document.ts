import { parseDocumentFile } from '../../src/shared/canvas/document-archive'

export function readSavedDocument(bytes: Uint8Array) {
  const result = parseDocumentFile(bytes)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.document
}
