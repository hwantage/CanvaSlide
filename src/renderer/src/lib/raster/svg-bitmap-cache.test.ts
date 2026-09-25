import { describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@shared/canvas/element-types'
import { createSvgBitmapCache } from './svg-bitmap-cache'

const asset: ImageAsset = { id: 'photo', mime: 'image/svg+xml', data: 'svg', width: 10, height: 10 }
const bitmap = () => ({ src: 'photo', naturalWidth: 10, naturalHeight: 10 }) as HTMLImageElement

describe('shared bitmap decoding for SVG detail', () => {
  it('shares pending decoding and keeps it alive when one of two tiles is cancelled', async () => {
    let finish!: (image: HTMLImageElement) => void
    const decode = vi.fn(() => new Promise<HTMLImageElement>((resolve) => (finish = resolve)))
    const cache = createSvgBitmapCache(decode)
    const a = cache.acquire(asset, 'photo')
    const b = cache.acquire(asset, 'photo')
    a.release()
    const image = bitmap()
    finish(image)
    expect(await b.ready).toBe(image)
    expect(decode).toHaveBeenCalledOnce()
    expect(image.src).toBe('photo')
    b.release()
    const revisit = cache.acquire(asset, 'photo')
    expect(await revisit.ready).toBe(image)
    expect(decode).toHaveBeenCalledOnce()
    revisit.release()
  })

  it('evicts unused bitmaps under its budget without disposing a source still being drawn', async () => {
    const first = bitmap()
    const second = bitmap()
    const decode = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const cache = createSvgBitmapCache(decode, 500)
    const a = cache.acquire(asset, 'photo')
    const b = cache.acquire({ ...asset }, 'photo')
    await Promise.all([a.ready, b.ready])
    expect(first.src).toBe('photo')
    a.release()
    a.release()
    expect(first.src).toBe('')
    expect(second.src).toBe('photo')
    b.release()
    expect(second.src).toBe('photo')
  })

  it('reclaims a cancelled pending decode after it completes', async () => {
    let finish!: (image: HTMLImageElement) => void
    const cache = createSvgBitmapCache(
      () => new Promise<HTMLImageElement>((resolve) => (finish = resolve)),
      0
    )
    const lease = cache.acquire(asset, 'photo')
    lease.release()
    const image = bitmap()
    finish(image)
    await lease.ready
    expect(image.src).toBe('')
  })

  it('allows a failed source to be retried', async () => {
    const decode = vi.fn().mockRejectedValueOnce(new Error('decode')).mockResolvedValue(bitmap())
    const cache = createSvgBitmapCache(decode)
    const first = cache.acquire(asset, 'photo')
    await expect(first.ready).rejects.toThrow('decode')
    first.release()
    const retry = cache.acquire(asset, 'photo')
    expect((await retry.ready).src).toBe('photo')
    retry.release()
  })
})
