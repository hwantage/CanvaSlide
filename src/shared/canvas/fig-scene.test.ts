import {
  FIG_IDENTITY,
  figBounds,
  figChildren,
  figPath,
  figTreeBounds,
  multiplyFigMatrix
} from './fig-scene'
import type { FigFile, FigNode } from './fig-types'

test('composes nested rotation and translation and measures all corners', () => {
  const matrix = multiplyFigMatrix(
    { m00: 0, m01: -1, m02: 100, m10: 1, m11: 0, m12: 20 },
    { ...FIG_IDENTITY, m02: 5, m12: 10 }
  )
  expect(
    figBounds(
      { guid: { sessionID: 0, localID: 1 }, type: 'RECTANGLE', size: { x: 30, y: 10 } },
      matrix
    )
  ).toEqual({ x: 80, y: 25, width: 10, height: 30 })
})

test('sorts by fractional position, omits hidden subtrees, and clips frame bounds', () => {
  const frame: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'FRAME',
    size: { x: 100, y: 100 }
  }
  const child = (id: number, position: string, visible = true): FigNode => ({
    guid: { sessionID: 0, localID: id },
    type: 'ELLIPSE',
    parentIndex: { guid: frame.guid, position },
    visible,
    size: { x: 300, y: 300 }
  })
  const file: FigFile = {
    nodes: [frame, child(2, 'z'), child(3, 'A'), child(4, 'B', false)],
    name: '',
    images: new Map(),
    blobs: []
  }
  const children = figChildren(file)
  expect(children.get('0:1')?.map((n) => n.guid.localID)).toEqual([3, 2])
  expect(figTreeBounds(frame, FIG_IDENTITY, children).width).toBe(100)
  expect(figTreeBounds({ ...frame, frameMaskDisabled: true }, FIG_IDENTITY, children).width).toBe(
    300
  )
})

test('decodes path operations and rejects truncated or non-finite geometry', () => {
  const bytes = new Uint8Array(10)
  bytes[0] = 1
  const view = new DataView(bytes.buffer)
  view.setFloat32(1, 12, true)
  view.setFloat32(5, -3, true)
  bytes[9] = 0
  expect(figPath(bytes)).toBe('M12 -3 Z')
  expect(() => figPath(bytes.subarray(0, 4))).toThrow('FIG_GEOMETRY')
  view.setFloat32(1, Infinity, true)
  expect(() => figPath(bytes)).toThrow('FIG_GEOMETRY')
})

test('decodes quadratic and cubic glyph outlines with different coordinate counts', () => {
  const bytes = new Uint8Array(42)
  bytes[0] = 3
  bytes[17] = 4
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < 4; index += 1) {
    view.setFloat32(1 + index * 4, index + 1, true)
  }
  for (let index = 0; index < 6; index += 1) {
    view.setFloat32(18 + index * 4, index + 5, true)
  }
  expect(figPath(bytes)).toBe('Q1 2 3 4 C5 6 7 8 9 10')
})

test('NaN sizes on auto-sized groups use their children, excluding the group origin', () => {
  const group: FigNode = {
    guid: { sessionID: 0, localID: 1 },
    type: 'FRAME',
    resizeToFit: true,
    size: { x: Number.NaN, y: Number.NaN }
  }
  const child: FigNode = {
    guid: { sessionID: 0, localID: 2 },
    type: 'RECTANGLE',
    size: { x: 10, y: 20 },
    transform: { ...FIG_IDENTITY, m02: 50, m12: 40 }
  }
  expect(figTreeBounds(group, FIG_IDENTITY, new Map([['0:1', [child]]]))).toEqual({
    x: 50,
    y: 40,
    width: 10,
    height: 20
  })
})
