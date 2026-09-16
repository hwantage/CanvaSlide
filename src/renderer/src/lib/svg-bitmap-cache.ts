import type { ImageAsset } from '@shared/canvas/element-types'
import { loadImage } from './svg-raster'

async function decodeBitmap(src: string): Promise<HTMLImageElement> {
  const image = await loadImage(src)
  try {
    await image.decode()
    return image
  } catch (error) {
    image.src = ''
    throw error
  }
}

type Entry = {
  users: number
  bytes: number
  image?: HTMLImageElement
  ready: Promise<HTMLImageElement>
}

export function createSvgBitmapCache(decode = decodeBitmap, budget = 64 * 1024 * 1024) {
  const entries = new Map<ImageAsset, Entry>()
  const trim = () => {
    let bytes = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0)
    for (const [asset, entry] of entries) {
      if (bytes <= budget) {
        break
      }
      if (entry.users || !entry.image) {
        continue
      }
      bytes -= entry.bytes
      entry.image.src = ''
      entries.delete(asset)
    }
  }
  return {
    acquire(asset: ImageAsset, src: string) {
      let entry = entries.get(asset)
      if (!entry) {
        const next: Entry = { users: 0, bytes: src.length * 2, ready: decode(src) }
        next.ready = next.ready.then(
          (image) => {
            next.image = image
            next.bytes += image.naturalWidth * image.naturalHeight * 4
            trim()
            return image
          },
          (error: unknown) => {
            entries.delete(asset)
            throw error
          }
        )
        entry = next
      }
      entries.delete(asset)
      entries.set(asset, entry)
      entry.users++
      let released = false
      return {
        ready: entry.ready,
        release() {
          if (!released) {
            released = true
            entry.users--
            trim()
          }
        }
      }
    }
  }
}

export const svgBitmapCache = createSvgBitmapCache()
