import { describe, expect, it } from 'vitest'
import { worldToScreen } from './camera-transform'
import {
  INK_MIN_STEP_PX,
  inkPathData,
  inkPointSpacing,
  presentationWorldPoint,
  shouldAppendInkPoint
} from './presentation-ink'

describe('inkPointSpacing', () => {
  it('turns the screen-space step into world units and survives a zero zoom', () => {
    expect(inkPointSpacing(1)).toBe(INK_MIN_STEP_PX)
    expect(inkPointSpacing(5)).toBeCloseTo(INK_MIN_STEP_PX / 5)
    expect(inkPointSpacing(0)).toBeGreaterThan(0)
    expect(Number.isFinite(inkPointSpacing(0))).toBe(true)
  })
})

describe('shouldAppendInkPoint', () => {
  it('always takes the first point and then drops samples inside the spacing', () => {
    expect(shouldAppendInkPoint([], { x: 3, y: 4 }, 5)).toBe(true)
    const points = [{ x: 0, y: 0 }]
    expect(shouldAppendInkPoint(points, { x: 3, y: 4 }, 5)).toBe(true)
    expect(shouldAppendInkPoint(points, { x: 2, y: 2 }, 5)).toBe(false)
  })

  it('measures from the last point, not the first', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]
    expect(shouldAppendInkPoint(points, { x: 101, y: 0 }, 5)).toBe(false)
  })
})

describe('inkPathData', () => {
  it('omits release samples that round to the initial point', () => {
    expect(
      inkPathData([
        { x: 1, y: 2 },
        { x: 1.001, y: 2.001 }
      ])
    ).toBe('')
  })

  it('paints nothing until a stroke is a line, so a bare click leaves no mark', () => {
    expect(inkPathData([])).toBe('')
    expect(inkPathData([{ x: 4, y: 6 }])).toBe('')
  })

  it('draws a straight segment between two samples', () => {
    expect(
      inkPathData([
        { x: 0, y: 0 },
        { x: 10, y: 20 }
      ])
    ).toBe('M0,0L10,20')
  })

  it('anchors a quadratic on each interior sample and joins at the midpoints', () => {
    expect(
      inkPathData([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 10 },
        { x: 30, y: 10 }
      ])
    ).toBe('M0,0Q10,0 15,5Q20,10 25,10L30,10')
  })

  it('rounds to hundredths so a long stroke stays a short attribute', () => {
    expect(
      inkPathData([
        { x: 1.234_56, y: 2.345_67 },
        { x: 3.456_78, y: 4.567_89 }
      ])
    ).toBe('M1.23,2.35L3.46,4.57')
  })
})

describe('presentationWorldPoint', () => {
  const camera = { x: 120, y: -40, zoom: 2 }
  const viewport = { width: 800, height: 600 }

  it('matches a plain screen-to-world conversion while the stage is level', () => {
    expect(presentationWorldPoint({ x: 300, y: 200 }, camera, viewport, 0)).toEqual({
      x: (300 - 120) / 2,
      y: (200 + 40) / 2
    })
  })

  it('inverts the stage roll, so a world point round-trips through its rolled screen position', () => {
    const world = { x: 33, y: -17 }
    for (const roll of [15, -30, 90]) {
      const radians = (roll * Math.PI) / 180
      const center = { x: viewport.width / 2, y: viewport.height / 2 }
      const screen = worldToScreen(camera, world)
      const dx = screen.x - center.x
      const dy = screen.y - center.y
      const rolled = {
        x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians)
      }
      const back = presentationWorldPoint(rolled, camera, viewport, roll)
      expect(back.x).toBeCloseTo(world.x)
      expect(back.y).toBeCloseTo(world.y)
    }
  })

  it('leaves the viewport centre where it is whatever the roll', () => {
    const center = { x: 400, y: 300 }
    expect(presentationWorldPoint(center, camera, viewport, 45)).toEqual(
      presentationWorldPoint(center, camera, viewport, 0)
    )
  })
})
