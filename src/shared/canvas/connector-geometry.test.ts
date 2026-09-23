import { describe, expect, it } from 'vitest'
import {
  anchorPoint,
  anchorPorts,
  connectorBounds,
  connectorDistance,
  connectorHosts,
  connectorMidpoint,
  connectorPath,
  facingSide,
  hostsOf,
  nearestAnchorSide,
  remapConnectorHosts,
  syncConnectorGeometry,
  translateConnector
} from './connector-geometry'
import {
  duplicateElements,
  insertElement,
  removeElements,
  translateElements
} from './document-mutations'
import {
  createEmptyDocument,
  defaultConnectorStyle,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type ConnectorElement
} from './element-types'

const shape = (id: string, x: number, y: number) => ({
  id,
  type: 'shape' as const,
  shape: 'rectangle' as const,
  x,
  y,
  width: 100,
  height: 50,
  style: defaultShapeStyle,
  text: '',
  textStyle: defaultTextStyle
})

function connector(partial: Partial<ConnectorElement> = {}): ConnectorElement {
  return {
    id: 'c',
    type: 'connector',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 50 },
    route: 'straight',
    startHead: 'none',
    endHead: 'arrow',
    style: defaultConnectorStyle,
    label: '',
    textStyle: defaultTextStyle,
    ...partial
  }
}

