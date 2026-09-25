import { inflateSync } from 'node:zlib'

/** A screenshot's RGBA pixels, decoded in the test process instead of the page under test. */
export type ScreenshotPixels = { width: number; height: number; data: Uint8Array }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  return toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
}

/**
 * Decodes the 8-bit, non-interlaced RGB or RGBA PNG that Playwright screenshots are. Reading one
 * back through a canvas in the page under test once returned none of its pixels in WebKit CI.
 */
export function decodeScreenshot(png: Buffer): ScreenshotPixels {
  if (!png.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG')
  }
  let width = 0,
    height = 0,
    channels = 0
  const compressed: Buffer[] = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colorType, , , interlace] = body.subarray(8)
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`Unsupported PNG: depth ${depth}, color type ${colorType}`)
      }
    } else if (type === 'IDAT') {
      compressed.push(body)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  const filtered = inflateSync(Buffer.concat(compressed))
  const stride = width * channels
  const rows = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)]!
    if (filter > 4) {
      throw new Error(`Unknown PNG filter ${filter}`)
    }
    const source = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? rows[row + x - channels]! : 0
      const up = y > 0 ? rows[row + x - stride]! : 0
      const upLeft = y > 0 && x >= channels ? rows[row + x - stride - channels]! : 0
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, upLeft)
      rows[row + x] = (filtered[source + x]! + predictor) & 0xff
    }
  }
  if (channels === 4) {
    return { width, height, data: rows }
  }
  const data = new Uint8Array(width * height * 4)
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    data.set(rows.subarray(i, i + 3), j)
    data[j + 3] = 255
  }
  return { width, height, data }
}
