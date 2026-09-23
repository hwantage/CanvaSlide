import { describe, expect, it } from 'vitest'
import {
  canRotateSelection,
  elementBox,
  normalizeRotation,
  pointerAngle,
  quadIntersectsRect,
  resizeKeepingOrigin,
  resizeRotatedRect,
  rotatedOrigin,
  rotatedBounds,
  rotatedCorners,
  rotatedHandleAnchors,
  rotateElementAbout,
  rotatePoint,
  rotateRectAbout,
  rotationDragDelta,
  rotationHandlePoint,
  rotationTransform,
  scaleRotatedRectWithin,
  snapRotation,
  toLocalPoint
} from './element-rotation'
import {
  createEmptyDocument,
  defaultShapeStyle,
  defaultTextStyle,
  type CanvasDocument,
  type CanvasElement,
  type ConnectorElement,
  type Point,
  type Rect,
  type ShapeElement
} from './element-types'
import { resizeRect } from './resize-handles'

function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

function expectRect(actual: Rect, expected: Rect) {
  expectPoint(actual, expected)
  expect(actual.width).toBeCloseTo(expected.width, 9)
  expect(actual.height).toBeCloseTo(expected.height, 9)
}

const shape = (id: string, rect: Rect, rotation?: number): ShapeElement => ({
  id,
  type: 'shape',
  shape: 'rectangle',
  ...rect,
  ...(rotation === undefined ? {} : { rotation }),
  style: { ...defaultShapeStyle },
  text: '',
  textStyle: { ...defaultTextStyle }
})

function docWith(...elements: CanvasElement[]): CanvasDocument {
  const doc = createEmptyDocument()
  for (const element of elements) {
    doc.elements[element.id] = element
    doc.order.push(element.id)
  }
  return doc
}

describe('rotation angles', () => {
  it('normalises into (-180, 180] so a full turn is upright', () => {
    expect(normalizeRotation(190)).toBe(-170)
    expect(normalizeRotation(-180)).toBe(180)
    expect(normalizeRotation(540)).toBe(180)
    expect(Object.is(normalizeRotation(360), 0)).toBe(true)
    expect(Object.is(normalizeRotation(-0), 0)).toBe(true)
  })

  it('snaps to 15° steps and measures pointer angles clockwise in screen space', () => {
    expect(snapRotation(22)).toBe(15)
    expect(snapRotation(23)).toBe(30)
    expect(snapRotation(-175)).toBe(180)
    expect(pointerAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90)
    expectPoint(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 })
  })

  it('snaps a lone element to absolute angles and a group by the turn it makes', () => {
    expect(rotationDragDelta(0, 29, null, false)).toBe(29)
    expect(rotationDragDelta(0, 29, null, true)).toBe(30)
    // A lone element at 10° lands on 45°, not on 10° + 30°.
    expect(10 + rotationDragDelta(0, 32, 10, true)).toBe(45)
    // Crossing ±180 keeps the turn short instead of spinning the other way round.
    expect(rotationDragDelta(170, -170, null, false)).toBe(20)
  })

  it('writes a CSS turn only for rotated elements', () => {
    expect(rotationTransform(undefined)).toBeUndefined()
    expect(rotationTransform(0)).toBeUndefined()
    expect(rotationTransform(-30)).toBe('rotate(-30deg)')
  })
})

