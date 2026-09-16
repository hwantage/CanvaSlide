import type { ImageAsset } from '@shared/canvas/element-types'
import type { ImageDetailRegion } from '@shared/canvas/image-detail'
import { createSvgImagePreview, originalImagePreview, type ImagePreview } from './svg-image-preview'

type Entry = {
  asset: ImageAsset
  key: string
  controller: AbortController
  users: number
  result?: ImagePreview
  pending: Promise<ImagePreview>
}
type RasterJob = {
  priority: number
  run: () => Promise<ImagePreview>
  resolve: (result: ImagePreview) => void
  reject: (error: unknown) => void
}
const CACHE_BYTES = 128 * 1024 * 1024

export function createSvgPreviewCache(
  create: typeof createSvgImagePreview = createSvgImagePreview,
  budget = CACHE_BYTES
) {
  const entries = new Set<Entry>()
  const lookup = new WeakMap<ImageAsset, Map<string, Entry>>()
  const jobs: RasterJob[] = []
  let busy = false
  const pump = () => {
    if (busy) {
      return
    }
    const job = jobs.sort((a, b) => b.priority - a.priority).shift()
    if (!job) {
      return
    }
    busy = true
    void Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        busy = false
        pump()
      })
  }
  const enqueue = (run: RasterJob['run'], priority: number) =>
    new Promise<ImagePreview>((resolve, reject) => {
      jobs.push({ run, priority, resolve, reject })
      pump()
    })
  const remove = (entry: Entry) => {
    entry.result?.dispose()
    entries.delete(entry)
    const variants = lookup.get(entry.asset)
    if (variants?.get(entry.key) === entry) {
      variants.delete(entry.key)
    }
  }
  const trim = () => {
    let bytes = 0
    let activeBytes = 0
    for (const entry of entries) {
      const size = entry.asset.data.length * 2 + (entry.result?.bytes ?? 0)
      bytes += size
      if (entry.users) {
        activeBytes += size
      }
    }
    // Keep nearby previews warm even when visible images exceed the soft budget.
    const target = Math.max(budget, activeBytes + budget / 4)
    for (const entry of entries) {
      if (bytes <= target) {
        break
      }
      if (entry.users || !entry.result) {
        continue
      }
      bytes -= entry.asset.data.length * 2 + entry.result.bytes
      remove(entry)
    }
  }
  return {
    acquire(asset: ImageAsset, aspect: number, detail?: ImageDetailRegion, priority = 0) {
      const validAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
      const ratio = detail ? validAspect : Number(validAspect.toPrecision(6))
      const key = `${ratio}:${detail ? JSON.stringify(detail) : 'preview'}`
      let variants = lookup.get(asset)
      if (!variants) {
        variants = new Map()
        lookup.set(asset, variants)
      }
      let entry = variants.get(key)
      if (!entry) {
        const next: Entry = {
          asset,
          key,
          controller: new AbortController(),
          users: 0,
          pending: Promise.resolve(originalImagePreview(asset))
        }
        next.pending = enqueue(async () => {
          if (!next.users) {
            remove(next)
            return originalImagePreview(asset)
          }
          try {
            next.result = await create(asset, ratio, detail, next.controller.signal)
          } catch {
            next.result = originalImagePreview(asset)
          }
          if (next.controller.signal.aborted) {
            remove(next)
          }
          trim()
          return next.result
        }, priority)
        entry = next
      }
      entries.delete(entry)
      entries.add(entry)
      variants.set(key, entry)
      entry.users++
      let released = false
      return {
        ready: entry.pending,
        release() {
          if (released) {
            return
          }
          released = true
          entry.users--
          // An interrupted detail render must not delay the next camera flight or replace its image.
          if (!entry.users && detail && !entry.result) {
            entry.controller.abort()
            remove(entry)
          }
          trim()
        }
      }
    }
  }
}

export const svgPreviewCache = createSvgPreviewCache()
// Detail tiles must not evict the previews already warmed for camera flights.
export const svgDetailCache = createSvgPreviewCache(createSvgImagePreview, 64 * 1024 * 1024)
