import { createEmptyDocument } from './element-types'
import { hasAllowedShareVideos, hasOnlyEmbeddedImages } from './share-document'

function withImage(data: string, mime = 'image/png') {
  return {
    ...createEmptyDocument(),
    assets: { image: { id: 'image', data, mime, width: 1, height: 1 } }
  }
}

it('accepts documents without images', () => {
  expect(hasOnlyEmbeddedImages(createEmptyDocument())).toBe(true)
})

it.each(['png', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'x-icon', 'vnd.microsoft.icon'])(
  'accepts embedded base64 image/%s assets',
  (subtype) => {
    const mime = `image/${subtype}`
    expect(hasOnlyEmbeddedImages(withImage(`data:${mime};base64,YWJjZA==`, mime))).toBe(true)
  }
)

it('accepts URI-encoded SVG and case-insensitive MIME headers', () => {
  expect(
    hasOnlyEmbeddedImages(
      withImage('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E', 'image/svg+xml')
    )
  ).toBe(true)
  expect(hasOnlyEmbeddedImages(withImage('data:IMAGE/PNG;base64,YWJj'))).toBe(true)
})

it.each([
  'https://tracker.example/pixel',
  '//tracker.example/pixel',
  '/api/tracker',
  'file:///tmp/image.png',
  'blob:https://canvas.example/asset',
  'javascript:alert(1)',
  'data:text/html;base64,YWJj',
  'data:image/jpeg;base64,YWJj',
  ' data:image/png;base64,YWJj',
  'data:image/png;base64,',
  'data:image/png;base64,%%%%',
  'data:image/png;base64,Y',
  'data:image/png;url=https://tracker.example,YWJj',
  'data:image/png,https://tracker.example/pixel'
])('rejects non-embedded, mismatched, or malformed images: %s', (data) => {
  expect(hasOnlyEmbeddedImages(withImage(data))).toBe(false)
})

it('checks unused assets too so a later edit cannot reveal a tracking image', () => {
  const document = withImage('data:image/png;base64,YWJj')
  document.assets.image.data = 'https://tracker.example/unused'
  expect(document.order).toEqual([])
  expect(hasOnlyEmbeddedImages(document)).toBe(false)
})

const svgData = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`
const withSvg = (svg: string) => withImage(svgData(svg), 'image/svg+xml')

it.each(['href', 'xlink:href', 'alias:href'])(
  'rejects nested external SVG images through %s, including encoded XML characters',
  (attribute) => {
    for (const url of [
      'https://tracker.example/pixel',
      '//tracker.example/pixel',
      '/pixel',
      'https&#58;//tracker.example/pixel'
    ]) {
      const svg = `<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:alias="http://www.w3.org/1999/xlink"><image ${attribute}="${url}"/></svg>`
      expect(hasOnlyEmbeddedImages(withSvg(svg))).toBe(false)
      expect(
        hasOnlyEmbeddedImages(withImage(`data:image/svg+xml;base64,${btoa(svg)}`, 'image/svg+xml'))
      ).toBe(false)
    }
  }
)

it('accepts embedded SVG photos, local references, comments, and UTF-8 text', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><!-- href="https://example.com" --><defs><path id="p"/></defs><use href="#p"/><text>공유</text><image href="data:image/png;base64,YWJj"/></svg>'
  expect(hasOnlyEmbeddedImages(withSvg(svg))).toBe(true)
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(svg)))
  expect(
    hasOnlyEmbeddedImages(withImage(`data:image/svg+xml;base64,${encoded}`, 'image/svg+xml'))
  ).toBe(true)
})

it('inspects recursively embedded SVGs without losing the image MIME type', () => {
  const safe = '<svg><image href="data:image/png;base64,YWJj"/></svg>'
  const unsafe = '<svg><image href="https://tracker.example/pixel"/></svg>'
  const wrap = (svg: string) => `<svg><image href="${svgData(svg)}"/></svg>`
  expect(hasOnlyEmbeddedImages(withSvg(wrap(wrap(safe))))).toBe(true)
  expect(hasOnlyEmbeddedImages(withSvg(wrap(wrap(unsafe))))).toBe(false)
  let nested = safe
  for (let i = 0; i < 10; i++) {
    nested = wrap(nested)
  }
  expect(hasOnlyEmbeddedImages(withSvg(nested))).toBe(false)
})

it.each([
  '<svg><feImage href="https://tracker.example/filter"/></svg>',
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image href="data:image/png;base64,YWJj" xlink:href="https://tracker.example/pixel"/></svg>',
  '<!DOCTYPE svg [<!ENTITY photo "https://tracker.example/pixel">]><svg><image href="&photo;"/></svg>',
  '<?xml-stylesheet href="https://tracker.example/style.css"?><svg/>',
  '<svg xml:base="https://tracker.example/"><image href="#pixel"/></svg>',
  '<svg><image href="&unknown;"/></svg>',
  '<svg><image href="https://tracker.example/pixel"></svg>',
  '<svg/><svg/>',
  '<html/>',
  '<svg xmlns="http://example.com/foreign"/>',
  'not XML'
])('rejects ambiguous, external, or malformed SVG content: %s', (svg) => {
  expect(hasOnlyEmbeddedImages(withSvg(svg))).toBe(false)
})

it.each(['data:image/svg+xml,%ZZ', 'data:image/svg+xml;base64,/w=='])(
  'rejects invalid SVG encodings: %s',
  (data) => {
    expect(hasOnlyEmbeddedImages(withImage(data, 'image/svg+xml'))).toBe(false)
  }
)

function withVideo(url: string) {
  const document = createEmptyDocument()
  document.elements.video = {
    id: 'video',
    type: 'video',
    url,
    autoplay: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100
  }
  document.order = ['video']
  return document
}

it.each([
  'https://youtu.be/M7lc1UVf-VE',
  'https://vimeo.com/76979871',
  'https://canvas.example/clip.mp4',
  'https://canvas.example:443/video?token=123'
])('allows approved shared video sources: %s', (url) => {
  expect(hasAllowedShareVideos(withVideo(url), 'https://canvas.example')).toBe(true)
})

it.each([
  'https://tracker.example/pixel',
  'http://127.0.0.1/private',
  'http://canvas.example/video',
  'https://canvas.example:444/video',
  'https://canvas.example.attacker.com/video',
  'https://user@canvas.example/video',
  'https://youtube.com.attacker.com/video',
  'javascript:alert(1)',
  'file:///clip.mp4'
])('rejects arbitrary shared video origins or unsafe URLs: %s', (url) => {
  expect(hasAllowedShareVideos(withVideo(url), 'https://canvas.example')).toBe(false)
})