describe('rotated boxes', () => {
  const box = { x: 0, y: 40, width: 100, height: 20, rotation: 90 }

  it('turns about the centre, so a quarter turn swaps the extent in place', () => {
    expectRect(rotatedBounds(box), { x: 40, y: 0, width: 20, height: 100 })
    expect(rotatedBounds({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
    expectPoint(toLocalPoint(box, { x: 50, y: 0 }), { x: 0, y: 50 })
  })

  it('reads rotation only from rotatable elements', () => {
    expect(elementBox(shape('a', { x: 0, y: 0, width: 10, height: 10 }, 30))).toMatchObject({
      rotation: 30
    })
    expect(elementBox(shape('a', { x: 0, y: 0, width: 10, height: 10 }))).not.toHaveProperty(
      'rotation'
    )
  })

  it('tests overlap against the turned outline, not its bounding box', () => {
    // A square turned 45° is a diamond; its bounding box corners are empty.
    const diamond = rotatedCorners({ x: 0, y: 0, width: 100, height: 100 }, 45)
    expect(quadIntersectsRect(diamond, { x: -20, y: -20, width: 20, height: 20 })).toBe(false)
    expect(quadIntersectsRect(diamond, { x: 40, y: -20, width: 20, height: 20 })).toBe(true)
    expect(quadIntersectsRect(diamond, { x: 45, y: 45, width: 5, height: 5 })).toBe(true)
  })

  it('places handles and the rotation handle on the turned outline', () => {
    const anchors = rotatedHandleAnchors(box)
    expectPoint(anchors.n, { x: 60, y: 50 })
    expectPoint(anchors.e, { x: 50, y: 100 })
    expectPoint(rotationHandlePoint(box, 24), { x: 84, y: 50 })
  })
})

describe('resizing and scaling rotated boxes', () => {
  it('matches an upright resize when not rotated', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(resizeRotatedRect(rect, 'se', { x: 10, y: 5 })).toEqual(
      resizeRect(rect, 'se', { x: 10, y: 5 })
    )
  })

  it('resizes along its own axes and keeps the opposite corner where it was', () => {
    const box = { x: 0, y: 0, width: 100, height: 50, rotation: 90 }
    const fixedBefore = rotatedCorners(box, 90)[0] as Point
    // Turned 90°, the east handle points down the screen.
    const next = resizeRotatedRect(box, 'e', { x: 7, y: 20 })
    expect(next.width).toBeCloseTo(120, 9)
    expect(next.height).toBeCloseTo(50, 9)
    expectPoint(rotatedCorners(next, 90)[0] as Point, fixedBefore)
    const west = resizeRotatedRect(box, 'nw', { x: 10, y: -10 })
    expectPoint(rotatedCorners(west, 90)[2] as Point, rotatedCorners(box, 90)[2] as Point)
  })

  it('retypes a size keeping the visible top-left corner, and upright boxes keep x/y', () => {
    const box = { x: 0, y: 0, width: 100, height: 50, rotation: 90 }
    const wider = resizeKeepingOrigin(box, 200, 50)
    expectPoint(rotatedOrigin({ ...wider, rotation: 90 }), rotatedOrigin(box))
    expect(resizeKeepingOrigin({ x: 3, y: 4, width: 5, height: 6 }, 7, 8)).toEqual({
      x: 3,
      y: 4,
      width: 7,
      height: 8
    })
  })

  it('keeps aspect and the minimum size in the element frame', () => {
    const box = { x: 0, y: 0, width: 100, height: 50, rotation: 30 }
    const kept = resizeRotatedRect(box, 'se', { x: 100, y: 0 }, { keepAspect: true })
    expect(kept.width / kept.height).toBeCloseTo(2, 9)
    const tiny = resizeRotatedRect(box, 'e', { x: -1000, y: 0 })
    expect(tiny.width).toBe(8)
  })

  it('scales with a group: the centre follows and each side takes its own axis length', () => {
    const from = { x: 0, y: 0, width: 200, height: 200 }
    const to = { x: 0, y: 0, width: 400, height: 200 }
    const turned = scaleRotatedRectWithin(
      { x: 50, y: 90, width: 100, height: 20, rotation: 90 },
      from,
      to
    )
    // The long side runs down the screen, so a horizontal stretch thickens it instead.
    expectRect(turned, { x: 150, y: 80, width: 100, height: 40 })
    expect(scaleRotatedRectWithin({ x: 10, y: 10, width: 20, height: 20 }, from, to)).toEqual({
      x: 20,
      y: 10,
      width: 40,
      height: 20
    })
  })
})

describe('turning a selection', () => {
  const connector = (id: string, hostId?: string): ConnectorElement => ({
    id,
    type: 'connector',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    start: hostId ? { x: 0, y: 0, elementId: hostId, side: 'top' } : { x: 100, y: 0 },
    end: { x: 100, y: 100 },
    route: 'straight',
    startHead: 'none',
    endHead: 'arrow',
    style: { stroke: '#000', strokeWidth: 1, dashed: false },
    label: '',
    textStyle: { ...defaultTextStyle }
  })

  it('orbits boxes about the pivot and adds up their own rotation', () => {
    const turned = rotateRectAbout({ x: 90, y: -10, width: 20, height: 20 }, { x: 0, y: 0 }, 90)
    expectRect(turned, { x: -10, y: 90, width: 20, height: 20 })
    expect(turned.rotation).toBe(90)
    expect(
      rotateRectAbout({ x: 0, y: 0, width: 2, height: 2, rotation: 170 }, { x: 1, y: 1 }, 20)
    ).toMatchObject({ x: 0, y: 0, rotation: -170 })
  })

  it('turns free connector ends, leaves attached ends to their hosts and frames alone', () => {
    const patch = rotateElementAbout(connector('c', 'a'), { x: 0, y: 0 }, 90)
    expect(patch).toMatchObject({ start: { elementId: 'a', x: 0, y: 0 } })
    expectPoint((patch as ConnectorElement).end, { x: -100, y: 100 })
    const frame: CanvasElement = {
      id: 'f',
      type: 'frame',
      name: '',
      order: 0,
      x: 0,
      y: 0,
      width: 9,
      height: 9
    }
    expect(rotateElementAbout(frame, { x: 0, y: 0 }, 45)).toEqual({})
  })

  it('offers rotation only when everything selected can turn or follow', () => {
    const frame: CanvasElement = {
      id: 'f',
      type: 'frame',
      name: '',
      order: 0,
      x: 0,
      y: 0,
      width: 9,
      height: 9
    }
    const doc = docWith(shape('a', { x: 0, y: 0, width: 10, height: 10 }), connector('c'), frame)
    expect(canRotateSelection(doc, ['a'])).toBe(true)
    expect(canRotateSelection(doc, ['a', 'c'])).toBe(true)
    expect(canRotateSelection(doc, ['c'])).toBe(false)
    expect(canRotateSelection(doc, ['a', 'f'])).toBe(false)
    expect(canRotateSelection(doc, [])).toBe(false)
  })
})
