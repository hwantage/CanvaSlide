import { parseDocumentFile, serializeDocument } from '@shared/canvas/document-file'
import { createEmptyDocument } from '@shared/canvas/element-types'
import { fetchExampleDocument } from './example-document'

vi.mock('@/lib/document-file-codec', () => ({
  decodeDocumentFile: vi.fn(async (bytes: Uint8Array) => parseDocumentFile(bytes))
}))
vi.mock('@shared/example-catalog', async (original) => ({
  ...(await original<object>()),
  MAX_EXAMPLE_BYTES: 8192
}))
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => vi.stubGlobal('fetch', fetchMock.mockReset()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('fetches only the known same-origin asset and uses the file parser', async () => {
  const document = { ...createEmptyDocument(), name: 'From server' }
  fetchMock.mockResolvedValue(new Response(serializeDocument(document)))
  expect(await fetchExampleDocument('flowchart', new AbortController().signal)).toMatchObject(
    document
  )
  expect(fetchMock).toHaveBeenCalledWith(
    '/examples/flowchart.canvaslide',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' })
  )
})

it.each([
  '',
  '../secret',
  '/etc/passwd',
  'https://example.org/test',
  'constructor',
  'toString',
  'FLOWCHART',
  '%2e%2e'
])('does not fetch unrecognized ID %s', async (id) => {
  await expect(fetchExampleDocument(id, new AbortController().signal)).rejects.toMatchObject({
    code: 'unknown'
  })
  expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
  [404, '{}', 'missing'],
  [503, '{}', 'network'],
  [200, '<html>SPA fallback</html>', 'invalid'],
  [200, '{"version":2}', 'invalid'],
  [200, '{}', 'invalid']
] as const)('reports status %s and content %s as %s', async (status, body, code) => {
  fetchMock.mockResolvedValue(new Response(body, { status }))
  await expect(
    fetchExampleDocument('flowchart', new AbortController().signal)
  ).rejects.toMatchObject({ code })
})

it('reports an offline request', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(
    fetchExampleDocument('flowchart', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'network' })
})

it.each([false, true])(
  'bounds oversized downloads with a content-length header: %s',
  async (header) => {
    fetchMock.mockResolvedValue(
      new Response('x'.repeat(8193), {
        headers: header ? { 'Content-Length': '8193' } : {}
      })
    )
    await expect(
      fetchExampleDocument('flowchart', new AbortController().signal)
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  }
)

it('times out a stalled download', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Abort', 'AbortError'))
        )
      })
  )
  const result = expect(
    fetchExampleDocument('flowchart', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'network' })
  await vi.advanceTimersByTimeAsync(30_000)
  await result
})
