import { describe, expect, it } from 'vitest'
import { isStaticWebp } from './webp-container'

const lossless = atob('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAEAdQy8oUuYCBiOh/AAA=')
const lossy = atob(
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+rhf/M0M8lHlw/9NI8aR40j5TQAAA'
)
const extended = atob(
  'UklGRloAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAgICAgABWUDggLgAAANABAJ0BKgIAAgABQCYloAJ0ugH4AAOwAP6uF/8zQzyUeXD/00jxpHjSPlNAAAA='
)
const animated = atob(
  'UklGRtAAAABXRUJQVlA4WAoAAAASAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GVAAAAAAAAAAAAAEAAAEAAGQAAAJBTFBIBQAAAACAgICAAFZQOCAuAAAAMAEAnQEqAgACAAFAJiWgAANwAP6uF//+Zo/7zf95vav//9NI//ppH/9NI+U0AEFOTUZIAAAAAAAAAAAAAQAAAQAAZAAAAFZQOCAwAAAANAEAnQEqAgACAAAAJiWgAANwAP7E7///Ngf+Qf/IPv9//+k2f/0mz/+k2fHMAAAA'
)

function u32(value: number): string {
  return String.fromCharCode(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24)
}

function chunk(type: string, data: string): string {
  return type + u32(data.length) + data + (data.length % 2 ? '\0' : '')
}

function riff(chunks: string): string {
  return `RIFF${u32(chunks.length + 4)}WEBP${chunks}`
}

function replace(data: string, offset: number, replacement: string): string {
  return data.slice(0, offset) + replacement + data.slice(offset + replacement.length)
}

const vp8x = (flags = 0) => chunk('VP8X', `${String.fromCharCode(flags)}\0\0\0\x01\0\0\x01\0\0`)

describe('static WebP container recognition', () => {
  it.each([
    ['VP8', lossy],
    ['VP8L', lossless],
    ['VP8X with alpha', extended]
  ])('accepts a real %s image', (_, data) => {
    expect(isStaticWebp(data!)).toBe(true)
  })

  it('accepts lossless extended images and skips padded metadata without interpreting its payload', () => {
    const bytes = riff(
      vp8x(0x0c) + chunk('EXIF', 'ANMF!') + lossless.slice(12) + chunk('XMP ', 'ANIM')
    )
    expect(isStaticWebp(bytes)).toBe(true)
    expect(isStaticWebp(riff(vp8x() + chunk('cust', 'a') + lossy.slice(12)))).toBe(true)
  })

  it('rejects every truncated prefix of valid containers', () => {
    for (const data of [lossless, lossy, extended]) {
      for (let length = 0; length < data.length; length++) {
        expect(isStaticWebp(data.slice(0, length))).toBe(false)
      }
    }
  })

  it.each([
    ['animation flag', riff(vp8x(0x02) + lossy.slice(12))],
    ['animated file', animated],
    ['ANIM without the flag', riff(vp8x() + chunk('ANIM', '\0'.repeat(6)) + lossy.slice(12))],
    ['ANMF after the still image', riff(vp8x() + lossy.slice(12) + chunk('ANMF', '\0'.repeat(16)))],
    ['ANMF in a simple file', riff(lossless.slice(12) + chunk('ANMF', 'x'))],
    ['bad RIFF signature', replace(lossless, 0, 'riff')],
    ['wrong format', replace(lossless, 8, 'WAVE')],
    ['incorrect RIFF size', replace(lossless, 4, u32(0))],
    ['trailing bytes', `${lossless}\0\0`],
    ['oversized chunk', replace(lossless, 16, u32(0xffffffff))],
    ['partial chunk header', riff(`${lossless.slice(12)}VP`)],
    ['nonzero padding', `${lossless.slice(0, -1)}\x01`],
    ['empty VP8X', riff(chunk('VP8X', '') + lossy.slice(12))],
    ['reserved flags', riff(vp8x(0x80) + lossy.slice(12))],
    ['reserved bytes', replace(extended, 21, '\x01')],
    ['mismatched dimensions', replace(extended, 24, '\x02')],
    ['duplicate extended header', riff(vp8x() + vp8x() + lossy.slice(12))],
    ['duplicate image', riff(lossless.slice(12) + lossless.slice(12))],
    ['missing image', riff(vp8x())],
    ['lossless signature', replace(lossless, 20, '\0')],
    ['lossless version', replace(lossless, 24, '\x20')],
    ['lossy signature', replace(lossy, 23, '\0')],
    ['interframe', replace(lossy, 20, '\xd1')],
    ['unsupported VP8 version', replace(lossy, 20, '\xd8')],
    ['hidden VP8 frame', replace(lossy, 20, '\xc0')],
    ['oversized VP8 partition', replace(lossy, 20, '\xf0\xff\xff')],
    ['empty VP8 partition', replace(lossy, 20, '\x10\0\0')],
    ['zero width', replace(lossy, 26, '\0\0')],
    ['header-only bitstream', riff(chunk('VP8L', lossless.slice(20, 25)))],
    ['unannounced metadata', riff(vp8x() + lossy.slice(12) + chunk('EXIF', 'x'))],
    ['missing metadata', riff(vp8x(0x08) + lossy.slice(12))],
    [
      'duplicate metadata',
      riff(vp8x(0x08) + lossy.slice(12) + chunk('EXIF', 'x') + chunk('EXIF', 'x'))
    ],
    ['alpha after image', riff(vp8x(0x10) + lossy.slice(12) + chunk('ALPH', '\0x'))],
    ['alpha with lossless', riff(vp8x(0x10) + chunk('ALPH', '\0x') + lossless.slice(12))],
    ['header-only alpha', riff(vp8x(0x10) + chunk('ALPH', '\x01') + lossy.slice(12))],
    ['truncated raw alpha', riff(vp8x(0x10) + chunk('ALPH', '\0xxx') + lossy.slice(12))],
    ['extra raw alpha', riff(vp8x(0x10) + chunk('ALPH', '\0xxxxx') + lossy.slice(12))],
    ['reserved alpha bits', replace(extended, 38, '\xc0')],
    ['unsupported alpha compression', replace(extended, 38, '\x02')],
    ['unsupported alpha preprocessing', replace(extended, 38, '\x20')],
    ['unrecognized container', riff(chunk('cust', 'x'))]
  ])('preserves %s in the original renderer', (_, data) => {
    expect(isStaticWebp(data!)).toBe(false)
  })
})
