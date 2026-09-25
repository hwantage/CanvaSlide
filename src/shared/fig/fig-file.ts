import { Inflate, unzipSync } from 'fflate'
import { Decompress } from 'fzstd'
import { decodeBinarySchema } from 'kiwi-schema'
import { decodeFigMessage } from './fig-kiwi'
import { MAX_FIG_BYTES, type FigFile, type FigNode } from './fig-types'

const MAX_EXPANDED_BYTES = 256 * 1024 * 1024

function expand(bytes: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = []
  let size = 0
  const ondata = (chunk: Uint8Array) => {
    size += chunk.length
    if (size > limit) {
      throw new Error('FIG_LIMIT')
    }
    chunks.push(chunk)
  }
  const zstd = bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd
  const decoder = zstd ? new Decompress(ondata) : new Inflate(ondata)
  decoder.push(bytes, true)
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** Accept both ZIP local copies and the original raw fig-kiwi container. */
export function readFigFile(bytes: Uint8Array, fallbackName = 'Figma'): FigFile {
  if (bytes.length > MAX_FIG_BYTES) {
    throw new Error('FIG_LIMIT')
  }
  let canvas = bytes
  let name = fallbackName
  const images = new Map<string, Uint8Array>()
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let expandedSize = 0
    const archive = unzipSync(bytes, {
      filter(entry) {
        if (
          entry.name !== 'canvas.fig' &&
          entry.name !== 'meta.json' &&
          !/^images\/[a-f0-9]{40}$/i.test(entry.name)
        ) {
          return false
        }
        expandedSize += entry.originalSize
        if (expandedSize > MAX_EXPANDED_BYTES) {
          throw new Error('FIG_LIMIT')
        }
        return true
      }
    })
    canvas = archive['canvas.fig']!
    if (!canvas) {
      throw new Error('FIG_INVALID')
    }
    for (const [key, value] of Object.entries(archive)) {
      if (key.startsWith('images/')) {
        images.set(key.slice(7).toLowerCase(), value)
      }
    }
    if (archive['meta.json']) {
      try {
        const meta: unknown = JSON.parse(new TextDecoder().decode(archive['meta.json']))
        if (
          meta &&
          typeof meta === 'object' &&
          'file_name' in meta &&
          typeof meta.file_name === 'string'
        ) {
          name = meta.file_name
        }
      } catch {
        // Metadata is optional; corrupt metadata must not discard a readable canvas.
      }
    }
  }
  if (
    !canvas ||
    canvas.length < 20 ||
    new TextDecoder().decode(canvas.subarray(0, 8)) !== 'fig-kiwi'
  ) {
    throw new Error('FIG_INVALID')
  }
  const view = new DataView(canvas.buffer, canvas.byteOffset, canvas.byteLength)
  let offset = 12
  const chunk = () => {
    if (offset + 4 > canvas.length) {
      throw new Error('FIG_INVALID')
    }
    const length = view.getUint32(offset, true)
    offset += 4
    if (length === 0 || offset + length > canvas.length) {
      throw new Error('FIG_INVALID')
    }
    const value = canvas.subarray(offset, offset + length)
    offset += length
    return value
  }
  const schema = decodeBinarySchema(expand(chunk(), 4 * 1024 * 1024))
  const message = decodeFigMessage(schema, expand(chunk(), MAX_EXPANDED_BYTES)) as {
    nodeChanges?: FigNode[]
    blobs?: { bytes: Uint8Array }[]
  }
  if (
    !Array.isArray(message.nodeChanges) ||
    message.nodeChanges.length > 100_000 ||
    message.nodeChanges.some(
      (node) =>
        !node.guid || !Number.isFinite(node.guid.sessionID) || !Number.isFinite(node.guid.localID)
    )
  ) {
    throw new Error('FIG_INVALID')
  }
  return { nodes: message.nodeChanges, blobs: message.blobs ?? [], images, name }
}
