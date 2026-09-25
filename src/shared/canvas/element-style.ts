import type { ConnectorDrawing } from './connector-markers'
import type { ConnectorElement, Point, Rect, ShapeElement, TextStyle } from './element-types'
import { rotationTransform } from './element-rotation'
import { fontStackFor } from './font-family'
import { connectorDashArray, shapeLabelRect } from './shape-svg'

/**
 * How an element is styled, as inline CSS and SVG paint. The editor canvas and the static renderer
 * behind HTML and PDF export both apply these values, so an element draws the same in all three.
 * Values are strings so they suit both a React `style` prop and `CSSStyleDeclaration`.
 */

export type TextCss = {
  color: string
  fontSize: string
  lineHeight: string
  textAlign: TextStyle['align']
  fontWeight: '400' | '700'
  fontStyle: 'italic' | 'normal'
  /** Undefined for the default family, which is inherited from the surface the text sits on. */
  fontFamily: string | undefined
  whiteSpace: 'pre-wrap'
  overflowWrap: 'break-word'
}

export function textCss(style: TextStyle): TextCss {
  return {
    color: style.color,
    fontSize: `${style.fontSize}px`,
    lineHeight: String(style.lineHeight ?? 1.4),
    textAlign: style.align,
    fontWeight: style.bold ? '700' : '400',
    fontStyle: style.italic ? 'italic' : 'normal',
    fontFamily: fontStackFor(style.fontFamily),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word'
  }
}

/** Turn about the unrotated box's centre, even when text renders taller than its stored box. */
export function rotationCss(element: {
  width: number
  height: number
  rotation?: number | undefined
}): { transform?: string; transformOrigin?: string } {
  const transform = rotationTransform(element.rotation)
  return transform
    ? { transform, transformOrigin: `${element.width / 2}px ${element.height / 2}px` }
    : {}
}

/** SVG presentation attributes, camelCased as React spells them. */
export type SvgPaint = {
  fill: string
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'round'
  strokeLinejoin?: 'round'
  strokeDasharray?: string | undefined
}

export function shapePaint(element: ShapeElement): SvgPaint {
  const { fill, stroke, strokeWidth } = element.style
  const paint = { fill, stroke, strokeWidth }
  // Why: a mitred acute corner would poke past the box the half-stroke inset keeps the outline in.
  return element.shape === 'diamond' || element.shape === 'triangle'
    ? { ...paint, strokeLinejoin: 'round' }
    : paint
}

export type SvgPath = SvgPaint & { d: string }

/** The connector's line and end markers, in drawing order. */
export function connectorPaths(
  element: ConnectorElement,
  drawing: ConnectorDrawing
): { line: SvgPath; markers: SvgPath[] } {
  const { stroke, strokeWidth } = element.style
  const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return {
    line: {
      d: drawing.d,
      fill: 'none',
      stroke,
      strokeWidth,
      ...round,
      strokeDasharray: connectorDashArray(element)
    },
    markers: drawing.markers.map((marker) =>
      marker.filled
        ? { d: marker.d, fill: stroke, ...round }
        : { d: marker.d, fill: 'none', stroke, strokeWidth, ...round }
    )
  }
}

/*
 * Label boxes keep the sizes the editor has always drawn them at: its Tailwind spacing resolved on
 * the app's 13px root. Writing them in px gives exports, whose root is 16px, the same boxes.
 */
const SHAPE_LABEL_PADDING = '9.75px'
const CONNECTOR_LABEL_MAX_WIDTH = 208

/** The box a shape's text is centred in, in the shape's own coordinates. */
export function shapeLabelCss(element: ShapeElement) {
  const rect = shapeLabelRect(element)
  return {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: SHAPE_LABEL_PADDING
  } as const
}

/** Widest a connector label grows before it wraps; large type widens it so words stay whole. */
export function connectorLabelMaxWidth(fontSize: number): number {
  return Math.max(CONNECTOR_LABEL_MAX_WIDTH, fontSize * 12)
}

/** The label's box, centred on `mid` inside the connector's drawing `box`. */
export function connectorLabelCss(mid: Point, box: Rect, fontSize: number) {
  return {
    position: 'absolute',
    left: `${mid.x - box.x}px`,
    top: `${mid.y - box.y}px`,
    transform: 'translate(-50%, -50%)',
    boxSizing: 'border-box',
    // Why: sized by the connector's box, a label on a short or vertical line wrapped at every word.
    width: 'max-content',
    minWidth: '19.5px',
    maxWidth: `${connectorLabelMaxWidth(fontSize)}px`,
    padding: '1.625px 4.875px',
    borderRadius: '3.25px',
    background: 'var(--canvas)'
  } as const
}
