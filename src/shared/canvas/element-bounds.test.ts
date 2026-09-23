import { describe, expect, it } from 'vitest'
import { connectorDistance, connectorHosts, syncConnectorGeometry } from './connector-geometry'
import { insertElement } from './document-mutations'
import {
  contentBounds,
  elementBounds,
  elementsInBox,
  interpolateRect,
  frameContainingPoint,
  hitTestTopmost,
  rectFromPoints,
  rectsIntersect,
  selectionBounds,
  selectionContainsPoint,
  unionRects,
  visibleBounds
} from './element-bounds'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type ConnectorElement,
  type ShapeElement
} from './element-types'

function docWith(...elements: CanvasElement[]): CanvasDocument {
  const doc = createEmptyDocument()
  for (const e of elements) {
    doc.elements[e.id] = e
    doc.order.push(e.id)
  }
  return doc
}

const shape = (id: string, x: number, y: number, w = 100, h = 100): CanvasElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  x,
  y,
  width: w,
  height: h,
  style: defaultShapeStyle,
  text: '',
  textStyle: defaultTextStyle
})

const frame = (id: string, x: number, y: number, w: number, h: number): CanvasElement => ({
  id,
  type: 'frame',
  name: id,
  order: 1,
  x,
  y,
  width: w,
  height: h
})

describe('element-bounds', () => {
  it('normalizes rects from any two corners', () => {
    expect(rectFromPoints({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({
      x: 0,
      y: 5,
      width: 10,
      height: 5
    })
  })

  it('unions and intersects rects', () => {
    expect(unionRects([])).toBeNull()
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: -5, width: 10, height: 10 }
      ])
    ).toEqual({ x: 0, y: -5, width: 15, height: 15 })
    expect(
      rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 1, height: 1 })
    ).toBe(false)
  })

  it('hit-tests the topmost content element, not frames beneath', () => {
    const doc = docWith(frame('f', 0, 0, 1000, 1000), shape('a', 10, 10), shape('b', 50, 50))
    const chrome = { titleHeight: 24, borderWidth: 8 }
    expect(hitTestTopmost(doc, { x: 60, y: 60 }, chrome)?.id).toBe('b')
    expect(hitTestTopmost(doc, { x: 20, y: 20 }, chrome)?.id).toBe('a')
    expect(hitTestTopmost(doc, { x: 500, y: 500 }, chrome)).toBeNull()
    // Frame title strip sits just above the frame.
    expect(hitTestTopmost(doc, { x: 500, y: -10 }, chrome)?.id).toBe('f')
    // Frame outline band (±4 around each edge) is grabbable; just inside it is not.
    expect(hitTestTopmost(doc, { x: 1002, y: 500 }, chrome)?.id).toBe('f')
    expect(hitTestTopmost(doc, { x: 998, y: 500 }, chrome)?.id).toBe('f')
    expect(hitTestTopmost(doc, { x: 500, y: 997 }, chrome)?.id).toBe('f')
    expect(hitTestTopmost(doc, { x: 990, y: 500 }, chrome)).toBeNull()
    expect(hitTestTopmost(doc, { x: 1010, y: 500 }, chrome)).toBeNull()
    // Content covering the outline still wins.
    const covered = docWith(frame('f', 0, 0, 1000, 1000), shape('c', 950, 450))
    expect(hitTestTopmost(covered, { x: 1000, y: 500 }, chrome)?.id).toBe('c')
  })

  it('box-selects intersecting content but only fully enclosed frames', () => {
    const doc = docWith(frame('f', 0, 0, 1000, 1000), shape('a', 10, 10), shape('b', 600, 600))
    expect(elementsInBox(doc, { x: 0, y: 0, width: 50, height: 50 })).toEqual(['a'])
    expect(elementsInBox(doc, { x: -10, y: -10, width: 1100, height: 1100 })).toEqual([
      'f',
      'a',
      'b'
    ])
  })

  it('selects nested frames independently and requires every edge to be enclosed', () => {
    const doc = docWith(
      frame('outer', 0, 0, 1000, 1000),
      frame('inner', 100, 100, 200, 200),
      shape('content', 150, 150, 50, 50)
    )
    expect(elementsInBox(doc, { x: 100, y: 100, width: 200, height: 200 })).toEqual([
      'inner',
      'content'
    ])
    for (const box of [
      { x: 101, y: 100, width: 199, height: 200 },
      { x: 100, y: 101, width: 200, height: 199 },
      { x: 100, y: 100, width: 199, height: 200 },
      { x: 100, y: 100, width: 200, height: 199 }
    ]) {
      expect(elementsInBox(doc, box)).toEqual(['content'])
    }
  })

  it('drops objects when the box shrinks and normalizes all drag directions', () => {
    const doc = docWith(shape('a', -100, -100), shape('b', 100, 100))
    for (const [start, end] of [
      [
        { x: -50, y: -50 },
        { x: 150, y: 150 }
      ],
      [
        { x: 150, y: 150 },
        { x: -50, y: -50 }
      ],
      [
        { x: -50, y: 150 },
        { x: 150, y: -50 }
      ],
      [
        { x: 150, y: -50 },
        { x: -50, y: 150 }
      ]
    ] as const) {
      expect(elementsInBox(doc, rectFromPoints(start, end))).toEqual(['a', 'b'])
    }
    expect(elementsInBox(doc, { x: -50, y: -50, width: 100, height: 100 })).toEqual(['a'])
    expect(elementsInBox(doc, { x: 1, y: 1, width: 98, height: 98 })).toEqual([])
  })

  it('ignores clipped-away text when the marquee only touches its hidden bounds', () => {
    const doc = docWith({
      id: 'text',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      text: 'Clipped text',
      textStyle: defaultTextStyle,
      clip: { left: 0.5, right: 0, top: 0, bottom: 0 }
    })
    expect(elementsInBox(doc, { x: 10, y: 10, width: 80, height: 80 })).toEqual([])
    expect(elementsInBox(doc, { x: 90, y: 10, width: 20, height: 80 })).toEqual(['text'])
  })

  it('computes selection and content bounds', () => {
    const doc = docWith(shape('a', 0, 0), shape('b', 200, 300, 50, 50))
    expect(selectionBounds(doc, ['a', 'missing'])).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    expect(contentBounds(doc)).toEqual({ x: 0, y: 0, width: 250, height: 350 })
  })
})

