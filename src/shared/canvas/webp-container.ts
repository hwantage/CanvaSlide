function uint(data: string, offset: number, size: number): number {
  let value = 0
  for (let i = size - 1; i >= 0; i--) {
    value = value * 256 + data.charCodeAt(offset + i)
  }
  return value
}

function bitstreamSize(type: string, data: string, start: number, length: number) {
  if (type === 'VP8L') {
    if (length <= 5 || data.charCodeAt(start) !== 0x2f) {
      return null
    }
    const bits = uint(data, start + 1, 4)
    return bits >>> 29 === 0
      ? { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      : null
  }
  if (
    length <= 10 ||
    (data.charCodeAt(start) & 1) !== 0 ||
    ((data.charCodeAt(start) >>> 1) & 7) > 3 ||
    (data.charCodeAt(start) & 0x10) === 0 ||
    uint(data, start, 3) >>> 5 === 0 ||
    uint(data, start, 3) >>> 5 >= length - 10 ||
    data.slice(start + 3, start + 6) !== '\x9d\x01\x2a'
  ) {
    return null
  }
  const width = uint(data, start + 6, 2) & 0x3fff
  const height = uint(data, start + 8, 2) & 0x3fff
  return width && height ? { width, height } : null
}

/** Inspect decoded binary bytes, not the MIME label; uncertain containers stay in the live renderer. */
export function isStaticWebp(data: string): boolean {
  if (
    data.length < 20 ||
    data.slice(0, 4) !== 'RIFF' ||
    data.slice(8, 12) !== 'WEBP' ||
    uint(data, 4, 4) !== data.length - 8 ||
    data.length % 2 !== 0
  ) {
    return false
  }
  let extended: { width: number; height: number; flags: number } | undefined
  let image = false
  const chunks = new Set<string>()
  let offset = 12
  let count = 0
  while (offset + 8 <= data.length && count++ < 1024) {
    const type = data.slice(offset, offset + 4)
    const length = uint(data, offset + 4, 4)
    const start = offset + 8
    const end = start + length
    const next = end + (length % 2)
    if (
      next > data.length ||
      (length % 2 !== 0 && data.charCodeAt(end) !== 0) ||
      type === 'ANIM' ||
      type === 'ANMF'
    ) {
      return false
    }
    if (type === 'VP8X') {
      const flags = data.charCodeAt(start)
      if (
        offset !== 12 ||
        length !== 10 ||
        (flags & 0xc3) !== 0 ||
        uint(data, start + 1, 3) !== 0
      ) {
        return false
      }
      extended = {
        width: uint(data, start + 4, 3) + 1,
        height: uint(data, start + 7, 3) + 1,
        flags
      }
      if (extended.width * extended.height > 0xffffffff) {
        return false
      }
    } else if (type === 'VP8 ' || type === 'VP8L') {
      const size = bitstreamSize(type, data, start, length)
      if (
        image ||
        !size ||
        (!extended && offset !== 12) ||
        (type === 'VP8L' && chunks.has('ALPH')) ||
        (type === 'VP8 ' && extended && Boolean(extended.flags & 0x10) !== chunks.has('ALPH')) ||
        (extended && (size.width !== extended.width || size.height !== extended.height))
      ) {
        return false
      }
      image = true
    } else if (!extended) {
      return false
    } else if (type === 'ALPH' || type === 'ICCP' || type === 'EXIF' || type === 'XMP ') {
      const flag = { ALPH: 0x10, ICCP: 0x20, EXIF: 0x08, 'XMP ': 0x04 }[type]!
      if (
        chunks.has(type) ||
        !length ||
        !(extended.flags & flag) ||
        ((type === 'ALPH' || type === 'ICCP') && image) ||
        (type === 'ICCP' && chunks.has('ALPH'))
      ) {
        return false
      }
      if (
        type === 'ALPH' &&
        (length <= 1 ||
          (data.charCodeAt(start) & 0xc0) !== 0 ||
          (data.charCodeAt(start) & 3) > 1 ||
          ((data.charCodeAt(start) >>> 4) & 3) > 1 ||
          ((data.charCodeAt(start) & 3) === 0 && length !== 1 + extended.width * extended.height))
      ) {
        return false
      }
    }
    chunks.add(type)
    offset = next
  }
  if (extended) {
    for (const [type, flag] of [
      ['ICCP', 0x20],
      ['EXIF', 0x08],
      ['XMP ', 0x04]
    ] as const) {
      if (Boolean(extended.flags & flag) !== chunks.has(type)) {
        return false
      }
    }
  }
  return image && offset === data.length
}
