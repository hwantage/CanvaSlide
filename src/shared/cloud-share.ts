import type { CanvasDocument } from './canvas/element-types'

export const MAX_SHARE_BYTES = 5 * 1024 * 1024
export const SHARE_ID_LENGTH = 21
export const SHARE_TTL_SECONDS = 24 * 60 * 60

export type ShareAccess = 'edit' | 'present'
export type SharedSnapshot = { access: ShareAccess; document: CanvasDocument }

export function isShareAccess(value: unknown): value is ShareAccess {
  return value === 'edit' || value === 'present'
}

export function unwrapShareSnapshot(value: unknown): { access: ShareAccess; document: unknown } {
  if (value && typeof value === 'object' && ('access' in value || 'document' in value)) {
    if (!('access' in value) || !isShareAccess(value.access) || !('document' in value)) {
      throw new CloudShareError('invalid')
    }
    return { access: value.access, document: value.document }
  }
  // Links created before access modes stored the document directly and remain editable copies.
  return { access: 'edit', document: value }
}

export type CloudShareErrorCode =
  | 'invalid'
  | 'tooLarge'
  | 'quota'
  | 'missing'
  | 'unavailable'
  | 'network'
  | 'changed'
  | 'noFrames'
  | 'unsupportedVideo'

export class CloudShareError extends Error {
  constructor(public readonly code: CloudShareErrorCode) {
    super(code)
    this.name = 'CloudShareError'
  }
}

export function isShareId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{21}$/.test(value)
}

export function shareIdFromSearch(search: string): string | null {
  const ids = new URLSearchParams(search).getAll('share')
  if (ids.length === 0) {
    return null
  }
  if (ids.length !== 1 || !isShareId(ids[0])) {
    throw new CloudShareError('invalid')
  }
  return ids[0]
}

// Count streamed bytes too: Content-Length may be absent or dishonest.
export async function readShareBody(message: Request | Response): Promise<string> {
  if (Number(message.headers.get('content-length')) > MAX_SHARE_BYTES) {
    throw new CloudShareError('tooLarge')
  }
  const reader = message.body?.getReader()
  if (!reader) {
    return ''
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        return text + decoder.decode()
      }
      bytes += value.byteLength
      if (bytes > MAX_SHARE_BYTES) {
        throw new CloudShareError('tooLarge')
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}
