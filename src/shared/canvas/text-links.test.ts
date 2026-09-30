import { describe, expect, it } from 'vitest'
import {
  isWebLink,
  MAX_WEB_LINK_LENGTH,
  mayHaveTextLinks,
  normalizeWebLink,
  textElementSegments,
  textLinkSegments
} from './text-links'

const links = (text: string) => textLinkSegments(text).flatMap((segment) => segment.url ?? [])

describe('isWebLink', () => {
  it('accepts absolute http and https URLs with a host', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/a?b=c#d',
      'https://[::1]:8080/'
    ]) {
      expect(isWebLink(url), url).toBe(true)
    }
  })

  it('rejects other schemes, relative and hostless URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<p>',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'ftp://example.com',
      'blob:https://example.com/id',
      '//example.com',
      '/path',
      'example.com',
      'https://',
      '',
      // `new URL` would drop these, so the stored text would differ from the page it opens.
      ' https://example.com',
      'https://example.com\t',
      '\u0000https://example.com',
      'https://example.com/a\u007fb',
      'https://example.com/a b'
    ]) {
      expect(isWebLink(url), url).toBe(false)
    }
  })

  it('rejects links longer than the stored limit', () => {
    const url = 'https://example.com/'
    expect(isWebLink(url + 'a'.repeat(MAX_WEB_LINK_LENGTH - url.length))).toBe(true)
    expect(isWebLink(url + 'a'.repeat(MAX_WEB_LINK_LENGTH - url.length + 1))).toBe(false)
  })
})

describe('normalizeWebLink', () => {
  it('adds https to a typed address without a scheme', () => {
    expect(normalizeWebLink('example.com')).toBe('https://example.com/')
    expect(normalizeWebLink('  example.com/docs?q=1 ')).toBe('https://example.com/docs?q=1')
    expect(normalizeWebLink('localhost:3000/demo')).toBe('https://localhost:3000/demo')
  })

  it('keeps http and https addresses', () => {
    expect(normalizeWebLink('http://example.com/a')).toBe('http://example.com/a')
    expect(normalizeWebLink('HTTPS://Example.com')).toBe('https://example.com/')
  })

  it('refuses other schemes, spaces and empty input', () => {
    for (const input of [
      '',
      '   ',
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'data:text/plain,hi',
      'file:///tmp/a',
      'example .com',
      'example\u3000.com',
      'example.com/a\u00a0b',
      'https://'
    ]) {
      expect(normalizeWebLink(input), input).toBeNull()
    }
  })

  it('refuses a typed address that percent-encoding makes longer than the stored limit', () => {
    const typed = `example.com/${'서'.repeat(300)}`
    expect(typed.length).toBeLessThan(MAX_WEB_LINK_LENGTH)
    expect(normalizeWebLink(typed)).toBeNull()
  })

  it('always returns a link the schema accepts', () => {
    for (const input of ['example.com', 'http://a.b', 'localhost:1', 'https://[::1]/x']) {
      const link = normalizeWebLink(input)
      expect(link !== null && isWebLink(link), input).toBe(true)
    }
  })
})

