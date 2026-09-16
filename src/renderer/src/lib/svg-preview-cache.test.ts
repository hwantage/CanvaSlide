import { describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@shared/canvas/element-types'
import { createSvgPreviewCache } from './svg-preview-cache'

const asset: ImageAsset = {
  id: 'same-id',
  mime: 'image/svg+xml',
  data: '<svg/>',
  width: 66000,
  height: 40000
}
const result = (src = 'blob:preview') => ({ src, bytes: 100, dispose: vi.fn() })

describe('SVG preview cache lifecycle', () => {
  it('shares work for duplicate images, but separates document assets and aspect ratios', async () => {
    const create = vi.fn(async () => result())
    const cache = createSvgPreviewCache(create)
    const a = cache.acquire(asset, 2)
    const b = cache.acquire(asset, 2)
    expect(await a.ready).toBe(await b.ready)
    const c = cache.acquire(asset, 1)
    const d = cache.acquire({ ...asset, data: '<svg id="replacement"/>' }, 2)
    await Promise.all([c.ready, d.ready])
    expect(create).toHaveBeenCalledTimes(3)
    a.release()
    b.release()
    c.release()
    d.release()
  })

  it('does not revoke a preview that is still displayed by another element', async () => {
    const preview = result()
    const cache = createSvgPreviewCache(async () => preview, 0)
    const a = cache.acquire(asset, 2)
    const b = cache.acquire(asset, 2)
    await a.ready
    a.release()
    a.release()
    expect(preview.dispose).not.toHaveBeenCalled()
    b.release()
    expect(preview.dispose).toHaveBeenCalledOnce()
  })

  it('evicts the least recently acquired unused preview under memory pressure', async () => {
    const first = result('blob:first')
    const second = result('blob:second')
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const cache = createSvgPreviewCache(create, 150)
    const a = cache.acquire(asset, 2)
    await a.ready
    a.release()
    const b = cache.acquire({ ...asset }, 2)
    await b.ready
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(second.dispose).not.toHaveBeenCalled()
    b.release()
  })

  it('keeps a briefly hidden neighbor warm when visible images exceed the budget', async () => {
    const large = { ...result('blob:large'), bytes: 180 }
    const small = { ...result('blob:small'), bytes: 8 }
    const create = vi.fn().mockResolvedValueOnce(large).mockResolvedValueOnce(small)
    const cache = createSvgPreviewCache(create, 100)
    const neighbor = { ...asset }
    const a = cache.acquire(asset, 2)
    const b = cache.acquire(neighbor, 2)
    await Promise.all([a.ready, b.ready])
    b.release()
    expect(small.dispose).not.toHaveBeenCalled()
    const c = cache.acquire(neighbor, 2)
    expect(await c.ready).toBe(small)
    expect(create).toHaveBeenCalledTimes(2)
    c.release()
    a.release()
    expect(large.dispose).toHaveBeenCalledOnce()
  })

  it('skips queued work after an image leaves the viewport and serializes decoding', async () => {
    let finish!: (value: ReturnType<typeof result>) => void
    const create = vi.fn(
      () =>
        new Promise<ReturnType<typeof result>>((resolve) => {
          finish = resolve
        })
    )
    const cache = createSvgPreviewCache(create)
    const a = cache.acquire(asset, 2)
    await Promise.resolve()
    const b = cache.acquire({ ...asset }, 2)
    b.release()
    expect(create).toHaveBeenCalledOnce()
    finish(result())
    await a.ready
    await b.ready
    expect(create).toHaveBeenCalledOnce()
    a.release()
  })

  it('falls back after a decode error without blocking later assets', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('decode'))
      .mockResolvedValueOnce(result())
    const cache = createSvgPreviewCache(create)
    const a = cache.acquire(asset, 2)
    expect((await a.ready).src).toBe(asset.data)
    const b = cache.acquire({ ...asset }, 2)
    expect((await b.ready).src).toBe('blob:preview')
    a.release()
    b.release()
  })

  it('cancels obsolete detail and allows the same crop to be requested again', async () => {
    const region = {
      crop: { x: 0.2, y: 0.3, width: 0.01, height: 0.02 },
      pixels: { width: 1024, height: 1024 }
    }
    const signals: AbortSignal[] = []
    const create = vi.fn(
      (_asset: ImageAsset, _aspect: number, _detail: unknown, signal?: AbortSignal) =>
        new Promise<ReturnType<typeof result>>((resolve, reject) => {
          if (!signal) {
            throw new Error('Missing cancellation signal')
          }
          signals.push(signal)
          if (signals.length === 1) {
            signal.addEventListener('abort', () => reject(new Error('cancelled')))
          } else {
            resolve(result('blob:current'))
          }
        })
    )
    const cache = createSvgPreviewCache(create)
    const old = cache.acquire(asset, 2, region)
    await Promise.resolve()
    old.release()
    expect(signals[0]!.aborted).toBe(true)
    const current = cache.acquire(asset, 2, region)
    await old.ready
    expect((await current.ready).src).toBe('blob:current')
    const duplicate = cache.acquire(asset, 2, region)
    expect(await duplicate.ready).toBe(await current.ready)
    expect(create).toHaveBeenCalledTimes(2)
    current.release()
    duplicate.release()
  })

  it('renders foreground detail before queued background layers', async () => {
    let finish!: (value: ReturnType<typeof result>) => void
    const create = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof result>>((resolve) => {
            finish = resolve
          })
      )
      .mockImplementation(async (image: ImageAsset) => result(image.id))
    const cache = createSvgPreviewCache(create)
    const a = cache.acquire(asset, 2)
    await Promise.resolve()
    const background = cache.acquire({ ...asset, id: 'background' }, 2, undefined, 1)
    const foreground = cache.acquire({ ...asset, id: 'foreground' }, 2, undefined, 10)
    finish(result())
    await Promise.all([a.ready, background.ready, foreground.ready])
    expect(create.mock.calls.map(([image]) => image.id)).toEqual([
      'same-id',
      'foreground',
      'background'
    ])
    a.release()
    background.release()
    foreground.release()
  })
})
