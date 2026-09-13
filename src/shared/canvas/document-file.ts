import { migrateDocumentV1 } from './document-assets'
import {
  canvasDocumentSchema,
  canvasDocumentV1Schema,
  createEmptyDocument,
  type CanvasDocument
} from './element-types'

export const DOCUMENT_FILE_EXTENSION = 'canvas.json'
export const DOCUMENT_FILE_FILTER = {
  name: 'Canvas document',
  extensions: [DOCUMENT_FILE_EXTENSION]
}

export type ParseDocumentResult =
  | { ok: true; document: CanvasDocument }
  | { ok: false; error: string }

export function serializeDocument(document: CanvasDocument): string {
  return JSON.stringify(document, null, 2)
}

export function parseDocument(json: string): ParseDocumentResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${(error as Error).message}` }
  }
  const version = typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'version') : undefined
  if (version === 1) {
    const legacy = canvasDocumentV1Schema.safeParse(raw)
    if (!legacy.success) {
      return { ok: false, error: describeIssue(legacy.error.issues[0]) }
    }
    return { ok: true, document: repairDocumentOrder(migrateDocumentV1(legacy.data)) }
  }
  const result = canvasDocumentSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, error: describeIssue(result.error.issues[0]) }
  }
  return { ok: true, document: repairDocumentOrder(result.data) }
}

function describeIssue(issue: { path: PropertyKey[]; message: string } | undefined): string {
  const path = issue?.path.join('.') ?? ''
  return `Invalid document${path ? ` at ${path}` : ''}: ${issue?.message ?? 'unknown'}`
}

/** Drops dangling ids from `order` and appends elements that were missing from it. */
export function repairDocumentOrder(document: CanvasDocument): CanvasDocument {
  const seen = new Set<string>()
  const order: string[] = []
  for (const id of document.order) {
    if (document.elements[id] && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }
  for (const id of Object.keys(document.elements)) {
    if (!seen.has(id)) {
      order.push(id)
    }
  }
  return { ...document, order }
}

export function documentFileName(document: CanvasDocument): string {
  const base = document.name.trim() === '' ? 'Untitled' : document.name.trim()
  return `${base}.${DOCUMENT_FILE_EXTENSION}`
}

export function documentNameFromPath(path: string): string {
  const fileName = path.split(/[\\/]/).at(-1) ?? ''
  return fileName.replace(new RegExp(`\\.${DOCUMENT_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '')
}

export { createEmptyDocument }