describe('connector-geometry', () => {
  it('offers four side anchors and picks the nearest', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(anchorPoint(rect, 'right')).toEqual({ x: 100, y: 25 })
    expect(nearestAnchorSide(rect, { x: 95, y: 20 })).toBe('right')
    expect(nearestAnchorSide(rect, { x: 50, y: 60 })).toBe('bottom')
  })

  it("puts a triangle's side ports on its slanted edges and keeps apex and base ports", () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(anchorPoint(rect, 'top', 'triangle')).toEqual({ x: 50, y: 0 })
    expect(anchorPoint(rect, 'right', 'triangle')).toEqual({ x: 75, y: 25 })
    expect(anchorPoint(rect, 'bottom', 'triangle')).toEqual({ x: 50, y: 50 })
    expect(anchorPoint(rect, 'left', 'triangle')).toEqual({ x: 25, y: 25 })
    expect(anchorPoint(rect, 'left', 'diamond')).toEqual({ x: 0, y: 25 })
    // Near the slanted edge's port, not the empty box corner beside it.
    expect(nearestAnchorSide(rect, { x: 22, y: 26 }, 'triangle')).toBe('left')
  })

  it('offers a triangle all three corners and side midpoints, and other kinds their four sides', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(anchorPorts('triangle')).toHaveLength(6)
    expect(anchorPoint(rect, 'bottomLeft', 'triangle')).toEqual({ x: 0, y: 50 })
    expect(anchorPoint(rect, 'bottomRight', 'triangle')).toEqual({ x: 100, y: 50 })
    expect(nearestAnchorSide(rect, { x: 3, y: 48 }, 'triangle')).toBe('bottomLeft')
    expect(nearestAnchorSide(rect, { x: 97, y: 49 }, 'triangle')).toBe('bottomRight')
    for (const outline of ['rectangle', 'ellipse', 'diamond', undefined] as const) {
      expect(anchorPorts(outline)).toEqual(['top', 'right', 'bottom', 'left'])
    }
    expect(nearestAnchorSide(rect, { x: 3, y: 48 }, 'rectangle')).toBe('left')
    // Ports turn with the element: upside down, the bottom-left corner lands top right.
    const flipped = { ...rect, rotation: 180 }
    const corner = anchorPoint(flipped, 'bottomLeft', 'triangle')
    expect(corner.x).toBeCloseTo(100)
    expect(corner.y).toBeCloseTo(0)
  })

  it('leaves a base corner along the way that faces the other end', () => {
    const fromCorner = (end: { x: number; y: number }) =>
      connectorPath(
        connector({
          route: 'orthogonal',
          start: { x: 0, y: 50, side: 'bottomLeft' },
          end
        }),
        hostsOf({ ...shape('t', 0, 0), shape: 'triangle' }, null)
      ).polyline[1]
    // Mostly left of the corner: leave horizontally. Mostly below it: leave downward.
    expect(fromCorner({ x: -300, y: 80 })).toMatchObject({ y: 50 })
    expect(fromCorner({ x: -300, y: 80 })?.x).toBeLessThan(0)
    expect(fromCorner({ x: -20, y: 300 })).toMatchObject({ x: 0 })
    expect(fromCorner({ x: -20, y: 300 })?.y).toBeGreaterThan(50)
  })

  it('glues ends attached to a triangle to its outline ports', () => {
    let doc: CanvasDocument = insertElement(createEmptyDocument(), {
      ...shape('a', 0, 0),
      shape: 'triangle'
    })
    doc = insertElement(doc, shape('b', 300, 0))
    doc = insertElement(
      doc,
      connector({
        start: { x: 0, y: 0, elementId: 'a' },
        end: { x: 0, y: 0, elementId: 'b' }
      })
    )
    const c = syncConnectorGeometry(doc).elements.c as ConnectorElement
    expect(c.start).toEqual({ x: 75, y: 25, elementId: 'a', side: 'right' })
    expect(c.end).toEqual({ x: 300, y: 25, elementId: 'b', side: 'left' })
  })

  it('builds straight, orthogonal and curved paths with sensible bounds', () => {
    expect(connectorPath(connector()).d).toBe('M 0 0 L 100 50')
    const elbow = connectorPath(
      connector({
        route: 'orthogonal',
        start: { x: 0, y: 0, side: 'right' },
        end: { x: 100, y: 50, side: 'left' }
      })
    )
    expect(elbow.polyline).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 }
    ])
    const curve = connectorPath(connector({ route: 'curved' }))
    expect(curve.d.startsWith('M 0 0 C')).toBe(true)
    expect(curve.polyline).toHaveLength(25)
    expect(connectorBounds(connector())).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(connectorMidpoint(connector())).toEqual({ x: 50, y: 25 })
  })

  it('routes elbows out of the anchor first, even when the target is behind it', () => {
    // Start leaves to the right, the end is to the upper-left and enters from the right:
    // go out, up, back left — never straight through the start anchor.
    const c = connector({
      route: 'orthogonal',
      start: { x: 100, y: 100, side: 'right' },
      end: { x: 0, y: 0, side: 'right' }
    })
    const { polyline } = connectorPath(c)
    expect(polyline[0]).toEqual({ x: 100, y: 100 })
    expect(polyline[1]).toEqual({ x: 124, y: 100 })
    expect(polyline.at(-2)).toEqual({ x: 124, y: 0 })
    expect(polyline.at(-1)).toEqual({ x: 0, y: 0 })
    // Vertical stack, left port to right port: out left, down, and in from the right.
    const stack = connector({
      route: 'orthogonal',
      start: { x: 0, y: 50, side: 'left' },
      end: { x: 100, y: 250, side: 'right' }
    })
    const points = connectorPath(stack).polyline
    expect(points[1]).toEqual({ x: -24, y: 50 })
    expect(points.at(-2)).toEqual({ x: 124, y: 250 })
  })

  it("clears a triangle's box before an elbow turns, but never the other end's host", () => {
    const box = { width: 200, height: 120 }
    const triangle = { ...shape('t', 0, 0), ...box, shape: 'triangle' as const }
    // The left port sits on the slant at x=50; turning at x=26 would cut the triangle's corner.
    const fromSlant = connector({
      route: 'orthogonal',
      start: { x: 50, y: 60, side: 'left' },
      end: { x: 100, y: 400, side: 'top' }
    })
    expect(connectorPath(fromSlant, hostsOf(triangle, null)).polyline[1]).toEqual({ x: -24, y: 60 })
    // The other end's host overlaps the port and shares its midline; only the port's own host counts.
    const neighbour = { ...shape('n', -50, 0), width: 150, height: 120 }
    expect(connectorPath(fromSlant, hostsOf(triangle, neighbour)).polyline[1]).toEqual({
      x: -24,
      y: 60
    })
    // A port on its own box edge keeps the usual stub.
    const onEdge = connector({
      route: 'orthogonal',
      start: { x: 200, y: 60, side: 'right' },
      end: { x: 100, y: 400, side: 'top' }
    })
    const rectangle = { ...shape('r', 0, 0), ...box }
    expect(connectorPath(onEdge, hostsOf(rectangle, null)).polyline[1]).toEqual({ x: 224, y: 60 })
  })

  it('picks the port facing the other end', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(facingSide(rect, { x: 300, y: 25 })).toBe('right')
    expect(facingSide(rect, { x: 50, y: 300 })).toBe('bottom')
    expect(facingSide(rect, { x: -10, y: -400 })).toBe('top')
    expect(facingSide(rect, { x: 400, y: 300 })).toBe('right')
  })

  it('turns anchors and facing sides with a rotated host', () => {
    // 100×50 turned a quarter: its top port now faces right.
    const turned = { x: 0, y: 0, width: 100, height: 50, rotation: 90 }
    const top = anchorPoint(turned, 'top')
    expect(top.x).toBeCloseTo(75, 9)
    expect(top.y).toBeCloseTo(25, 9)
    expect(facingSide(turned, { x: 400, y: 25 })).toBe('top')
    expect(nearestAnchorSide(turned, { x: 70, y: 25 })).toBe('top')
  })

  it('anchors attached ends on the turned outline and leaves along the turned port', () => {
    let doc: CanvasDocument = insertElement(createEmptyDocument(), {
      ...shape('a', 0, 0),
      rotation: 90
    })
    doc = insertElement(doc, shape('b', 300, 200))
    doc = insertElement(
      doc,
      connector({
        route: 'orthogonal',
        start: { x: 0, y: 0, elementId: 'a', side: 'top', pinned: true },
        end: { x: 0, y: 0, elementId: 'b' }
      })
    )
    doc = syncConnectorGeometry(doc)
    const c = doc.elements.c as ConnectorElement
    expect(c.start).toMatchObject({ elementId: 'a', side: 'top', pinned: true })
    expect(c.start.x).toBeCloseTo(75, 9)
    expect(c.start.y).toBeCloseTo(25, 9)
    expect(c.end).toMatchObject({ x: 300, y: 225, side: 'left' })
    const hosts = connectorHosts(doc, c)
    expect(hosts.start?.rotation).toBe(90)
    expect(hosts.end).toBeUndefined()
    const { polyline } = connectorPath(c, hosts)
    // Out of the turned top port, which now points right, rather than up.
    expect(polyline[1]!.x).toBeGreaterThan(99)
    expect(polyline[1]!.y).toBeCloseTo(25, 9)
    expect(hosts.obstacles[0]!.width).toBeCloseTo(50, 9)
    // Turning the host back carries the pinned end round with it.
    const upright = syncConnectorGeometry({
      ...doc,
      elements: {
        ...doc.elements,
        a: { ...(doc.elements.a as ReturnType<typeof shape>), rotation: 0 }
      }
    })
    expect((upright.elements.c as ConnectorElement).start).toMatchObject({ x: 50, y: 0 })
  })

  it('runs a tilted port elbow stub past its host so the route never cuts through it', () => {
    // A square turned 45° is a diamond; its left port faces up-left and leaves to the left.
    let doc: CanvasDocument = insertElement(createEmptyDocument(), {
      ...shape('a', 0, 0),
      height: 100,
      rotation: 45
    })
    doc = insertElement(doc, shape('b', 300, 300))
    doc = insertElement(
      doc,
      connector({
        route: 'orthogonal',
        start: { x: 0, y: 0, elementId: 'a', side: 'left', pinned: true },
        end: { x: 0, y: 0, elementId: 'b' }
      })
    )
    doc = syncConnectorGeometry(doc)
    const c = doc.elements.c as ConnectorElement
    const hosts = connectorHosts(doc, c)
    const bounds = hosts.obstacles[0]!
    const { polyline } = connectorPath(c, hosts)
    // The first turn happens outside the diamond's bounds, so no later segment crosses it.
    expect(polyline[1]!.x).toBeLessThan(bounds.x)
    expect(polyline[1]!.y).toBeCloseTo(c.start.y, 9)
  })

  it('measures distance to the path for hit testing', () => {
    const c = connector({ end: { x: 100, y: 0 } })
    expect(connectorDistance(c, { x: 50, y: 4 })).toBe(4)
    expect(connectorDistance(c, { x: 150, y: 0 })).toBe(50)
  })

  it('keeps attached ends glued to their hosts and detaches when a host disappears', () => {
    let doc: CanvasDocument = insertElement(createEmptyDocument(), shape('a', 0, 0))
    doc = insertElement(doc, shape('b', 300, 200))
    doc = insertElement(
      doc,
      connector({
        start: { x: 0, y: 0, elementId: 'a', side: 'right' },
        end: { x: 0, y: 0, elementId: 'b', side: 'left' }
      })
    )
    doc = syncConnectorGeometry(doc)
    let c = doc.elements.c as ConnectorElement
    expect(c.start).toEqual({ x: 100, y: 25, elementId: 'a', side: 'right' })
    expect(c.end).toEqual({ x: 300, y: 225, elementId: 'b', side: 'left' })
    expect(c).toMatchObject({ x: 100, y: 25, width: 200, height: 200 })
    expect(syncConnectorGeometry(doc)).toBe(doc)

    doc = syncConnectorGeometry(translateElements(doc, ['b'], { x: 10, y: 0 }))
    c = doc.elements.c as ConnectorElement
    expect(c.end.x).toBe(310)

    // Moving b below a re-ports both ends automatically (bottom → top).
    doc = syncConnectorGeometry(translateElements(doc, ['b'], { x: -310, y: 100 }))
    c = doc.elements.c as ConnectorElement
    expect(c.start.side).toBe('bottom')
    expect(c.end.side).toBe('top')
    doc = syncConnectorGeometry(translateElements(doc, ['b'], { x: 310, y: -100 }))

    // A pinned port stays put no matter where the other end goes.
    doc = syncConnectorGeometry({
      ...doc,
      elements: {
        ...doc.elements,
        c: {
          ...(doc.elements.c as ConnectorElement),
          start: { x: 0, y: 0, elementId: 'a', side: 'top', pinned: true }
        }
      }
    })
    c = doc.elements.c as ConnectorElement
    expect(c.start).toEqual({ x: 50, y: 0, elementId: 'a', side: 'top', pinned: true })

    doc = syncConnectorGeometry(removeElements(doc, ['b']))
    c = doc.elements.c as ConnectorElement
    expect(c.end).toEqual({ x: 310, y: 225 })
  })

  it('translates only free ends and remaps hosts on duplicate', () => {
    const c = connector({
      start: { x: 0, y: 0, elementId: 'a', side: 'right' },
      end: { x: 100, y: 50 }
    })
    const moved = translateConnector(c, { x: 5, y: 5 })
    expect(moved.start).toEqual(c.start)
    expect(moved.end).toEqual({ x: 105, y: 55 })
    expect(remapConnectorHosts(c, new Map([['a', 'a2']]), false).start.elementId).toBe('a2')
    expect(remapConnectorHosts(c, new Map(), false).start).toEqual({ x: 0, y: 0 })
    expect(remapConnectorHosts(c, new Map(), true).start.elementId).toBe('a')

    let doc: CanvasDocument = insertElement(createEmptyDocument(), shape('a', 0, 0))
    doc = insertElement(doc, c)
    let n = 0
    const { document, newIds } = duplicateElements(doc, ['a', 'c'], () => `n${(n += 1)}`)
    const copy = document.elements[newIds[1] as string] as ConnectorElement
    expect(copy.start.elementId).toBe(newIds[0])
  })
})
