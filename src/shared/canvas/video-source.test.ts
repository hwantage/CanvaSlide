import { describe, expect, it } from 'vitest'
import { parseVideoSource, videoEmbedUrl } from './video-source'
import { createEmptyDocument, videoElementSchema } from './element-types'
import { parseDocument, serializeDocument } from './document-file'
import {
  buildClipboardPayload,
  parseClipboardPayload,
  pasteClipboardPayload
} from './clipboard-payload'

describe('linked video sources', () => {
  it.each([
    'https://youtu.be/M7lc1UVf-VE?t=1m2s',
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=62',
    'https://m.youtube.com/shorts/M7lc1UVf-VE?start=62',
    'https://youtube.com/live/M7lc1UVf-VE#t=62s',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=62'
  ])('normalizes a YouTube share URL: %s', (url) => {
    expect(parseVideoSource(url)).toEqual({
      provider: 'youtube',
      id: 'M7lc1UVf-VE',
      start: 62,
      url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=62s'
    })
  })
  it.each([
    'https://vimeo.com/76979871/abc123#t=12s',
    'https://player.vimeo.com/video/76979871?h=abc123#t=12s'
  ])('preserves Vimeo unlisted access and start time: %s', (url) => {
    const source = parseVideoSource(url)!
    expect(source).toMatchObject({ provider: 'vimeo', id: '76979871', hash: 'abc123', start: 12 })
    const embed = new URL(videoEmbedUrl(source, true, 'https://app.example'))
    expect(embed.searchParams.get('h')).toBe('abc123')
    expect(embed.searchParams.get('muted')).toBe('1')
    expect(embed.hash).toBe('#t=12s')
  })
  it('keeps signed direct URLs byte for byte without probing the network', () => {
    const url = 'https://cdn.example/Film.MP4?token=ab%2fCD+ef&expires=123#t=4'
    expect(parseVideoSource(`  ${url}\n`)).toEqual({ provider: 'direct', url, start: 0 })
    expect(parseVideoSource('http://localhost:3000/movie.webm?x=1')?.provider).toBe('direct')
    expect(parseVideoSource('https://cdn.example/signed-download?id=42')).toBeNull()
    expect(parseVideoSource('https://cdn.example/signed-download?id=42', true)?.provider).toBe(
      'direct'
    )
  })
  it.each([
    'javascript:alert(1)',
    'data:video/mp4;base64,AAAA',
    'file:///clip.mp4',
    'blob:https://a/b',
    'ftp://host/a.mp4',
    'https://user:secret@host/a.mp4',
    '<iframe src="https://youtube.com"></iframe>',
    'hello https://youtu.be/M7lc1UVf-VE',
    'https://youtube.com/watch?v=bad',
    'https://vimeo.com/settings',
    'https://youtu.be:8080/M7lc1UVf-VE'
  ])('rejects unsafe or malformed URL: %s', (url) => {
    expect(parseVideoSource(url, true)).toBeNull()
    expect(
      videoElementSchema.safeParse({
        id: 'v',
        type: 'video',
        url,
        x: 0,
        y: 0,
        width: 640,
        height: 360
      }).success
    ).toBe(false)
  })
  it('does not turn ordinary URLs, provider lookalikes or multi-line text into videos', () => {
    for (const url of [
      'https://example.org/',
      'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE',
      'https://youtu.be/M7lc1UVf-VE\nsecond line'
    ]) {
      expect(parseVideoSource(url)).toBeNull()
    }
  })
  it('round-trips links and geometry through documents and object clipboard without media assets', () => {
    const document = createEmptyDocument()
    document.elements.v = {
      id: 'v',
      type: 'video',
      url: 'https://cdn.example/movie.mp4?signature=abc',
      autoplay: false,
      x: 12,
      y: 34,
      width: 640,
      height: 396
    }
    document.order = ['v']
    expect(parseDocument(serializeDocument(document))).toEqual({ ok: true, document })
    const payload = parseClipboardPayload(JSON.stringify(buildClipboardPayload(document, ['v'])))!
    const pasted = pasteClipboardPayload(createEmptyDocument(), payload, () => 'copy', {
      x: 24,
      y: 24
    }).document
    expect(pasted.elements.copy).toEqual({ ...document.elements.v, id: 'copy', x: 36, y: 58 })
    expect(pasted.assets).toEqual({})
    expect(serializeDocument(pasted)).not.toContain('data:video')
    expect(parseDocument(serializeDocument(createEmptyDocument())).ok).toBe(true)
  })
})
