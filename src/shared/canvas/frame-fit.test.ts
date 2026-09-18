import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, visibleWorldRect, worldRectToScreen } from './camera-transform'
import { insertElement } from './document-mutations'
import { createEmptyDocument } from './element-types'
import {
  OVERVIEW_FIT_PADDING_RATIO,
  SELECTION_FIT_MAX_ZOOM,
  cameraForOpenedDocument,
  cameraForOverview,
  fitContentToViewport,
  fitOverviewToViewport,
  fitRectToViewport,
  fitSelectionToViewport,
  rolledSpan
} from './frame-fit'

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

  it.each([
    [0, MIN_ZOOM],
    [-1, MIN_ZOOM],
    [MIN_ZOOM / 2, MIN_ZOOM],
    [Number.NaN, 1]
  ])('normalizes a content zoom cap of %s and keeps the content centered', (cap, zoom) => {
    const rect = { x: 100, y: 200, width: 20, height: 40 }
    const camera = fitContentToViewport(rect, viewport, cap)
    expect(camera.zoom).toBe(zoom)
    expect(camera.x + 110 * camera.zoom).toBeCloseTo(viewport.width / 2)
    expect(camera.y + 220 * camera.zoom).toBeCloseTo(viewport.height / 2)
  })

  it.each([
    { width: 800, height: 500 },
    { width: 1400, height: 900 },
    { width: 900, height: 1400 }
  ])('fits distant content below the manual zoom minimum in $width × $height', (size) => {
    for (const bounds of [
      { x: -50_000, y: -10_000, width: 169_000, height: 13_500 },
      { x: -10_000, y: -50_000, width: 13_500, height: 169_000 }
    ]) {
      const camera = fitOverviewToViewport(bounds, size)
      const screen = worldRectToScreen(camera, bounds)
      expect(camera.zoom).toBeGreaterThan(0)
      expect(camera.zoom).toBeLessThan(MIN_ZOOM)
      expect(screen.x).toBeGreaterThan(0)
      expect(screen.y).toBeGreaterThan(0)
      expect(screen.x + screen.width).toBeLessThan(size.width)
      expect(screen.y + screen.height).toBeLessThan(size.height)
      expect(screen.x + screen.width / 2).toBeCloseTo(size.width / 2)
      expect(screen.y + screen.height / 2).toBeCloseTo(size.height / 2)
    }
  })

  it('fits the overview with padding and caps magnification for tiny content', () => {
    const bounds = { x: 120, y: -300, width: 800, height: 400 }
    const camera = fitOverviewToViewport(bounds, viewport)
    expect(camera.zoom).toBeCloseTo(
      fitRectToViewport(bounds, viewport, OVERVIEW_FIT_PADDING_RATIO).zoom
    )
    const screen = worldRectToScreen(camera, bounds)
    expect(screen.x + screen.width / 2).toBeCloseTo(viewport.width / 2)
    expect(screen.y + screen.height / 2).toBeCloseTo(viewport.height / 2)
    expect(fitOverviewToViewport({ ...bounds, width: 1, height: 1 }, viewport).zoom).toBe(MAX_ZOOM)
  })

  it('fits the frame extents without including an oversized, off-center background', () => {
    let document = createEmptyDocument()
    for (const [index, x] of [-1000, 98_600].entries()) {
      document = insertElement(document, {
        id: `f${index}`,
        type: 'frame',
        name: 'Slide',
        order: index,
        x,
        y: 2312.5,
        width: index === 0 ? 70_000 : 26_800,
        height: 39_375
      })
    }
    const expected = cameraForOverview(document, viewport)
    document = insertElement(document, {
      id: 'background',
      type: 'shape',
      shape: 'rectangle',
      x: -72_000,
      y: -60_000,
      width: 280_000,
      height: 160_000,
      text: '',
      textStyle: { color: '#000000', fontSize: 16, align: 'left', bold: false },
      style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, cornerRadius: 0 }
    })
    expect(cameraForOverview(document, viewport)).toEqual(expected)
    const screen = worldRectToScreen(expected!, {
      x: -1000,
      y: 2312.5,
      width: 126_400,
      height: 39_375
    })
    expect(screen.width).toBeGreaterThan(viewport.width * 0.8)
    expect(screen.x + screen.width / 2).toBeCloseTo(viewport.width / 2)
    expect(screen.y + screen.height / 2).toBeCloseTo(viewport.height / 2)
  })

  it('falls back to content only when there are no frames', () => {
    const empty = createEmptyDocument()
    expect(cameraForOverview(empty, viewport)).toBeNull()
    const rect = { x: -8000, y: 900, width: 700, height: 1000 }
    const document = insertElement(empty, {
      ...rect,
      id: 'shape',
      type: 'shape',
      shape: 'rectangle',
      text: '',
      textStyle: { color: '#000000', fontSize: 16, align: 'left', bold: false },
      style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, cornerRadius: 0 }
    })
    expect(cameraForOverview(document, viewport)).toEqual(fitOverviewToViewport(rect, viewport))
  })

  it('zoom-to-selection magnifies small selections but only up to the cap', () => {
    const tiny = { x: 0, y: 0, width: 20, height: 20 }
    expect(fitSelectionToViewport(tiny, viewport).zoom).toBe(SELECTION_FIT_MAX_ZOOM)
    const medium = { x: 0, y: 0, width: 800, height: 400 }
    expect(fitSelectionToViewport(medium, viewport).zoom).toBeCloseTo(1600 / (800 * 1.16), 6)
  })

  it('opens a document fitted to its content, or at the origin when empty', () => {
    expect(cameraForOpenedDocument(createEmptyDocument(), viewport)).toEqual({
      x: 0,
      y: 0,
      zoom: 1
    })
    const doc = insertElement(createEmptyDocument(), {
      id: 'f',
      type: 'frame',
      name: 'F',
      order: 1,
      x: 5000,
      y: 5000,
      width: 800,
      height: 400
    })
    const camera = cameraForOpenedDocument(doc, viewport)
    const visible = visibleWorldRect(camera, viewport)
    expect(visible.x).toBeLessThanOrEqual(5000)
    expect(visible.x + visible.width).toBeGreaterThanOrEqual(5800)
    expect(camera.zoom).toBeLessThanOrEqual(1)
  })
})

