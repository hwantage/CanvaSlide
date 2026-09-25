import { nanoid } from 'nanoid'
import { canvasDocumentSchema } from '../shared/canvas/element-types'
import { hasAllowedShareVideos, hasOnlyEmbeddedImages } from '../shared/cloud-share/share-document'
import { orderedFrames } from '../shared/canvas/presentation-sequence'
import {
  CloudShareError,
  isShareId,
  MAX_SHARE_BYTES,
  readShareBody,
  SHARE_ID_LENGTH,
  SHARE_TTL_SECONDS,
  unwrapShareSnapshot
} from '../shared/cloud-share/share-protocol'

// Structural types keep the handlers portable to tests while matching Pages' KV binding.
export type ShareEnvironment = {
  SHARED_DOCUMENTS?: {
    get: (key: string) => Promise<string | null>
    put: (key: string, value: string, options: { expirationTtl: number }) => Promise<void>
  }
}

export type ShareContext = {
  request: Request
  env: ShareEnvironment
  params: Record<string, string | string[]>
}

type Reply = (body: unknown, status?: number, extraHeaders?: Record<string, string>) => Response

// The hosted editor calls its own origin; macOS and Windows WebViews and loopback dev servers do not.
const desktopOrigins = new Set(['tauri://localhost', 'http://tauri.localhost'])
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function isAllowedShareOrigin(origin: string, serviceOrigin: string): boolean {
  if (origin === serviceOrigin || desktopOrigins.has(origin)) {
    return true
  }
  try {
    const url = new URL(origin)
    return url.origin === origin && url.protocol === 'http:' && loopbackHosts.has(url.hostname)
  } catch {
    return false
  }
}

function respond(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
      ...headers
    }
  })
}

// Credential-free CORS for allowed origins only; foreign browser origins are refused before any work.
function replyFor(request: Request): Reply | null {
  const origin = request.headers.get('Origin')
  if (origin === null) {
    return (body, status = 200, extraHeaders) => respond(body, status, extraHeaders)
  }
  if (!isAllowedShareOrigin(origin, new URL(request.url).origin)) {
    return null
  }
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  }
  return (body, status = 200, extraHeaders) => respond(body, status, { ...cors, ...extraHeaders })
}

function storageError(reply: Reply, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error)
  const quota = /429|quota|rate.?limit|limit exceeded|too many/i.test(message)
  return reply(
    { error: quota ? 'quota' : 'unavailable' },
    quota ? 429 : 503,
    quota ? { 'Retry-After': '60' } : undefined
  )
}

export async function createShare({ request, env }: ShareContext): Promise<Response> {
  const reply = replyFor(request)
  if (!reply) {
    return respond({ error: 'origin' }, 403)
  }
  if (request.method === 'OPTIONS') {
    return reply(null, 204)
  }
  if (request.method !== 'POST') {
    return reply({ error: 'method' }, 405, { Allow: 'POST, OPTIONS' })
  }
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    return reply({ error: 'contentType' }, 415)
  }
  let body: string
  try {
    const snapshot = unwrapShareSnapshot(JSON.parse(await readShareBody(request)))
    const parsed = canvasDocumentSchema.safeParse(snapshot.document)
    if (!parsed.success || !hasOnlyEmbeddedImages(parsed.data)) {
      return reply({ error: 'invalid' }, 400)
    }
    if (!hasAllowedShareVideos(parsed.data, new URL(request.url).origin)) {
      return reply({ error: 'unsupportedVideo' }, 400)
    }
    if (snapshot.access === 'present' && orderedFrames(parsed.data).length === 0) {
      return reply({ error: 'noFrames' }, 400)
    }
    body = JSON.stringify({ access: snapshot.access, document: parsed.data })
    // Schema defaults can make the stored document larger than the request.
    if (new TextEncoder().encode(body).byteLength > MAX_SHARE_BYTES) {
      throw new CloudShareError('tooLarge')
    }
  } catch (error) {
    const tooLarge = error instanceof CloudShareError && error.code === 'tooLarge'
    return reply({ error: tooLarge ? 'tooLarge' : 'invalid' }, tooLarge ? 413 : 400)
  }
  if (!env.SHARED_DOCUMENTS) {
    return reply({ error: 'unavailable' }, 503)
  }
  try {
    const id = nanoid(SHARE_ID_LENGTH)
    await env.SHARED_DOCUMENTS.put(`share:${id}`, body, { expirationTtl: SHARE_TTL_SECONDS })
    const url = new URL('/', request.url)
    url.searchParams.set('share', id)
    return reply({ id, url: url.href }, 201)
  } catch (error) {
    return storageError(reply, error)
  }
}

export async function getShare({ request, env, params }: ShareContext): Promise<Response> {
  const reply = replyFor(request)
  if (!reply) {
    return respond({ error: 'origin' }, 403)
  }
  if (request.method === 'OPTIONS') {
    return reply(null, 204)
  }
  if (request.method !== 'GET') {
    return reply({ error: 'method' }, 405, { Allow: 'GET, OPTIONS' })
  }
  if (!isShareId(params.id)) {
    return reply({ error: 'invalid' }, 400)
  }
  if (!env.SHARED_DOCUMENTS) {
    return reply({ error: 'unavailable' }, 503)
  }
  try {
    const body = await env.SHARED_DOCUMENTS.get(`share:${params.id}`)
    if (body === null) {
      return reply({ error: 'missing' }, 404)
    }
    const response = reply(null)
    return new Response(body, { headers: response.headers })
  } catch (error) {
    return storageError(reply, error)
  }
}
