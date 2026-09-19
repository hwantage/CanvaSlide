import {
  CloudShareError,
  isShareAccess,
  isShareId,
  MAX_SHARE_BYTES,
  readShareBody,
  unwrapShareSnapshot,
  type ShareAccess,
  type SharedSnapshot
} from '@shared/cloud-share'
import { parseDocument } from '@shared/canvas/document-file'
import { hasAllowedShareVideos, hasOnlyEmbeddedImages } from '@shared/canvas/share-document'
import { orderedFrames } from '@shared/canvas/presentation-sequence'
import type { CanvasDocument } from '@shared/canvas/element-types'
import { isTauriRuntime } from './tauri-runtime'

export function cloudShareOrigin(
  configured: string | undefined = import.meta.env.VITE_CLOUD_SHARE_URL,
  desktop = isTauriRuntime(),
  currentOrigin = window.location.origin
): string {
  try {
    if (!configured && desktop) {
      throw new CloudShareError('unavailable')
    }
    const url = new URL(configured || currentOrigin)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new CloudShareError('unavailable')
    }
    return url.origin
  } catch {
    throw new CloudShareError('unavailable')
  }
}

async function requestShare(path: string, init: RequestInit): Promise<string> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  init.signal?.addEventListener('abort', cancel, { once: true })
  if (init.signal?.aborted) {
    cancel()
  }
  const timeout = setTimeout(cancel, 30_000)
  try {
    const response = await fetch(`${cloudShareOrigin()}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error'
    })
    if (!response.ok) {
      const code =
        response.status === 429
          ? 'quota'
          : response.status === 413
            ? 'tooLarge'
            : response.status === 404 && init.method !== 'POST'
              ? 'missing'
              : response.status === 400
                ? 'invalid'
                : 'unavailable'
      throw new CloudShareError(code)
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new CloudShareError('unavailable')
    }
    return await readShareBody(response)
  } catch (error) {
    if (error instanceof CloudShareError) {
      throw error
    }
    throw new CloudShareError('network')
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', cancel)
  }
}

export async function createCloudShare(
  document: CanvasDocument,
  signal: AbortSignal,
  access: ShareAccess = 'edit'
): Promise<string> {
  if (!isShareAccess(access) || !hasOnlyEmbeddedImages(document)) {
    throw new CloudShareError('invalid')
  }
  if (!hasAllowedShareVideos(document, cloudShareOrigin())) {
    throw new CloudShareError('unsupportedVideo')
  }
  if (access === 'present' && orderedFrames(document).length === 0) {
    throw new CloudShareError('noFrames')
  }
  const body = JSON.stringify({ access, document })
  if (new TextEncoder().encode(body).byteLength > MAX_SHARE_BYTES) {
    throw new CloudShareError('tooLarge')
  }
  const text = await requestShare('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal
  })
  try {
    const result: unknown = JSON.parse(text)
    if (!result || typeof result !== 'object' || !('id' in result) || !isShareId(result.id)) {
      throw new CloudShareError('invalid')
    }
    // Build locally so an unexpected backend response cannot supply a foreign link.
    const url = new URL('/', cloudShareOrigin())
    url.searchParams.set('share', result.id)
    return url.href
  } catch {
    throw new CloudShareError('invalid')
  }
}

export async function fetchCloudShare(id: string, signal: AbortSignal): Promise<SharedSnapshot> {
  if (!isShareId(id)) {
    throw new CloudShareError('invalid')
  }
  const text = await requestShare(`/api/share/${id}`, { signal })
  let snapshot: ReturnType<typeof unwrapShareSnapshot>
  try {
    snapshot = unwrapShareSnapshot(JSON.parse(text))
  } catch {
    throw new CloudShareError('invalid')
  }
  const parsed = parseDocument(JSON.stringify(snapshot.document))
  if (!parsed.ok || !hasOnlyEmbeddedImages(parsed.document)) {
    throw new CloudShareError('invalid')
  }
  if (!hasAllowedShareVideos(parsed.document, cloudShareOrigin())) {
    throw new CloudShareError('unsupportedVideo')
  }
  if (snapshot.access === 'present' && orderedFrames(parsed.document).length === 0) {
    throw new CloudShareError('noFrames')
  }
  return { access: snapshot.access, document: parsed.document }
}

export async function copyShareLink(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(url)
    return
  }
  await navigator.clipboard.writeText(url)
}

export function clearShareQuery(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.has('share')) {
    url.searchParams.delete('share')
    window.history.replaceState(window.history.state, '', url)
  }
}
