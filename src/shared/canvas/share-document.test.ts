import { createEmptyDocument } from './element-types'
import { hasOnlyEmbeddedImages } from './share-document'

function withImage(data: string, mime = 'image/png') {
  return {
    ...createEmptyDocument(),
    assets: { image: { id: 'image', data, mime, width: 1, height: 1 } }
  }
}

it('accepts documents without images', () => {
  expect(hasOnlyEmbeddedImages(createEmptyDocument())).toBe(true)
})

it.each(['png', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'x-icon', 'vnd.microsoft.icon', 'svg+xml'])(
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
