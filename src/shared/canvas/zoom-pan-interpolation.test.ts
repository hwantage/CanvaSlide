import { describe, expect, it } from 'vitest'
import {
  cameraToZoomView,
  createCameraTween,
  createZoomPanInterpolator,
  easeInOutCubic,
  zoomViewToCamera
} from './zoom-pan-interpolation'

describe('zoom-pan-interpolation', () => {
  it('starts at the source view and ends at the target view', () => {
    const from = { cx: 0, cy: 0, w: 800 }
    const to = { cx: 5000, cy: -3000, w: 200 }
    const i = createZoomPanInterpolator(from, to)
    expect(i.at(0)).toEqual({
      cx: expect.closeTo(from.cx, 6),
      cy: expect.closeTo(from.cy, 6),
      w: expect.closeTo(from.w, 6)
    })
    expect(i.at(1)).toEqual({
      cx: expect.closeTo(to.cx, 6),
      cy: expect.closeTo(to.cy, 6),
      w: expect.closeTo(to.w, 6)
    })
  })

  it('zooms out mid-flight on long jumps (van Wijk & Nuij hump)', () => {
    const i = createZoomPanInterpolator({ cx: 0, cy: 0, w: 400 }, { cx: 10_000, cy: 0, w: 400 })
    const mid = i.at(0.5)
    expect(mid.w).toBeGreaterThan(400)
    expect(mid.cx).toBeCloseTo(5000, 3)
  })

  it('handles pure zoom with no translation', () => {
    const i = createZoomPanInterpolator({ cx: 10, cy: 10, w: 1000 }, { cx: 10, cy: 10, w: 100 })
    expect(i.at(0).w).toBeCloseTo(1000, 6)
    expect(i.at(0.5).w).toBeCloseTo(Math.sqrt(1000 * 100), 3)
    expect(i.at(1).w).toBeCloseTo(100, 6)
    expect(i.pathLength).toBeGreaterThan(0)
  })

  it('has a longer path for farther targets', () => {
    const near = createZoomPanInterpolator({ cx: 0, cy: 0, w: 400 }, { cx: 100, cy: 0, w: 400 })
    const far = createZoomPanInterpolator({ cx: 0, cy: 0, w: 400 }, { cx: 10_000, cy: 0, w: 400 })
    expect(far.pathLength).toBeGreaterThan(near.pathLength)
  })

  it('converts cameras to views and back', () => {
    const viewport = { width: 1200, height: 800 }
    const camera = { x: -300, y: 150, zoom: 1.5 }
    const restored = zoomViewToCamera(cameraToZoomView(camera, viewport), viewport)
    expect(restored.x).toBeCloseTo(camera.x, 9)
    expect(restored.y).toBeCloseTo(camera.y, 9)
    expect(restored.zoom).toBeCloseTo(camera.zoom, 9)
  })

  it('camera tween lands exactly on the target camera', () => {
    const viewport = { width: 1000, height: 700 }
    const from = { x: 0, y: 0, zoom: 1 }
    const to = { x: -4000, y: 2500, zoom: 0.25 }
    const tween = createCameraTween(from, to, viewport)
    const end = tween.at(1)
    expect(end.x).toBeCloseTo(to.x, 6)
    expect(end.y).toBeCloseTo(to.y, 6)
    expect(end.zoom).toBeCloseTo(to.zoom, 9)
    const start = tween.at(0)
    expect(start.zoom).toBeCloseTo(1, 9)
  })

  it('easing is monotonic and clamped', () => {
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
    let prev = 0
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})
