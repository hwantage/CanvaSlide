import { describe, expect, it } from 'vitest'
import {
  anchorPoint,
  connectorBounds,
  connectorDistance,
  connectorMidpoint,
  connectorPath,
  facingSide,
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

  it('picks the port facing the other end', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(facingSide(rect, { x: 300, y: 25 })).toBe('right')
    expect(facingSide(rect, { x: 50, y: 300 })).toBe('bottom')
    expect(facingSide(rect, { x: -10, y: -400 })).toBe('top')
    expect(facingSide(rect, { x: 400, y: 300 })).toBe('right')
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
