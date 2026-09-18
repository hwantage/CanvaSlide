import type { ConnectorElement, ShapeElement } from './element-types'
import { arrowHeadSize } from './connector-geometry'

/** The one SVG primitive a shape kind is drawn with, inset so the stroke stays inside the box. */
export type ShapeGeometry =
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'polygon'; points: string }

/** Geometry for `element` in its own coordinate space (0,0 at the top-left corner). */
export function shapeGeometry(element: ShapeElement): ShapeGeometry {
  const { width: w, height: h, style } = element
  const inset = style.strokeWidth / 2
  switch (element.shape) {
    case 'rectangle':
      return {
        tag: 'rect',
        x: inset,
        y: inset,
        width: Math.max(0, w - inset * 2),
        height: Math.max(0, h - inset * 2),
        rx: style.cornerRadius
      }
    case 'ellipse':
      return { tag: 'ellipse', cx: w / 2, cy: h / 2, rx: w / 2 - inset, ry: h / 2 - inset }
    case 'diamond':
      return {
        tag: 'polygon',
        points: `${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`
      }
  }
}

/** Padding around a connector's bounding box so arrowheads and thick strokes are never clipped. */
export const CONNECTOR_PAD = 24

/** The arrowhead marker every connector shares: a triangle whose tip sits on the line's end. */
export const ARROW_MARKER = {
  viewBox: '0 0 10 10',
  refX: 9,
  refY: 5,
  path: 'M 0 0 L 10 5 L 0 10 z',
  orient: 'auto-start-reverse'
} as const

export function arrowMarkerSize(connector: ConnectorElement): number {
  return arrowHeadSize(connector.style.strokeWidth)
}

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
