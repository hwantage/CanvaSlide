import { documentFileSchema, createEmptyDocument, type CanvasDocument } from './element-types'
import {
  createDocumentEncoder,
  MAX_DOCUMENT_BYTES,
  resolveDocumentResources
} from './document-resources'

export const DOCUMENT_FILE_EXTENSION = 'canvaslide'
export const DOCUMENT_FILE_FILTER = {
  name: 'CanvaSlide document',
  extensions: [DOCUMENT_FILE_EXTENSION]
}
export const DOCUMENT_OPEN_FILE_FILTER = {
  name: 'CanvaSlide document',
  extensions: [DOCUMENT_FILE_EXTENSION, 'json']
}

export type ParseDocumentResult =
  | { ok: true; document: CanvasDocument }
  | { ok: false; error: string }

/** The same readable JSON format is used for authoring and saving. */
export function serializeDocument(document: CanvasDocument): string {
  return createDocumentEncoder()(document)
}

export function parseDocument(json: string): ParseDocumentResult {
  try {
    if (
      json.length > MAX_DOCUMENT_BYTES ||
      new TextEncoder().encode(json).byteLength > MAX_DOCUMENT_BYTES
    ) {
      throw new Error('Document exceeds file size limit')
    }
    return parseDocumentContents(json)
  } catch (error) {
    return { ok: false, error: `Invalid document: ${(error as Error).message}` }
  }
}

export function parseDocumentFile(bytes: Uint8Array): ParseDocumentResult {
  try {
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error('Document exceeds file size limit')
    }
    return parseDocumentContents(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    return { ok: false, error: `Invalid document: ${(error as Error).message}` }
  }
}

function parseDocumentContents(json: string): ParseDocumentResult {
  const result = documentFileSchema.safeParse(JSON.parse(json))
  if (!result.success) {
    return { ok: false, error: describeIssue(result.error.issues[0]) }
  }
  return { ok: true, document: repairDocumentOrder(resolveDocumentResources(result.data)) }
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

const DOCUMENT_SUFFIX = new RegExp(`\\.(?:${DOCUMENT_FILE_EXTENSION}|json)$`, 'i')

export function documentNameFromPath(path: string): string {
  const fileName = path.split(/[\\/]/).at(-1) ?? ''
  return fileName.replace(DOCUMENT_SUFFIX, '')
}

/** The name written in the document wins; only an unnamed document falls back to its file name. */
export function withDocumentName(document: CanvasDocument, path: string): CanvasDocument {
  return document.name.trim() === '' ? { ...document, name: documentNameFromPath(path) } : document
}

export { createEmptyDocument }