describe('hitTestTopmost with elbow connectors', () => {
  function shape(id: string, x: number, y: number): ShapeElement {
    return {
      id,
      type: 'shape',
      shape: 'rectangle',
      x,
      y,
      width: 100,
      height: 100,
      style: { ...defaultShapeStyle },
      text: '',
      textStyle: { ...defaultTextStyle }
    }
  }

  it('hits the rendered route that bends around its hosts, not the unrouted path', () => {
    let doc = insertElement(createEmptyDocument(), shape('a', 0, 0))
    doc = insertElement(doc, shape('b', -150, 0))
    const connector: ConnectorElement = {
      id: 'c',
      type: 'connector',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      route: 'orthogonal',
      startHead: 'none',
      endHead: 'arrow',
      style: { stroke: '#000', strokeWidth: 2, dashed: false },
      label: '',
      textStyle: { ...defaultTextStyle },
      start: { x: 0, y: 0, elementId: 'a', side: 'top', pinned: true },
      end: { x: 0, y: 0, elementId: 'b', side: 'right', pinned: true }
    }
    doc = syncConnectorGeometry(insertElement(doc, connector))
    const element = doc.elements.c as ConnectorElement
    const onRoute = { x: -26, y: -24 }
    const chrome = { titleHeight: 20, borderWidth: 4, lineWidth: 6 }
    // Why: guard the fixture — the unrouted path must be far from this point for the test to mean anything.
    expect(connectorDistance(element, onRoute)).toBeGreaterThan(chrome.lineWidth)
    expect(connectorDistance(element, onRoute, connectorHosts(doc, element))).toBeLessThan(1)
    expect(hitTestTopmost(doc, onRoute, chrome)?.id).toBe('c')
  })
})

describe('hitTestTopmost with a frame hidden under content', () => {
  const chrome = { titleHeight: 24, borderWidth: 8 }
  let doc = createEmptyDocument()
  doc = insertElement(doc, {
    id: 'frame',
    type: 'frame',
    name: 'F',
    order: 1,
    x: 100,
    y: 100,
    width: 200,
    height: 100
  })
  doc = insertElement(doc, {
    id: 'big',
    type: 'shape',
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 600,
    height: 600,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, cornerRadius: 0 },
    text: '',
    textStyle: { color: '#000', fontSize: 16, align: 'left', bold: false }
  })

  it('lets the title strip win even when a larger shape covers it', () => {
    expect(hitTestTopmost(doc, { x: 150, y: 90 }, chrome)?.id).toBe('frame')
  })

  it('still gives the covered outline band and interior to the shape', () => {
    expect(hitTestTopmost(doc, { x: 100, y: 150 }, chrome)?.id).toBe('big')
    expect(hitTestTopmost(doc, { x: 200, y: 150 }, chrome)?.id).toBe('big')
  })
})