describe('rolled frames', () => {
  it('leaves an unrolled rect at its own span', () => {
    expect(rolledSpan({ x: 0, y: 0, width: 400, height: 300 }, 0)).toEqual({
      width: 400,
      height: 300
    })
  })

  it('needs a square rotated 45° to be a diagonal wide', () => {
    const span = rolledSpan({ x: 0, y: 0, width: 100, height: 100 }, 45)
    expect(span.width).toBeCloseTo(Math.SQRT2 * 100, 6)
    expect(span.height).toBeCloseTo(Math.SQRT2 * 100, 6)
  })

  it('is symmetric in the direction of the roll', () => {
    const rect = { x: 0, y: 0, width: 300, height: 120 }
    expect(rolledSpan(rect, 20)).toEqual(rolledSpan(rect, -20))
  })

  it('zooms further out so a rolled frame still fits', () => {
    const rect = { x: 0, y: 0, width: 1600, height: 900 }
    const viewport = { width: 1600, height: 900 }
    const straight = fitRectToViewport(rect, viewport)
    const rolled = fitRectToViewport(rect, viewport, undefined, 15)
    expect(rolled.zoom).toBeLessThan(straight.zoom)
  })

  it('keeps the frame centred whatever the roll', () => {
    const rect = { x: 100, y: 40, width: 400, height: 200 }
    const viewport = { width: 800, height: 600 }
    const rolled = fitRectToViewport(rect, viewport, undefined, 30)
    expect(rolled.x + 300 * rolled.zoom).toBeCloseTo(viewport.width / 2, 6)
    expect(rolled.y + 140 * rolled.zoom).toBeCloseTo(viewport.height / 2, 6)
  })
})
