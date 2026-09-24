// @vitest-environment node
import {
  CloudShareError,
  isShareId,
  MAX_SHARE_BYTES,
  readShareBody,
  shareIdFromSearch,
  unwrapShareSnapshot
} from './cloud-share'

const id = 'abcdefghijklmnopqr_-1'

describe('stored sharing access', () => {
  it('preserves explicit access', () => {
    const document = { version: 2 }
    expect(unwrapShareSnapshot({ access: 'present', document })).toEqual({
      access: 'present',
      document
    })
  })

  it.each([
    { version: 2 },
    null,
    'document',
    { access: 'owner', document: {} },
    { access: 'present' },
    { document: {} },
    { access: null, document: {} },
    { version: 2, access: 'invalid' }
  ])('rejects a snapshot without valid access metadata: %j', (value) => {
    expect(() => unwrapShareSnapshot(value)).toThrow('invalid')
  })
})

describe('share link parsing', () => {
  it('reads one ID without treating unrelated parameters as shares', () => {
    expect(shareIdFromSearch('?lang=ko')).toBeNull()
    expect(shareIdFromSearch(`?lang=ko&share=${id}`)).toBe(id)
    expect(isShareId(id)).toBe(true)
  })

  it.each([
    '?share=',
    '?share=../secret',
    '?share=%2F'.padEnd(40, 'a'),
    `?share=${id}&share=${id}`,
    '?share=short'
  ])('rejects malformed or ambiguous links: %s', (search) => {
    expect(() => shareIdFromSearch(search)).toThrow(CloudShareError)
  })
})

describe('bounded share body', () => {
  it('allows the exact byte limit', async () => {
    const text = 'a'.repeat(MAX_SHARE_BYTES)
    await expect(readShareBody(new Response(text))).resolves.toBe(text)
  })

  it('rejects oversized content-length before reading the body', async () => {
    const response = new Response('', {
      headers: { 'Content-Length': String(MAX_SHARE_BYTES + 1) }
    })
    await expect(readShareBody(response)).rejects.toMatchObject({ code: 'tooLarge' })
    expect(response.bodyUsed).toBe(false)
  })

  it('counts UTF-8 bytes without a trustworthy content-length and cancels the stream', async () => {
    const cancel = vi.fn()
    const chunk = new TextEncoder().encode('한'.repeat(Math.floor(MAX_SHARE_BYTES / 3) + 1))
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk)
        },
        cancel
      }),
      { headers: { 'Content-Length': '1' } }
    )
    await expect(readShareBody(response)).rejects.toMatchObject({ code: 'tooLarge' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('decodes a multibyte character split across chunks', async () => {
    const bytes = new TextEncoder().encode('한')
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 1))
          controller.enqueue(bytes.slice(1))
          controller.close()
        }
      })
    )
    await expect(readShareBody(response)).resolves.toBe('한')
  })
})