describe('frameContainingPoint', () => {
  it('finds the frame whose interior holds the point, else null', () => {
    let doc = createEmptyDocument()
    doc = insertElement(doc, {
      id: 'f',
      type: 'frame',
      name: 'F',
      order: 1,
      x: 100,
      y: 100,
      width: 200,
      height: 100
    })
    expect(frameContainingPoint(doc, { x: 150, y: 150 })?.id).toBe('f')
    expect(frameContainingPoint(doc, { x: 50, y: 50 })).toBeNull()
  })
})

describe('interpolateRect', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 }
  const b = { x: 200, y: 100, width: 300, height: 150 }

  it('lands on each end exactly', () => {
    expect(interpolateRect(a, b, 0)).toEqual(a)
    expect(interpolateRect(a, b, 1)).toEqual(b)
  })

  it('moves and resizes together halfway', () => {
    expect(interpolateRect(a, b, 0.5)).toEqual({ x: 100, y: 50, width: 200, height: 100 })
  })
})

describe('rotated elements', () => {
  // A 100×20 bar turned upright: it covers x 40–60, y 0–100 on the canvas.
  const bar = (id: string): CanvasElement => ({
    ...(shape(id, 0, 40, 100, 20) as ShapeElement),
    rotation: 90
  })
  const chrome = { titleHeight: 20, borderWidth: 4 }

  it('measures the turned extent for selection and content bounds', () => {
    const doc = docWith(bar('a'))
    const bounds = selectionBounds(doc, ['a'])!
    expect(bounds.x).toBeCloseTo(40, 9)
    expect(bounds.y).toBeCloseTo(0, 9)
    expect(bounds.width).toBeCloseTo(20, 9)
    expect(bounds.height).toBeCloseTo(100, 9)
    expect(elementBounds(doc.elements.a!)).toEqual(contentBounds(doc))
  })

  it('hits and marquee-selects the turned outline, not the upright box', () => {
    const doc = docWith(bar('a'))
    expect(hitTestTopmost(doc, { x: 50, y: 5 }, chrome)?.id).toBe('a')
    expect(hitTestTopmost(doc, { x: 5, y: 50 }, chrome)).toBeNull()
    expect(elementsInBox(doc, { x: 45, y: 90, width: 30, height: 30 })).toEqual(['a'])
    expect(elementsInBox(doc, { x: 0, y: 40, width: 30, height: 20 })).toEqual([])
    // A diamond's bounding-box corner is empty canvas.
    const diamond = { ...(shape('d', 0, 0, 100, 100) as ShapeElement), rotation: 45 }
    const diamondDoc = docWith(diamond)
    expect(elementsInBox(diamondDoc, { x: -30, y: -30, width: 35, height: 35 })).toEqual([])
    expect(hitTestTopmost(diamondDoc, { x: 50, y: 50 }, chrome)?.id).toBe('d')
    expect(hitTestTopmost(diamondDoc, { x: 2, y: 2 }, chrome)).toBeNull()
  })

  it('turns clipped text about its whole box', () => {
    const text: CanvasElement = {
      id: 't',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 90,
      text: 'clipped',
      textStyle: defaultTextStyle,
      clip: { top: 0, right: 0.5, bottom: 0, left: 0 }
    }
    const doc = docWith(text)
    // The visible left half turns onto the top half.
    expect(hitTestTopmost(doc, { x: 50, y: 25 }, chrome)?.id).toBe('t')
    expect(hitTestTopmost(doc, { x: 50, y: 75 }, chrome)).toBeNull()
    const visible = visibleBounds(text)
    expect(visible.y).toBeCloseTo(0, 9)
    expect(visible.height).toBeCloseTo(50, 9)
  })

  it('grabs a lone turned element only inside its outline, a group across its bounds', () => {
    const doc = docWith(bar('a'), shape('b', 200, 200, 10, 10))
    expect(selectionContainsPoint(doc, ['a'], { x: 50, y: 50 })).toBe(true)
    expect(selectionContainsPoint(doc, ['a'], { x: 42, y: 2 })).toBe(true)
    const diamondDoc = docWith({ ...(shape('d', 0, 0, 100, 100) as ShapeElement), rotation: 45 })
    expect(selectionContainsPoint(diamondDoc, ['d'], { x: -15, y: -15 })).toBe(false)
    expect(selectionContainsPoint(doc, ['a', 'b'], { x: 100, y: 100 })).toBe(true)
  })
})
