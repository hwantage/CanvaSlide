// @vitest-environment node
import { onRequest as createShare } from '../../functions/api/share'
import { onRequest as getShare } from '../../functions/api/share/[id]'
import { MAX_SHARE_BYTES, isShareId } from '../shared/cloud-share'
import { createEmptyDocument } from '../shared/canvas/element-types'
import type { ShareContext } from './share-api'

const origin = 'https://canvas.example'
const id = 'abcdefghijklmnopqr_-1'
let values: Map<string, string>
let expiresAt: Map<string, number>
let env: ShareContext['env']

beforeEach(() => {
  values = new Map()
  expiresAt = new Map()
  env = {
    SHARED_DOCUMENTS: {
      get: vi.fn(async (key: string) =>
        (expiresAt.get(key) ?? Infinity) <= Date.now() ? null : (values.get(key) ?? null)
      ),
      put: vi.fn(async (key: string, value: string, options: { expirationTtl: number }) => {
        values.set(key, value)
        expiresAt.set(key, Date.now() + options.expirationTtl * 1000)
      })
    }
  }
})

afterEach(() => vi.useRealTimers())

function post(
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'application/json' }
) {
  return createShare({
    request: new Request(`${origin}/api/share`, { method: 'POST', headers, body }),
    env,
    params: {}
  })
}

function shared(document: unknown, access = 'edit') {
  return JSON.stringify({ access, document })
}

function get(shareId: string | string[] = id) {
  return getShare({
    request: new Request(`${origin}/api/share/${id}`),
    env,
    params: { id: shareId }
  })
}

it('stores a validated snapshot and round trips the document through the Pages routes', async () => {
  const document = createEmptyDocument()
  document.name = '공유 <canvas>'
  const response = await post(shared({ ...document, ignored: 'not stored' }))
  expect(response.status).toBe(201)
  const result = await response.json()
  expect(isShareId(result.id)).toBe(true)
  expect(result.url).toBe(`${origin}/?share=${result.id}`)
  expect(JSON.parse(values.get(`share:${result.id}`)!)).toEqual({ access: 'edit', document })
  const retrieved = await get(result.id)
  expect(retrieved.status).toBe(200)
  expect(await retrieved.json()).toEqual({ access: 'edit', document })
  expect(retrieved.headers.get('content-type')).toContain('application/json')
  expect(retrieved.headers.get('cache-control')).toBe('no-store')
  expect(retrieved.headers.get('x-content-type-options')).toBe('nosniff')
  expect(retrieved.headers.get('access-control-allow-origin')).toBeNull()
  expect(retrieved.headers.get('vary')).toBe('Origin')
})

it('stores slideshow access with the snapshot and ignores attempted query overrides', async () => {
  const document = createEmptyDocument()
  document.elements.frame = {
    id: 'frame',
    type: 'frame',
    name: 'First frame',
    order: 0,
    x: 0,
    y: 0,
    width: 800,
    height: 600
  }
  document.order = ['frame']
  const response = await post(shared(document, 'present'))
  expect(response.status).toBe(201)
  const result = await response.json()
  const stored = { access: 'present', document }
  expect(JSON.parse(values.get(`share:${result.id}`)!)).toEqual(stored)
  const loaded = await getShare({
    request: new Request(`${origin}/api/share/${result.id}?access=edit`),
    env,
    params: { id: result.id }
  })
  expect(await loaded.json()).toEqual(stored)
})

it('rejects unknown access modes and slideshow documents without frames', async () => {
  const document = createEmptyDocument()
  expect((await post(shared(document, 'owner'))).status).toBe(400)
  const noFrames = await post(shared(document, 'present'))
  expect(noFrames.status).toBe(400)
  expect(await noFrames.json()).toEqual({ error: 'noFrames' })
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
})

it('rejects a document without the access envelope before KV', async () => {
  const response = await post(JSON.stringify(createEmptyDocument()))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'invalid' })
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
})

it('creates independent links for repeated shares without overwriting earlier snapshots', async () => {
  const first = await post(shared(createEmptyDocument())).then((r) => r.json())
  const second = await post(shared({ ...createEmptyDocument(), name: 'Updated' })).then((r) =>
    r.json()
  )
  expect(first.id).not.toBe(second.id)
  expect(values.size).toBe(2)
})

