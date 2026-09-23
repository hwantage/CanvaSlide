import type { ConnectorElement, ShapeElement } from './element-types'

/** The one SVG primitive a shape kind is drawn with, inset so the stroke stays inside the box. */
export type ShapeGeometry =
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx: number }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'polygon'; points: string }

/** Geometry for `element` in its own coordinate space (0,0 at the top-left corner). */
export function shapeGeometry(element: ShapeElement): ShapeGeometry {
  const { width: w, height: h, style } = element
  const inset = style.strokeWidth / 2
  // Why: a valid stroke may exceed either edge, but SVG radii and polygon edges must not invert.
  const insetX = Math.min(inset, w / 2)
  const insetY = Math.min(inset, h / 2)
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
  }
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
