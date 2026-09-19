const alphabet = new TextEncoder().encode(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
)
const decoder = new TextDecoder()

export function bytesToBase64(bytes: Uint8Array): string {
  const encoded = new Uint8Array(4 * Math.ceil(bytes.length / 3))
  let output = 0
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    encoded[output++] = alphabet[a >>> 2]!
    encoded[output++] = alphabet[((a & 3) << 4) | (b >>> 4)]!
    encoded[output++] = alphabet[((b & 15) << 2) | (c >>> 6)]!
    encoded[output++] = alphabet[c & 63]!
  }
  const remainder = bytes.length % 3
  if (remainder !== 0) {
    encoded[encoded.length - 1] = 61
    if (remainder === 1) {
      encoded[encoded.length - 2] = 61
    }
  }
  return decoder.decode(encoded)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