it('expires each snapshot 24 hours after creation without extending it on reads or later shares', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-19T00:00:00Z'))
  const first = await post(shared(createEmptyDocument())).then((r) => r.json())
  expect(env.SHARED_DOCUMENTS!.put).toHaveBeenLastCalledWith(
    `share:${first.id}`,
    expect.any(String),
    { expirationTtl: 86400 }
  )
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  expect((await get(first.id)).status).toBe(200)
  const second = await post(shared(createEmptyDocument())).then((r) => r.json())
  vi.setSystemTime(new Date('2026-09-19T23:59:59Z'))
  expect((await get(first.id)).status).toBe(200)
  vi.setSystemTime(new Date('2026-09-20T00:00:00Z'))
  expect((await get(first.id)).status).toBe(404)
  expect((await get(second.id)).status).toBe(200)
  expect(env.SHARED_DOCUMENTS!.put).toHaveBeenCalledTimes(2)
})

it('rejects external image URLs before storing any data', async () => {
  const document = {
    ...createEmptyDocument(),
    assets: {
      image: {
        id: 'image',
        mime: 'image/png',
        data: 'https://tracker.example/pixel',
        width: 1,
        height: 1
      }
    }
  }
  expect((await post(shared(document))).status).toBe(400)
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
  document.assets.image.data = 'data:image/png;base64,YWJj'
  expect((await post(shared(document))).status).toBe(201)
})

it('rejects embedded SVG tracking images before writing to KV', async () => {
  const document = createEmptyDocument()
  document.assets.svg = {
    id: 'svg',
    mime: 'image/svg+xml',
    width: 10,
    height: 10,
    data: `data:image/svg+xml,${encodeURIComponent('<svg><image href="https://tracker.example/pixel"/></svg>')}`
  }
  expect((await post(shared(document))).status).toBe(400)
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
})

it('rejects arbitrary video hosts while accepting provider and same-origin videos', async () => {
  const document = createEmptyDocument()
  document.elements.video = {
    id: 'video',
    type: 'video',
    url: 'https://tracker.example/pixel',
    autoplay: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100
  }
  document.order = ['video']
  const denied = await post(shared(document))
  expect(denied.status).toBe(400)
  expect(await denied.json()).toEqual({ error: 'unsupportedVideo' })
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
  for (const url of [
    'https://youtu.be/M7lc1UVf-VE',
    'https://vimeo.com/76979871',
    `${origin}/video.mp4`
  ]) {
    document.elements.video.url = url
    expect((await post(shared(document))).status).toBe(201)
  }
})

it.each([
  '{',
  'null',
  '[]',
  '{}',
  shared({ ...createEmptyDocument(), version: 999 }),
  shared({ ...createEmptyDocument(), elements: { bad: { type: 'frame', width: -1 } } })
])('rejects malformed JSON or invalid documents before KV: %s', async (body) => {
  expect((await post(body)).status).toBe(400)
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
})

it('rejects non-JSON uploads', async () => {
  expect((await post('{}', { 'Content-Type': 'text/plain' })).status).toBe(415)
})

it.each([{}, { 'Content-Length': '1' }, { 'Content-Length': String(MAX_SHARE_BYTES + 1) }])(
  'rejects oversized UTF-8 bodies regardless of length headers: %j',
  async (headers) => {
    const body = shared({
      ...createEmptyDocument(),
      name: '한'.repeat(Math.floor(MAX_SHARE_BYTES / 3))
    })
    const response = await post(body, { 'Content-Type': 'application/json', ...headers })
    expect(response.status).toBe(413)
    expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
  }
)

it.each(['../x', '', ['a', 'b']])(
  'rejects malformed IDs without reading KV: %j',
  async (shareId) => {
    expect((await get(shareId)).status).toBe(400)
    expect(env.SHARED_DOCUMENTS!.get).not.toHaveBeenCalled()
  }
)

it('returns a non-cacheable missing response', async () => {
  const response = await get()
  expect(response.status).toBe(404)
  expect(response.headers.get('cache-control')).toBe('no-store')
})

