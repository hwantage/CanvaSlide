import { z } from 'zod'
import { bytesToBase64 } from './binary-data'
import { imageAssetSchema, type ImageAsset } from './element-types'

const resourceIdSchema = z.string().regex(/^[a-f0-9]{16}[a-z0-9]+(?:-\d+)?$/)
const prefixSchema = z
  .string()
  .regex(/^data:image\/[^,\s]+;base64,$/i)
  .max(256)
const referenceSchema = z.object({
  offset: z.number().int().nonnegative(),
  prefix: prefixSchema,
  resource: resourceIdSchema
})
export const storedAssetSchema = imageAssetSchema.omit({ data: true }).extend({
  source: z.discriminatedUnion('encoding', [
    z.object({ encoding: z.literal('text'), resource: resourceIdSchema }),
    z.object({
      encoding: z.literal('base64'),
      resource: resourceIdSchema,
      prefix: prefixSchema
    }),
    z.object({
      encoding: z.literal('svg'),
      resource: resourceIdSchema,
      prefix: prefixSchema,
      images: z.array(referenceSchema).max(100_000)
    })
  ])
})
export type StoredAsset = z.infer<typeof storedAssetSchema>
export type StoredResource = { bytes: Uint8Array<ArrayBuffer>; compress: boolean }

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const dataUrlPrefixPattern = /^data:image\/[^,\s]+;base64,$/i
const embeddedImagePrefixPattern = /data:image\/(?!svg\+xml)[a-z0-9.+-]+(?:;[^,\s"'<>]*)?;base64,/gi
const base64EndPattern = /[^A-Za-z0-9+/=]/g

function binaryDataUrl(data: string): { prefix: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const comma = data.indexOf(',')
  if (comma < 0 || comma >= 256) {
    return null
  }
  const prefix = data.slice(0, comma + 1)
  if (!dataUrlPrefixPattern.test(prefix)) {
    return null
  }
  try {
    const payload = data.slice(comma + 1)
    const binary = atob(payload)
    // Noncanonical and percent-encoded URLs use the lossless text fallback.
    if (btoa(binary) !== payload) {
      return null
    }
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return { prefix, bytes }
  } catch {
    return null
  }
}

export function createAssetStorage(resources = new Map<string, StoredResource>()): {
  resources: Map<string, StoredResource>
  store: (asset: ImageAsset) => StoredAsset
} {
  const storedBytes = new WeakMap<Uint8Array, string>()
  const imagesByUrl = new Map<string, ReturnType<typeof binaryDataUrl>>()
  const put = (bytes: Uint8Array<ArrayBuffer>, compress: boolean): string => {
    const existing = storedBytes.get(bytes)
    if (existing) {
      return existing
    }
    let a = 0x811c9dc5
    let b = 0x9747b28c
    for (let index = 0; index < bytes.length; index++) {
      a = Math.imul(a ^ bytes[index]!, 0x01000193)
      b = Math.imul(b ^ bytes[index]!, 0x01000193)
    }
    const hash = `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}${bytes.length.toString(36)}`
    let id = hash
    let suffix = 0
    while (resources.has(id)) {
      const prior = resources.get(id)!.bytes
      if (prior.length === bytes.length && prior.every((byte, index) => byte === bytes[index])) {
        break
      }
      id = `${hash}-${++suffix}`
    }
    if (!resources.has(id)) {
      resources.set(id, { bytes, compress })
    }
    storedBytes.set(bytes, id)
    return id
  }
  const store = ({ data, ...asset }: ImageAsset): StoredAsset => {
    const binary = binaryDataUrl(data)
    if (!binary) {
      return { ...asset, source: { encoding: 'text', resource: put(encoder.encode(data), true) } }
    }
    const { prefix, bytes } = binary
    if (!/^data:image\/svg\+xml[;,]/i.test(prefix)) {
      return { ...asset, source: { encoding: 'base64', prefix, resource: put(bytes, false) } }
    }
    let svg: string
    try {
      svg = decoder.decode(bytes)
    } catch {
      return { ...asset, source: { encoding: 'base64', prefix, resource: put(bytes, true) } }
    }
    const images: z.infer<typeof referenceSchema>[] = []
    let removed = 0
    let previous = 0
    const parts: string[] = []
    for (const match of svg.matchAll(embeddedImagePrefixPattern)) {
      const offset = match.index
      base64EndPattern.lastIndex = offset + match[0].length
      const end = base64EndPattern.exec(svg)?.index ?? svg.length
      const url = svg.slice(offset, end)
      if (!imagesByUrl.has(url)) {
        imagesByUrl.set(url, binaryDataUrl(url))
      }
      const image = imagesByUrl.get(url)
      if (!image) {
        continue
      }
      images.push({
        offset: offset - removed,
        prefix: image.prefix,
        resource: put(image.bytes, false)
      })
      removed += url.length
      parts.push(svg.slice(previous, offset))
      previous = end
    }
    parts.push(svg.slice(previous))
    const template = parts.join('')
    return {
      ...asset,
      source: { encoding: 'svg', prefix, resource: put(encoder.encode(template), true), images }
    }
  }
  return { resources, store }
}

export function restoreStoredAsset(
  stored: StoredAsset,
  resource: (id: string) => Uint8Array,
  reserve: (characters: number) => void,
  encodedResource = (id: string) => bytesToBase64(resource(id))
): ImageAsset {
  const { source, ...asset } = stored
  const bytes = resource(source.resource)
  if (source.encoding === 'text') {
    reserve(bytes.length)
    return { ...asset, data: decoder.decode(bytes) }
  }
  if (source.encoding === 'base64') {
    reserve(source.prefix.length + 4 * Math.ceil(bytes.length / 3))
    return { ...asset, data: source.prefix + encodedResource(source.resource) }
  }
  const template = decoder.decode(bytes)
  let length = bytes.length
  let previous = 0
  for (const image of source.images) {
    if (image.offset < previous || image.offset > template.length) {
      throw new Error('Invalid SVG reference offset')
    }
    previous = image.offset
    length += image.prefix.length + 4 * Math.ceil(resource(image.resource).length / 3)
  }
  reserve(source.prefix.length + 4 * Math.ceil(length / 3))
  const parts: string[] = []
  previous = 0
  for (const image of source.images) {
    parts.push(
      template.slice(previous, image.offset),
      image.prefix,
      encodedResource(image.resource)
    )
    previous = image.offset
  }
  parts.push(template.slice(previous))
  return { ...asset, data: source.prefix + bytesToBase64(encoder.encode(parts.join(''))) }
}
