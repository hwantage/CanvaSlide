import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset, ImageElement } from '@shared/canvas/element-types'
import { svgPreviewCache } from '@/lib/raster/svg-preview-cache'
import { useImageSource } from './use-image-source'

vi.mock('@/lib/raster/svg-preview-cache', () => ({ svgPreviewCache: { acquire: vi.fn() } }))

const asset: ImageAsset = {
  id: 'vector',
  mime: 'image/svg+xml',
  data: 'data:image/svg+xml,<svg/>',
  width: 20,
  height: 10
}
const element: ImageElement = {
  id: 'image',
  type: 'image',
  assetId: asset.id,
  x: 0,
  y: 0,
  width: 20,
  height: 10,
  naturalWidth: 20,
  naturalHeight: 10
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SVG preview resolution', () => {
  it('reports the displayed SVG raster size when the layout scale changes', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    vi.mocked(svgPreviewCache.acquire).mockReturnValue({
      ready: Promise.resolve({ src: asset.data, bytes: 0, dispose: vi.fn() }),
      release: vi.fn()
    })
    const { result, rerender } = renderHook(
      ({ scale }) => useImageSource(element, asset, true, scale),
      { initialProps: { scale: 16 } }
    )
    await waitFor(() => expect(result.current?.size).toEqual({ width: 640, height: 320 }))
    rerender({ scale: 32 })
    expect(result.current?.size).toEqual({ width: 1280, height: 640 })
    expect(svgPreviewCache.acquire).toHaveBeenCalledOnce()
  })

  it('keeps a prerendered bitmap at its actual resolution regardless of layout scale', async () => {
    const size = { width: 1024, height: 512 }
    vi.mocked(svgPreviewCache.acquire).mockReturnValue({
      ready: Promise.resolve({
        src: 'blob:preview',
        size,
        bytes: 1024 * 512 * 4,
        dispose: vi.fn()
      }),
      release: vi.fn()
    })
    const { result } = renderHook(() => useImageSource(element, asset, true, 64))
    await waitFor(() => expect(result.current?.size).toEqual(size))
  })
})