it.each(['get', 'put'] as const)(
  'handles KV quota failures on %s without leaking exception details',
  async (method) => {
    vi.mocked(env.SHARED_DOCUMENTS![method]).mockRejectedValue(
      new Error('KV failed: 429 secret details')
    )
    const response = method === 'get' ? await get() : await post(shared(createEmptyDocument()))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(await response.json()).toEqual({ error: 'quota' })
  }
)

it('keeps CORS headers on storage errors so desktop clients can read the error', async () => {
  vi.mocked(env.SHARED_DOCUMENTS!.put).mockRejectedValue(new Error('KV failed: 429'))
  vi.mocked(env.SHARED_DOCUMENTS!.get).mockRejectedValue(new Error('internal'))
  const quota = await fromOrigin('tauri://localhost', 'POST', shared(createEmptyDocument()))
  expect(quota.status).toBe(429)
  expect(quota.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
  const unavailable = await fromOrigin('http://tauri.localhost', 'GET')
  expect(unavailable.status).toBe(503)
  expect(unavailable.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost')
})

it('reports missing bindings and service failures', async () => {
  vi.mocked(env.SHARED_DOCUMENTS!.get).mockRejectedValue(new Error('internal secret'))
  expect((await get()).status).toBe(503)
  env = {}
  expect((await get()).status).toBe(503)
  expect((await post(shared(createEmptyDocument()))).status).toBe(503)
})

it.each([createShare, getShare])(
  'supports Tauri/browser preflights and rejects unsupported methods',
  async (handler) => {
    const preflight = await handler({
      request: new Request(`${origin}/api/share`, {
        method: 'OPTIONS',
        headers: { Origin: 'tauri://localhost', 'Access-Control-Request-Headers': 'content-type' }
      }),
      env: {},
      params: {}
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type')
    expect(preflight.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    const response = await handler({
      request: new Request(`${origin}/api/share`, { method: 'DELETE' }),
      env,
      params: { id }
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('OPTIONS')
  }
)

function fromOrigin(requestOrigin: string, method: string, body?: string) {
  const init: RequestInit = { method, headers: { Origin: requestOrigin } }
  if (body !== undefined) {
    init.headers = { Origin: requestOrigin, 'Content-Type': 'application/json' }
    init.body = body
  }
  const handler = method === 'GET' ? getShare : createShare
  return handler({
    request: new Request(`${origin}/api/share${method === 'GET' ? `/${id}` : ''}`, init),
    env,
    params: { id }
  })
}

it.each([
  origin,
  'tauri://localhost',
  'http://tauri.localhost',
  'http://127.0.0.1:1420',
  'http://localhost:5173',
  'http://[::1]:8788'
])(
  'allows credential-free CORS from the editor, desktop WebViews and loopback: %s',
  async (from) => {
    const preflight = await fromOrigin(from, 'OPTIONS')
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(from)
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()
    expect(preflight.headers.get('vary')).toBe('Origin')
    const created = await fromOrigin(from, 'POST', shared(createEmptyDocument()))
    expect(created.status).toBe(201)
    expect(created.headers.get('access-control-allow-origin')).toBe(from)
    expect((await fromOrigin(from, 'GET')).headers.get('access-control-allow-origin')).toBe(from)
  }
)

it.each([
  'https://attacker.example',
  'null',
  'http://canvas.example',
  'https://canvas.example:8443',
  'https://canvas.example.attacker.example',
  'https://tauri.localhost',
  'tauri://localhost.attacker.example',
  'https://localhost:1420',
  'http://localhost.attacker.example',
  'http://127.0.0.1.attacker.example:1420',
  'http://127.0.0.1:1420/',
  'http://user@localhost:1420'
])('refuses browser requests from other origins before reading or writing KV: %s', async (from) => {
  for (const [method, body] of [
    ['OPTIONS'],
    ['POST', shared(createEmptyDocument())],
    ['GET']
  ] as const) {
    const response = await fromOrigin(from, method, body)
    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(await response.json()).toEqual({ error: 'origin' })
  }
  expect(env.SHARED_DOCUMENTS!.put).not.toHaveBeenCalled()
  expect(env.SHARED_DOCUMENTS!.get).not.toHaveBeenCalled()
})
