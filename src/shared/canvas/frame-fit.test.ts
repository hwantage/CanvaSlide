import { describe, expect, it } from 'vitest'
import { visibleWorldRect } from './camera-transform'
import { fitContentToViewport, fitRectToViewport } from './frame-fit'

describe('frame-fit', () => {
  const viewport = { width: 1600, height: 900 }

  it('contains a wide frame with padding and centers it', () => {
    const frame = { x: 1000, y: 2000, width: 1920, height: 1080 }
    const camera = fitRectToViewport(frame, viewport)
    const visible = visibleWorldRect(camera, viewport)
    expect(visible.x).toBeLessThanOrEqual(frame.x)
    expect(visible.x + visible.width).toBeGreaterThanOrEqual(frame.x + frame.width)
    expect(visible.y + visible.height / 2).toBeCloseTo(frame.y + frame.height / 2, 6)
    expect(camera.zoom).toBeCloseTo(1600 / (1920 * 1.08), 6)
  })

  it('contains a tall frame by height', () => {
    const frame = { x: 0, y: 0, width: 200, height: 1800 }
    const camera = fitRectToViewport(frame, viewport)
    expect(camera.zoom).toBeCloseTo(900 / (1800 * 1.08), 6)
  })

  it('fit-all never zooms past 100%', () => {
    const tiny = { x: 0, y: 0, width: 20, height: 20 }
    expect(fitContentToViewport(tiny, viewport).zoom).toBe(1)
    const huge = { x: 0, y: 0, width: 20_000, height: 20 }
    expect(fitContentToViewport(huge, viewport).zoom).toBeLessThan(1)
  })
})
