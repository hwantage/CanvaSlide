import { migrateDocumentV1 } from './document-assets'
import {
  canvasDocumentSchema,
  canvasDocumentV1Schema,
  createEmptyDocument,
  type CanvasDocument
} from './element-types'

export const DOCUMENT_FILE_EXTENSION = 'canvaslide'
/** Documents written before the single-extension move; still openable, never written. */
export const LEGACY_DOCUMENT_FILE_EXTENSION = 'canvas.json'
export const DOCUMENT_FILE_FILTER = {
  name: 'CanvaSlide document',
  extensions: [DOCUMENT_FILE_EXTENSION]
}
export const DOCUMENT_OPEN_FILE_FILTER = {
  name: 'CanvaSlide document',
  // Why: native dialogs match only the last segment, so a legacy `.canvas.json` has to enter as `json`.
  extensions: [DOCUMENT_FILE_EXTENSION, LEGACY_DOCUMENT_FILE_EXTENSION.split('.').pop() ?? 'json']
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

/** Windows rejects these outright; macOS rejects `/` and shows `:` as one. */
const UNSAFE_FILE_NAME_CHARS = /[\p{Cc}<>:"/\\|?*]/gu
/** Windows refuses these stems whatever the extension. */
const RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
/** 80 CJK characters plus the extension stay inside the 255-byte limit. */
const MAX_FILE_NAME_STEM = 80

/** Turns a display name into a stem both macOS and Windows accept. */
export function fileNameStem(name: string): string {
  const stem = name
    .normalize('NFC')
    .replace(UNSAFE_FILE_NAME_CHARS, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_FILE_NAME_STEM)
    .replace(/^[-.]+|[-.]+$/g, '')
  return stem === '' || RESERVED_FILE_NAMES.test(stem) ? 'Untitled' : stem
}

export function documentFileName(document: CanvasDocument): string {
  return `${fileNameStem(document.name)}.${DOCUMENT_FILE_EXTENSION}`
}

const DOCUMENT_SUFFIX = new RegExp(
  `\\.(?:${DOCUMENT_FILE_EXTENSION}|${LEGACY_DOCUMENT_FILE_EXTENSION.replaceAll('.', '\\.')})$`,
  'i'
)

export function documentNameFromPath(path: string): string {
  const fileName = path.split(/[\\/]/).at(-1) ?? ''
  return fileName.replace(DOCUMENT_SUFFIX, '')
}

/** The name written in the document wins; only an unnamed document falls back to its file name. */
export function withDocumentName(document: CanvasDocument, path: string): CanvasDocument {
  return document.name.trim() === '' ? { ...document, name: documentNameFromPath(path) } : document
}

export { createEmptyDocument }
