import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cameraForWorldCenter,
  clampZoom,
  screenToWorld,
  visibleWorldRect,
  wheelDeltaToZoomFactor,
  worldToScreen,
  zoomAtScreenPoint,
  zoomByWheel,
  worldLayerCssTransform,
  layoutZoomFor,
  flightLayoutZoom,
  worldLayoutZoom
} from './camera-transform'

describe('camera-transform', () => {
  it('round-trips world and screen coordinates', () => {
    const camera = { x: 120, y: -40, zoom: 2.5 }
    const world = { x: 33.3, y: -77.7 }
    expect(screenToWorld(camera, worldToScreen(camera, world))).toEqual({
      x: expect.closeTo(world.x, 9),
      y: expect.closeTo(world.y, 9)
    })
  })

  it('clamps zoom to the supported range and rejects NaN', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(1e9)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it('keeps the world point under the cursor fixed when zooming', () => {
    const camera = { x: 50, y: 80, zoom: 1 }
    const anchor = { x: 300, y: 200 }
    const before = screenToWorld(camera, anchor)
    const zoomed = zoomAtScreenPoint(camera, anchor, 3)
    const after = screenToWorld(zoomed, anchor)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(zoomed.zoom).toBe(3)
  })

  it('maps wheel delta to an exponential zoom factor that is symmetric', () => {
    const inFactor = wheelDeltaToZoomFactor(-100)
    const outFactor = wheelDeltaToZoomFactor(100)
    expect(inFactor).toBeGreaterThan(1)
    expect(inFactor * outFactor).toBeCloseTo(1, 12)
    const camera = { x: 0, y: 0, zoom: 1 }
    expect(zoomByWheel(camera, { x: 0, y: 0 }, -100).zoom).toBeCloseTo(inFactor, 12)
    // A pinch delta of -10 boosted 1.5× equals a -15 wheel delta.
    expect(wheelDeltaToZoomFactor(-10, 1.5)).toBeCloseTo(wheelDeltaToZoomFactor(-15), 12)
  })

  it('centers a world point in the viewport', () => {
    const viewport = { width: 800, height: 600 }
    const camera = cameraForWorldCenter({ x: 1000, y: 500 }, 2, viewport)
    const visible = visibleWorldRect(camera, viewport)
    expect(visible.x + visible.width / 2).toBeCloseTo(1000)
    expect(visible.y + visible.height / 2).toBeCloseTo(500)
    expect(visible.width).toBe(400)
  })

  it('scales the laid-out layer only while the zoom differs from the committed one', () => {
    expect(worldLayerCssTransform({ x: 10, y: -5, zoom: 0.5 }, 0.5)).toBe('translate(10px, -5px)')
    expect(worldLayerCssTransform({ x: 10, y: -5, zoom: 1 }, 0.5)).toBe(
      'translate(10px, -5px) scale(2)'
    )
    expect(worldLayerCssTransform({ x: 0, y: 0, zoom: 0.25 }, 1)).toBe(
      'translate(0px, 0px) scale(0.25)'
    )
  })

  it('never lays the world out below 100% so zoomed-out text is not clamped by minimum font sizes', () => {
    expect(layoutZoomFor(0.13)).toBe(1)
    expect(layoutZoomFor(1)).toBe(1)
    expect(layoutZoomFor(2.5)).toBe(2.5)
  })

  it.each([false, true])(
    'settles editing and preview layout at the camera zoom (denseVectors=%s)',
    (denseVectors) => {
      for (const zoom of [0.3, 1, 1.6, 2.4, 4]) {
        const layout = worldLayoutZoom(zoom, denseVectors)
        expect(layout).toBe(Math.max(1, zoom))
        if (zoom >= 1) {
          expect(worldLayerCssTransform({ x: 10, y: -5, zoom }, layout)).toBe(
            'translate(10px, -5px)'
          )
        }
      }
    }
  )

  it('keeps light slideshows at a fixed layout while dense ones follow the zoom', () => {
    expect(worldLayoutZoom(4, false, true)).toBe(1)
    expect(worldLayoutZoom(0.3, false, true)).toBe(1)
    expect(worldLayoutZoom(4, true, true)).toBe(4)
    expect(worldLayoutZoom(0.3, true, true)).toBe(1)
  })

  it('holds the arrival layout through a flight unless it would raise the departure layout', () => {
    const at = (zoom: number) => ({ x: 0, y: 0, zoom })
    expect(flightLayoutZoom(1.174, at(1.174))).toBe(1.174)
    expect(flightLayoutZoom(4, at(1.5))).toBe(1.5)
    expect(flightLayoutZoom(4, at(0.3))).toBe(1)
    expect(flightLayoutZoom(1, at(4))).toBe(1)
    expect(flightLayoutZoom(1.5, at(1.5001))).toBe(1)
  })
})
