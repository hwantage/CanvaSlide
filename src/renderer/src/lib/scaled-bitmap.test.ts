import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawScaled } from './scaled-bitmap'

function bitmap(width: number, height: number): HTMLImageElement {
  const img = new Image()
  Object.defineProperties(img, {
    naturalWidth: { value: width },
    naturalHeight: { value: height }
  })
  return img
}

afterEach(() => vi.restoreAllMocks())

describe('drawScaled', () => {
  it.each([
    [4000, 2000, 2048, 2048, 1024],
    [1, 4000, 2048, 1, 2048],
    [100, 50, 2048, 100, 50]
  ])(
    'scales %d × %d to at most %d without upscaling or a zero edge',
    (w, h, max, width, height) => {
      const drawImage = vi.fn()
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage
      } as unknown as CanvasRenderingContext2D)
      const img = bitmap(w, h)
      const result = drawScaled(img, max, () => 'cannot draw')
      expect([result.width, result.height]).toEqual([width, height])
      expect([result.canvas.width, result.canvas.height]).toEqual([width, height])
      expect(drawImage).toHaveBeenCalledWith(img, 0, 0, width, height)
    }
  )

  it.each([
    [Number.NaN, 100, 50],
    [Infinity, 100, 50],
    [0, 100, 50],
    [-1, 100, 50],
    [100, 0, 50],
    [100, 100, 0],
    [100, Number.NaN, 50],
    [100, 100, Infinity]
  ])('rejects invalid dimensions before drawing (max=%s, width=%s, height=%s)', (max, w, h) => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    expect(() => drawScaled(bitmap(w, h), max, () => 'cannot draw')).toThrow('cannot draw')
    expect(context).not.toHaveBeenCalled()
  })
})