describe('textLinkSegments', () => {
  it('splits text into plain runs and URLs that reassemble the text', () => {
    const text = 'Docs: https://example.com/docs and http://a.b/c?d=e#f\nend'
    const segments = textLinkSegments(text)
    expect(segments).toEqual([
      { text: 'Docs: ' },
      { text: 'https://example.com/docs', url: 'https://example.com/docs' },
      { text: ' and ' },
      { text: 'http://a.b/c?d=e#f', url: 'http://a.b/c?d=e#f' },
      { text: '\nend' }
    ])
    expect(segments.map((segment) => segment.text).join('')).toBe(text)
  })

  it('returns plain text unchanged and nothing for empty text', () => {
    expect(textLinkSegments('no links here')).toEqual([{ text: 'no links here' }])
    expect(textLinkSegments('')).toEqual([])
  })

  it('leaves sentence punctuation and unmatched brackets outside the URL', () => {
    expect(links('See https://example.com.')).toEqual(['https://example.com'])
    expect(links('(see https://example.com/a)')).toEqual(['https://example.com/a'])
    expect(links('"https://example.com/q?x=1",')).toEqual(['https://example.com/q?x=1'])
    expect(links('Go https://example.com/a!?')).toEqual(['https://example.com/a'])
    expect(links('[https://example.com]')).toEqual(['https://example.com'])
    expect(links('`https://example.com`')).toEqual(['https://example.com'])
    expect(links('<https://example.com/>')).toEqual(['https://example.com/'])
    expect(links("'https://example.com'")).toEqual(['https://example.com'])
    expect(links('**https://example.com/x**, ~~https://example.com/y~~')).toEqual([
      'https://example.com/x',
      'https://example.com/y'
    ])
    expect(links('{https://example.com}')).toEqual(['https://example.com'])
  })

  it('scans long runs without spaces in linear time', () => {
    for (const [text, count] of [
      [`https://a.b/${')'.repeat(200_000)}`, 1],
      ['http://a.com/가'.repeat(20_000), 20_000],
      ['http://a.com/b/가'.repeat(20_000), 0],
      ['詳細はhttps://example.com/を参照してください。'.repeat(4_000), 4_000]
    ] as const) {
      const started = performance.now()
      expect(links(text)).toHaveLength(count)
      expect(performance.now() - started, text.slice(0, 20)).toBeLessThan(1000)
    }
  })

  it('keeps balanced brackets inside a URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Mercury_(planet).')).toEqual([
      'https://en.wikipedia.org/wiki/Mercury_(planet)'
    ])
  })

  it('ends a URL at a particle or sentence in another script written right after it', () => {
    expect(links('https://example.com에서 확인')).toEqual(['https://example.com'])
    expect(links('자료:https://example.com/a입니다')).toEqual(['https://example.com/a'])
    expect(links('자세한 내용은 https://github.com/에서 확인하세요.')).toEqual([
      'https://github.com/'
    ])
    expect(links('詳細はhttps://example.com/を参照してください。')).toEqual([
      'https://example.com/'
    ])
    expect(links('“https://a.com/” 「https://b.com/」 https://c.com/…')).toEqual([
      'https://a.com/',
      'https://b.com/',
      'https://c.com/'
    ])
  })

  it('lets a segmented path, a query or a fragment go on in another script', () => {
    expect(links('详情见https://example.com/docs/页面，谢谢。')).toEqual([
      'https://example.com/docs/页面'
    ])
    expect(links('https://a.com/search?query=서울&x=1 검색')).toEqual([
      'https://a.com/search?query=서울&x=1'
    ])
    expect(links('https://a.com/#한글')).toEqual(['https://a.com/#한글'])
    expect(links('https://ko.wikipedia.org/wiki/서울 참고')).toEqual([
      'https://ko.wikipedia.org/wiki/서울'
    ])
    expect(links('(https://ko.wikipedia.org/wiki/서울).')).toEqual([
      'https://ko.wikipedia.org/wiki/서울'
    ])
    expect(links('https://example.com/%EC%84%9C%EC%9A%B8')).toEqual([
      'https://example.com/%EC%84%9C%EC%9A%B8'
    ])
  })

  it('links only http and https inside words that start there', () => {
    expect(links('javascript:alert(1) ftp://a.b mailto:a@b.c')).toEqual([])
    expect(links('xhttps://example.com')).toEqual([])
    expect(links('HTTPS://EXAMPLE.COM')).toEqual(['HTTPS://EXAMPLE.COM'])
  })

  it('links nothing for a host cut by another script, rather than a different host', () => {
    expect(links('https://news.네이버.com 참고')).toEqual([])
    expect(links('https://www.한국.kr/intro')).toEqual([])
  })

  it('never scans text a continued URL took in, so the runs still rebuild the text', () => {
    for (const text of ['https://a.b/서https://c.d', 'https://x.org/wiki/서울https://c.d']) {
      const segments = textLinkSegments(text)
      expect(segments.map((segment) => segment.text).join(''), text).toBe(text)
    }
    expect(links('https://a.b/서https://c.d')).toEqual(['https://a.b/', 'https://c.d'])
    expect(links('https://x.org/wiki/서울https://c.d')).toEqual([
      'https://x.org/wiki/서울https://c.d'
    ])
  })

  it('skips a scheme without a host', () => {
    expect(textLinkSegments('https:// and https://.')).toEqual([{ text: 'https:// and https://.' }])
  })
})

describe('textElementSegments', () => {
  it("draws an element's own link over its whole text, and nothing for empty text", () => {
    expect(textElementSegments('Open https://inner.example', 'https://example.com/')).toEqual([
      { text: 'Open https://inner.example', url: 'https://example.com/' }
    ])
    expect(textElementSegments('', 'https://example.com/')).toEqual([])
  })
})

describe('mayHaveTextLinks', () => {
  it('holds whenever the text could draw a link', () => {
    expect(mayHaveTextLinks('plain', undefined)).toBe(false)
    expect(mayHaveTextLinks('plain', 'https://example.com/')).toBe(true)
    for (const text of ['see https://a.b', 'HTTP://A.B', 'x http:// y']) {
      expect(mayHaveTextLinks(text, undefined), text).toBe(true)
    }
    const samples = ['a https://b.c', 'http://x.y/가', '없음', 'https://news.네이버.com']
    for (const text of samples) {
      if (textLinkSegments(text).some((segment) => segment.url !== undefined)) {
        expect(mayHaveTextLinks(text, undefined), text).toBe(true)
      }
    }
  })
})
