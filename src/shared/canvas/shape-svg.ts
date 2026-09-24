import type { ConnectorElement, Point, Rect, ShapeElement, ShapeKind } from './element-types'

/** The one SVG primitive a shape kind is drawn with, inset so the stroke stays inside the box. */
export type ShapeGeometry =
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'polygon'; points: string }

/** Half the stroke, so the outline stays inside the box, clamped so shapes never invert. */
function strokeInset(element: ShapeElement): Point {
  const inset = element.style.strokeWidth / 2
  // Why: a valid stroke may exceed either edge, but SVG radii and polygon edges must not invert.
  return { x: Math.min(inset, element.width / 2), y: Math.min(inset, element.height / 2) }
}

/** A triangle's stroke centreline in its own coordinates: apex, right base corner, left base corner. */
export function triangleOutline(element: ShapeElement): [Point, Point, Point] {
  const { width: w, height: h } = element
  const inset = strokeInset(element)
  return [
    { x: w / 2, y: inset.y },
    { x: w - inset.x, y: h - inset.y },
    { x: inset.x, y: h - inset.y }
  ]
}

/** Geometry for `element` in its own coordinate space (0,0 at the top-left corner). */
export function shapeGeometry(element: ShapeElement): ShapeGeometry {
  const { width: w, height: h, style } = element
  const { x: insetX, y: insetY } = strokeInset(element)
  switch (element.shape) {
    case 'rectangle':
      return {
        tag: 'rect',
        x: insetX,
        y: insetY,
        width: w - insetX * 2,
        height: h - insetY * 2,
        rx: style.cornerRadius
      }
    case 'ellipse':
      return { tag: 'ellipse', cx: w / 2, cy: h / 2, rx: w / 2 - insetX, ry: h / 2 - insetY }
    case 'diamond':
      return {
        tag: 'polygon',
        points: `${w / 2},${insetY} ${w - insetX},${h / 2} ${w / 2},${h - insetY} ${insetX},${h / 2}`
      }
    case 'triangle':
      return {
        tag: 'polygon',
        points: triangleOutline(element)
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
      }
  }
}

/** Only rectangles draw `cornerRadius`; the other outlines have no radius to apply it to. */
export function shapeUsesCornerRadius(kind: ShapeKind): boolean {
  return kind === 'rectangle'
}

/** Box the label is laid out in, in the shape's own coordinates. */
export function shapeLabelRect(element: ShapeElement): Rect {
  if (element.shape !== 'triangle') {
    return { x: 0, y: 0, width: element.width, height: element.height }
  }
  // Why: the largest box inside a triangle is its lower middle; text there never crosses a slant.
  const [apex, , left] = triangleOutline(element)
  const base = element.width - left.x * 2
  const height = left.y - apex.y
  return { x: left.x + base / 4, y: apex.y + height / 2, width: base / 2, height: height / 2 }
}

/** Padding around a connector's bounding box so arrowheads and thick strokes are never clipped. */
export const CONNECTOR_PAD = 24

/** `stroke-dasharray` for a dashed connector, scaled with the stroke; undefined for a solid line. */
export function connectorDashArray(connector: ConnectorElement): string | undefined {
  const { strokeWidth, dashed } = connector.style
  return dashed ? `${strokeWidth * 3} ${strokeWidth * 2}` : undefined
}

/** The padded box a connector is drawn in, in world units; the SVG's viewBox is the same box. */
export function connectorCanvasRect(connector: ConnectorElement) {
  return {
    x: connector.x - CONNECTOR_PAD,
    y: connector.y - CONNECTOR_PAD,
    width: connector.width + CONNECTOR_PAD * 2,
    height: connector.height + CONNECTOR_PAD * 2
  }
}
