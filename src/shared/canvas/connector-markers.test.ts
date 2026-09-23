import { describe, expect, it } from 'vitest'
import { arrowHeadSize, connectorPath } from './connector-geometry'
import { connectorDrawing, markerTrim } from './connector-markers'
import {
  arrowHeads,
  connectorElementSchema,
  defaultConnectorStyle,
  defaultTextStyle,
  type ArrowHead,
  type ConnectorElement
} from './element-types'

const connector = (patch: Partial<ConnectorElement> = {}): ConnectorElement => ({
  id: 'c',
  type: 'connector',
  x: 0,
  y: 0,
  width: 100,
  height: 1,
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  route: 'straight',
  startHead: 'none',
  endHead: 'none',
  style: { ...defaultConnectorStyle },
  label: '',
  textStyle: defaultTextStyle,
  ...patch
})

/** Every x, y pair a marker's path passes through (arc radii and flags skipped). */
function markerPoints(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (const part of d.split(/(?=[MLAZ])/)) {
    const numbers = part.slice(1).trim().split(/\s+/).filter(Boolean).map(Number)
    const [x, y] = part.startsWith('A') ? numbers.slice(5) : numbers
    if (x !== undefined && y !== undefined) {
      points.push({ x, y })
    }
  }
  return points
}

const drawnHeads = arrowHeads.filter((head) => head !== 'none')

describe('connector end markers', () => {
  it('draws a plain line exactly along its route when neither end has a marker', () => {
    for (const route of ['straight', 'orthogonal', 'curved'] as const) {
      const element = connector({ route, end: { x: 100, y: 60, side: 'left' } })
      const drawing = connectorDrawing(element)
      expect(drawing.markers).toEqual([])
      expect(drawing.d).toBe(connectorPath(element).d)
      expect(drawing.route).toBe(connectorPath(element).d)
    }
  })

  it('points a filled arrow out of the end and stops the line inside it', () => {
    const size = arrowHeadSize(1)
    const drawing = connectorDrawing(connector({ endHead: 'arrow' }))
    expect(drawing.markers).toEqual([
      { d: `M 100 0 L ${100 - size} ${-size / 2} L ${100 - size} ${size / 2} Z`, filled: true }
    ])
    expect(drawing.d).toBe(`M 0 0 L ${100 - size / 2} 0`)
    expect(drawing.route).toBe('M 0 0 L 100 0')
  })

  it('reverses a start marker so it points outwards, away from the line', () => {
    const size = arrowHeadSize(1)
    const drawing = connectorDrawing(connector({ startHead: 'arrow' }))
    expect(drawing.markers).toEqual([
      { d: `M 0 0 L ${size} ${size / 2} L ${size} ${-size / 2} Z`, filled: true }
    ])
    expect(drawing.d).toBe(`M ${size / 2} 0 L 100 0`)
  })

  it.each(drawnHeads)('keeps a %s marker between the end point and the line', (head) => {
    for (const strokeWidth of [1, 4, 32]) {
      const drawing = connectorDrawing(
        connector({
          startHead: head,
          endHead: head,
          style: { ...defaultConnectorStyle, strokeWidth }
        })
      )
      const [start, end] = drawing.markers
      const size = arrowHeadSize(strokeWidth)
      for (const p of markerPoints(start!.d)) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(size)
      }
      for (const p of markerPoints(end!.d)) {
        expect(p.x).toBeGreaterThanOrEqual(100 - size)
        expect(p.x).toBeLessThanOrEqual(100)
      }
    }
  })

  it('strokes only the open arrow; every other marker is filled', () => {
    const filled = (head: ArrowHead) => connectorDrawing(connector({ endHead: head })).markers[0]
    expect(drawnHeads.filter((head) => !filled(head)!.filled)).toEqual(['openArrow'])
  })

  it('stops the line where the marker still hides its round cap', () => {
    expect(markerTrim('none', 4)).toBe(0)
    expect(markerTrim('openArrow', 4)).toBe(2)
    expect(markerTrim('bar', 4)).toBe(2)
    expect(markerTrim('circle', 4)).toBeCloseTo(arrowHeadSize(4) * 0.4)
    expect(markerTrim('arrow', 4)).toBe(arrowHeadSize(4) / 2)
  })

  it('aligns an elbow marker with its last segment and keeps every corner', () => {
    const element = connector({
      route: 'orthogonal',
      start: { x: 0, y: 0, side: 'right' },
      end: { x: 100, y: 80, side: 'top' }
    })
    const route = connectorPath(element).polyline
    const drawing = connectorDrawing({ ...element, endHead: 'arrow' })
    // The last segment runs down into the top port, so the arrow's base lies above the tip.
    const [tip, ...base] = markerPoints(drawing.markers[0]!.d)
    expect(tip).toEqual({ x: 100, y: 80 })
    expect(base.every((p) => p.y === 80 - arrowHeadSize(1))).toBe(true)
    const corners = route.slice(0, -1).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    expect(drawing.d).toBe(`${corners.join(' ')} L 100 ${80 - arrowHeadSize(1) / 2}`)
  })

  it('points a curved marker along the end tangent', () => {
    const drawing = connectorDrawing(
      connector({ route: 'curved', end: { x: 100, y: 60, side: 'left' }, endHead: 'arrow' })
    )
    // Entering a left port, the curve arrives travelling right: the base sits straight left.
    const [tip, ...base] = markerPoints(drawing.markers[0]!.d)
    expect(tip).toEqual({ x: 100, y: 60 })
    expect(base.map((p) => p.x)).toEqual([100 - arrowHeadSize(1), 100 - arrowHeadSize(1)])
    expect(drawing.d.endsWith(`${100 - arrowHeadSize(1) / 2} 60`)).toBe(true)
  })

  it('never lets two trims on a short line cross', () => {
    const drawing = connectorDrawing(
      connector({ end: { x: 6, y: 0 }, width: 6, startHead: 'arrow', endHead: 'arrow' })
    )
    expect(drawing.d).toBe('M 3 0 L 3 0')
    expect(drawing.markers).toHaveLength(2)
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)(
    'still draws both markers on a zero-length %s connector',
    (route) => {
      const drawing = connectorDrawing(
        connector({ route, end: { x: 0, y: 0 }, startHead: 'circle', endHead: 'diamond' })
      )
      expect(drawing.markers).toHaveLength(2)
      expect(drawing.markers.map((marker) => marker.d).join(' ')).not.toContain('NaN')
      expect(drawing.d).not.toContain('NaN')
    }
  )

  it('accepts every marker kind in documents and rejects unknown ones', () => {
    for (const head of arrowHeads) {
      expect(connectorElementSchema.safeParse(connector({ endHead: head })).success).toBe(true)
    }
    const unknown = { ...connector(), startHead: 'star' }
    expect(connectorElementSchema.safeParse(unknown).success).toBe(false)
  })
})
