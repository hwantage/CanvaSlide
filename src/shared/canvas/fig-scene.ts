import type { Point, Rect } from './element-types'
import { unionRects } from './element-bounds'
import { normalizeRotation, type RotatedRect } from './element-rotation'
import { figId, type FigFile, type FigMatrix, type FigNode, type FigPage } from './fig-types'

export const FIG_IDENTITY: FigMatrix = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 }

export function multiplyFigMatrix(a: FigMatrix, b: FigMatrix): FigMatrix {
  return {
    m00: a.m00 * b.m00 + a.m01 * b.m10,
    m01: a.m00 * b.m01 + a.m01 * b.m11,
    m02: a.m00 * b.m02 + a.m01 * b.m12 + a.m02,
    m10: a.m10 * b.m00 + a.m11 * b.m10,
    m11: a.m10 * b.m01 + a.m11 * b.m11,
    m12: a.m10 * b.m02 + a.m11 * b.m12 + a.m12
  }
}

export function figPoint(matrix: FigMatrix, x: number, y: number): Point {
  return {
    x: matrix.m00 * x + matrix.m01 * y + matrix.m02,
    y: matrix.m10 * x + matrix.m11 * y + matrix.m12
  }
}

export function figBounds(node: FigNode, matrix: FigMatrix): Rect {
  // Auto-sized groups can store NaN; their visible extent comes from their children.
  const width = Number.isFinite(node.size?.x) ? node.size!.x : 0
  const height = Number.isFinite(node.size?.y) ? node.size!.y : 0
  const corners = [
    figPoint(matrix, 0, 0),
    figPoint(matrix, width, 0),
    figPoint(matrix, 0, height),
    figPoint(matrix, width, height)
  ]
  const x = Math.min(...corners.map((p) => p.x))
  const y = Math.min(...corners.map((p) => p.y))
  return {
    x,
    y,
    width: Math.max(0.01, ...corners.map((p) => p.x - x)),
    height: Math.max(0.01, ...corners.map((p) => p.y - y))
  }
}

/** Box and clockwise turn when the matrix only rotates and scales evenly; null otherwise. */
export function figTurnedBox(node: FigNode, matrix: FigMatrix): RotatedRect | null {
  const scale = Math.hypot(matrix.m00, matrix.m10)
  if (
    scale <= 0 ||
    Math.abs(matrix.m00 - matrix.m11) > 1e-6 ||
    Math.abs(matrix.m01 + matrix.m10) > 1e-6
  ) {
    return null
  }
  if (Math.abs(matrix.m10) <= 1e-6 && matrix.m00 > 0) {
    return figBounds(node, matrix)
  }
  const localWidth = Number.isFinite(node.size?.x) ? node.size!.x : 0
  const localHeight = Number.isFinite(node.size?.y) ? node.size!.y : 0
  const width = localWidth * scale
  const height = localHeight * scale
  const center = figPoint(matrix, localWidth / 2, localHeight / 2)
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width: Math.max(0.01, width),
    height: Math.max(0.01, height),
    rotation: normalizeRotation((Math.atan2(matrix.m10, matrix.m00) * 180) / Math.PI)
  }
}

export function figNodeVisible(node: FigNode): boolean {
  return (
    node.visible !== false &&
    node.phase !== 'REMOVED' &&
    !node.internalOnly &&
    (node.opacity ?? 1) > 0
  )
}

export function figClips(node: FigNode): boolean {
  return (
    ['FRAME', 'SYMBOL', 'INSTANCE'].includes(node.type) &&
    !node.resizeToFit &&
    node.frameMaskDisabled !== true
  )
}

export function figChildren(file: FigFile): Map<string, FigNode[]> {
  const children = new Map<string, FigNode[]>()
  for (const node of file.nodes) {
    if (!node.parentIndex || !figNodeVisible(node)) {
      continue
    }
    const parent = figId(node.parentIndex.guid)
    const siblings = children.get(parent) ?? []
    siblings.push(node)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => {
      const left = a.parentIndex?.position ?? ''
      const right = b.parentIndex?.position ?? ''
      return left < right ? -1 : left > right ? 1 : 0
    })
  }
  return children
}

export function figPages(file: FigFile, children = figChildren(file)): FigPage[] {
  return file.nodes
    .filter((node) => node.type === 'CANVAS' && figNodeVisible(node))
    .sort((a, b) => {
      const left = a.parentIndex?.position ?? ''
      const right = b.parentIndex?.position ?? ''
      return left < right ? -1 : left > right ? 1 : 0
    })
    .map((node) => ({
      id: figId(node.guid),
      name: node.name ?? '',
      count: children.get(figId(node.guid))?.length ?? 0
    }))
}

export function figTreeBounds(
  node: FigNode,
  parent: FigMatrix,
  children: Map<string, FigNode[]>,
  depth = 0
): Rect {
  if (depth > 128) {
    throw new Error('FIG_LIMIT')
  }
  const matrix = multiplyFigMatrix(parent, node.transform ?? FIG_IDENTITY)
  const own = figBounds(node, matrix)
  if (figClips(node)) {
    return own
  }
  const nested = (children.get(figId(node.guid)) ?? []).map((child) =>
    figTreeBounds(child, matrix, children, depth + 1)
  )
  if (
    (node.type === 'GROUP' || node.resizeToFit) &&
    nested.length > 0 &&
    !node.fillPaints?.length &&
    !node.strokePaints?.length
  ) {
    return unionRects(nested)!
  }
  const stroke =
    (node.strokePaints?.length ? (node.strokeWeight ?? 1) : 0) *
    Math.max(Math.hypot(matrix.m00, matrix.m10), Math.hypot(matrix.m01, matrix.m11))
  const padded = {
    x: own.x - stroke,
    y: own.y - stroke,
    width: own.width + stroke * 2,
    height: own.height + stroke * 2
  }
  return unionRects([padded, ...nested])!
}

export function intersectFigClip(bounds: Rect, clip?: Rect): Rect | null {
  if (!clip) {
    return bounds
  }
  const x = Math.max(bounds.x, clip.x)
  const y = Math.max(bounds.y, clip.y)
  const right = Math.min(bounds.x + bounds.width, clip.x + clip.width)
  const bottom = Math.min(bounds.y + bounds.height, clip.y + clip.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

/** Figma stores path commands as an opcode followed by little-endian float coordinates. */
export function figPath(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: string[] = []
  const commands = ['Z', 'M', 'L', 'Q', 'C']
  const sizes = [0, 2, 2, 4, 6]
  for (let offset = 0; offset < bytes.length;) {
    const code = bytes[offset++]!
    const count = sizes[code]
    if (count === undefined || offset + count * 4 > bytes.length) {
      throw new Error('FIG_GEOMETRY')
    }
    const numbers: number[] = []
    for (let i = 0; i < count; i += 1) {
      const value = view.getFloat32(offset, true)
      if (!Number.isFinite(value)) {
        throw new Error('FIG_GEOMETRY')
      }
      numbers.push(Math.round(value * 100000) / 100000)
      offset += 4
    }
    parts.push(`${commands[code]}${numbers.join(' ')}`)
  }
  return parts.join(' ')
}
