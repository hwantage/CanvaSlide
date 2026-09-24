import { hasImageSignature, rasterImageMime } from './image-signature'

const bytes = (binary: string) => Uint8Array.from(binary, (char) => char.charCodeAt(0))
const u32 = (value: number) => String.fromCharCode(0, 0, 0, value)
const ftyp = (major: string, ...compatible: string[]) =>
  `${u32(16 + compatible.length * 4)}ftyp${major}\0\0\0\0${compatible.join('')}`

const samples = {
  'image/png': '\x89PNG\r\n\x1a\n\0\0\0\rIHDR',
  'image/jpeg': '\xff\xd8\xff\xe0\0\x10JFIF',
  'image/gif': 'GIF89a\x01\0\x01\0',
  'image/webp': 'RIFF\x1a\0\0\0WEBPVP8L',
  'image/avif': ftyp('avif', 'mif1', 'miaf'),
  'image/bmp': 'BM\x3a\0\0\0',
  'image/x-icon': '\0\0\x01\0\x01\0'
} as const

it.each(Object.entries(samples))('recognises %s by its leading bytes', (mime, binary) => {
  expect(rasterImageMime(bytes(binary))).toBe(mime)
  expect(hasImageSignature(bytes(binary), mime)).toBe(true)
  expect(hasImageSignature(bytes(binary), mime.toUpperCase())).toBe(true)
})

it('matches every declared type only against its own signature', () => {
  for (const [declared] of Object.entries(samples)) {
    for (const [actual, binary] of Object.entries(samples)) {
      expect(hasImageSignature(bytes(binary), declared)).toBe(declared === actual)
    }
  }
})

it('accepts both GIF versions', () => {
  expect(rasterImageMime(bytes('GIF87a\x01\0\x01\0'))).toBe('image/gif')
})

it('accepts both icon MIME spellings', () => {
  expect(hasImageSignature(bytes(samples['image/x-icon']), 'image/vnd.microsoft.icon')).toBe(true)
})

it('finds AVIF in the compatible brands and ignores brands past the ftyp box', () => {
  expect(rasterImageMime(bytes(ftyp('mif1', 'miaf', 'avif')))).toBe('image/avif')
  expect(rasterImageMime(bytes(ftyp('avis', 'msf1')))).toBe('image/avif')
  expect(rasterImageMime(bytes(`${ftyp('heic', 'mif1')}avif`))).toBeNull()
  expect(rasterImageMime(bytes(ftyp('isom', 'mp41')))).toBeNull()
})

it('ignores brands in a box too small to hold them', () => {
  expect(rasterImageMime(bytes(`${u32(8)}ftypavif\0\0\0\0mif1`))).toBeNull()
  expect(rasterImageMime(bytes(`${u32(12)}ftypavif\0\0\0\0`))).toBeNull()
})

it('reads brands only within the signature window even when the box claims to be larger', () => {
  const huge = `\xff\xff\xff\xffftypisom\0\0\0\0${'mp41'.repeat(30)}avif`
  expect(rasterImageMime(bytes(huge))).toBeNull()
})

it.each([
  '',
  'abc',
  '\x89PNG',
  '\x89PNG\r\n\x1a',
  '\xff\xd8',
  'GIF8',
  'GIF90a',
  'RIFF\0\0\0\0WAVE',
  '\0\0\0\0\0\0\0\0WEBP',
  '\0\0\x02\0',
  '<svg xmlns="http://www.w3.org/2000/svg"/>',
  '%PDF-1.7'
])('rejects data without a complete raster signature: %j', (binary) => {
  expect(rasterImageMime(bytes(binary))).toBeNull()
  expect(hasImageSignature(bytes(binary), 'image/png')).toBe(false)
})

it('reads signatures from a view into a larger buffer', () => {
  const buffer = bytes(`xxxx${samples['image/avif']}`)
  expect(rasterImageMime(buffer.subarray(4))).toBe('image/avif')
})
