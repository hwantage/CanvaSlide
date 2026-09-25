/** Raster image types recognised by their leading bytes rather than by a declared MIME label. */

export type RasterImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'image/bmp'
  | 'image/x-icon'

/** Enough leading bytes for every signature below, including an AVIF `ftyp` brand list. */
export const IMAGE_SIGNATURE_BYTES = 96

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

// ISO-BMFF: brands after the major brand and minor version list what the file conforms to.
function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') {
    return false
  }
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  // The box must hold its major brand and minor version for a brand to belong to it.
  if (size < 16) {
    return false
  }
  // Callers may pass a whole file; the declared box size must not make detection scan all of it.
  const end = Math.min(size, bytes.length, IMAGE_SIGNATURE_BYTES)
  const brands = [ascii(bytes, 8, 4)]
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(ascii(bytes, offset, 4))
  }
  return brands.some((brand) => brand === 'avif' || brand === 'avis')
}

export function rasterImageMime(bytes: Uint8Array): RasterImageMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return 'image/gif'
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp'
  }
  if (isAvif(bytes)) {
    return 'image/avif'
  }
  if (ascii(bytes, 0, 2) === 'BM') {
    return 'image/bmp'
  }
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return 'image/x-icon'
  }
  return null
}

/** True when the bytes carry the signature of the declared raster type (case-insensitive). */
export function hasImageSignature(bytes: Uint8Array, mime: string): boolean {
  const declared = mime.toLowerCase()
  const detected = rasterImageMime(bytes)
  return (
    detected !== null &&
    (declared === detected ||
      (declared === 'image/vnd.microsoft.icon' && detected === 'image/x-icon'))
  )
}
