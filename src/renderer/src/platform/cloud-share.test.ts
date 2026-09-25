import { createEmptyDocument } from '@shared/canvas/element-types'
import { MAX_SHARE_BYTES } from '@shared/cloud-share'
import {
  cloudShareOrigin,
  copyShareLink,
  createCloudShare,
  fetchCloudShare,
  HOSTED_SHARE_ORIGIN,
  usesHostedShareService
} from './cloud-share'

vi.mock('./tauri-runtime', () => ({ isTauriRuntime: vi.fn(() => false) }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))
import { isTauriRuntime } from './tauri-runtime'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const id = 'abcdefghijklmnopqr_-1'
const origin = 'https://canvas.example'
const signal = () => new AbortController().signal

beforeEach(() => {
  vi.stubEnv('VITE_CLOUD_SHARE_URL', origin)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.mocked(isTauriRuntime).mockReturnValue(false)
  vi.useRealTimers()
})

it('uses the browser origin or the configured desktop service', () => {
  expect(cloudShareOrigin('', false, origin)).toBe(origin)
  expect(cloudShareOrigin(origin, true, 'tauri://localhost')).toBe(origin)
  expect(cloudShareOrigin('http://127.0.0.1:8788', true)).toBe('http://127.0.0.1:8788')
  expect(() => cloudShareOrigin('', true)).toThrow('unavailable')
})

it("recognizes only the maintainers' hosted service, whether configured or same-origin", () => {
  expect(usesHostedShareService(HOSTED_SHARE_ORIGIN, true, 'tauri://localhost')).toBe(true)
  expect(usesHostedShareService(`${HOSTED_SHARE_ORIGIN}/`, true, 'http://tauri.localhost')).toBe(
    true
  )
  expect(usesHostedShareService('', false, HOSTED_SHARE_ORIGIN)).toBe(true)
  expect(usesHostedShareService('', false, 'https://branch.canvaslide.pages.dev')).toBe(false)
  expect(usesHostedShareService(origin, false, HOSTED_SHARE_ORIGIN)).toBe(false)
  expect(usesHostedShareService('http://localhost:8788', true)).toBe(false)
  expect(usesHostedShareService(`${HOSTED_SHARE_ORIGIN}/path`, true)).toBe(false)
  expect(usesHostedShareService('', true)).toBe(false)
})

it.each([
  'http://example.com',
  'file:///tmp/x',
  'https://a.example/path',
  'https://user:pass@a.example',
  'https://a.example?x=1',
  'https://a.example/#fragment'
])('rejects unusable service URLs: %s', (url) => {
  expect(() => cloudShareOrigin(url)).toThrow('unavailable')
})

it('uploads the snapshot without credentials and builds the link from the trusted origin', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ id, url: 'https://foreign.example/' }))
  await expect(createCloudShare(createEmptyDocument(), signal())).resolves.toBe(
    `${origin}/?share=${id}`
  )
  expect(fetch).toHaveBeenCalledWith(
    `${origin}/api/share`,
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      body: JSON.stringify({ access: 'edit', document: createEmptyDocument() })
    })
  )
})

it('rejects oversized uploads before making a network request', async () => {
  await expect(
    createCloudShare({ ...createEmptyDocument(), name: 'a'.repeat(MAX_SHARE_BYTES) }, signal())
  ).rejects.toMatchObject({ code: 'tooLarge' })
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  [429, 'quota'],
  [413, 'tooLarge'],
  [404, 'missing'],
  [400, 'invalid'],
  [503, 'unavailable']
] as const)('maps status %i to %s even when the service returns HTML', async (status, code) => {
  vi.mocked(fetch).mockResolvedValue(new Response('<h1>Error</h1>', { status }))
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code })
})

it('rejects a static SPA fallback instead of treating it as a document', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })
  )
  await expect(createCloudShare(createEmptyDocument(), signal())).rejects.toMatchObject({
    code: 'unavailable'
  })
})

it('validates both returned IDs and downloaded documents', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ id: '../wrong' }))
  await expect(createCloudShare(createEmptyDocument(), signal())).rejects.toMatchObject({
    code: 'invalid'
  })
  vi.mocked(fetch).mockResolvedValue(Response.json({ access: 'edit', document: { version: 999 } }))
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'invalid' })
  vi.mocked(fetch).mockResolvedValue(Response.json(createEmptyDocument()))
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'invalid' })
})

it('validates and repairs the downloaded snapshot', async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ access: 'edit', document: { ...createEmptyDocument(), order: ['missing'] } })
  )
  await expect(fetchCloudShare(id, signal())).resolves.toEqual({
    access: 'edit',
    document: createEmptyDocument()
  })
})

it('round trips presentation access and rejects a presentation without frames', async () => {
  const document = createEmptyDocument()
  await expect(createCloudShare(document, signal(), 'present')).rejects.toMatchObject({
    code: 'noFrames'
  })
  expect(fetch).not.toHaveBeenCalled()
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
  vi.mocked(fetch).mockResolvedValue(Response.json({ id }))
  await createCloudShare(document, signal(), 'present')
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).toEqual({
    access: 'present',
    document
  })
  vi.mocked(fetch).mockResolvedValue(Response.json({ access: 'present', document }))
  await expect(fetchCloudShare(id, signal())).resolves.toEqual({ access: 'present', document })
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ access: 'present', document: { ...document, order: ['missing'] } })
  )
  await expect(fetchCloudShare(id, signal())).resolves.toEqual({ access: 'present', document })
})

it('rejects malformed access metadata instead of downgrading a shared document to editing', async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ access: 'unknown', document: createEmptyDocument() })
  )
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'invalid' })
})

it.each([
  ['image/png', 'https://tracker.example/pixel'],
  [
    'image/svg+xml',
    `data:image/svg+xml,${encodeURIComponent('<svg><image href="https://tracker.example/pixel"/></svg>')}`
  ]
])(
  'rejects external images in %s before uploading or loading a shared document',
  async (mime, data) => {
    const document = {
      ...createEmptyDocument(),
      assets: {
        image: {
          id: 'image',
          mime,
          data,
          width: 1,
          height: 1
        }
      }
    }
    await expect(createCloudShare(document, signal())).rejects.toMatchObject({ code: 'invalid' })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValue(Response.json({ access: 'edit', document }))
    await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'invalid' })
  }
)

it('rejects unapproved videos before upload and after download', async () => {
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
  await expect(createCloudShare(document, signal())).rejects.toMatchObject({
    code: 'unsupportedVideo'
  })
  expect(fetch).not.toHaveBeenCalled()
  vi.mocked(fetch).mockResolvedValue(Response.json({ access: 'edit', document }))
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'unsupportedVideo' })
})

it('rejects a bad ID without issuing a request', async () => {
  await expect(fetchCloudShare('../bad', signal())).rejects.toMatchObject({ code: 'invalid' })
  expect(fetch).not.toHaveBeenCalled()
})

it('reports offline requests and times out hung requests', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'network' })
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
      })
  )
  const assertion = expect(fetchCloudShare(id, signal())).rejects.toMatchObject({ code: 'network' })
  await vi.advanceTimersByTimeAsync(30_000)
  await assertion
})

it('copies through the native clipboard on desktop', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  await copyShareLink(`${origin}/?share=${id}`)
  expect(writeText).toHaveBeenCalledWith(`${origin}/?share=${id}`)
})

it('starts a browser clipboard write during the click, before link creation resolves', async () => {
  const items: Record<string, Promise<Blob>>[] = []
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(data: Record<string, Promise<Blob>>) {
        items.push(data)
      }
    }
  )
  const write = vi.spyOn(navigator.clipboard, 'write').mockImplementation(async () => {
    await items[0]!['text/plain']
  })
  let finish!: (url: string) => void
  const url = new Promise<string>((resolve) => {
    finish = resolve
  })
  const copying = copyShareLink(url)
  expect(write).toHaveBeenCalledTimes(1)
  finish(`${origin}/?share=${id}`)
  await copying
  expect(await (await items[0]!['text/plain'])!.text()).toBe(`${origin}/?share=${id}`)
})

it('does not leave an unhandled item rejection when clipboard denial precedes a cancelled upload', async () => {
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(_data: Record<string, Promise<Blob>>) {}
    }
  )
  vi.spyOn(navigator.clipboard, 'write').mockRejectedValue(new Error('denied'))
  let finish!: (url: null) => void
  const url = new Promise<null>((resolve) => {
    finish = resolve
  })
  await expect(copyShareLink(url)).rejects.toThrow('denied')
  finish(null)
  await new Promise((resolve) => setTimeout(resolve, 0))
})

it('does not copy a cancelled or failed share on desktop', async () => {
  vi.mocked(isTauriRuntime).mockReturnValue(true)
  await expect(copyShareLink(Promise.resolve(null))).rejects.toThrow('cancelled or failed')
  expect(writeText).not.toHaveBeenCalled()
})
